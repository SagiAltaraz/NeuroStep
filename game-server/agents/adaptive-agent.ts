/**
 * Adaptive Agent — real-time difficulty adjustment (DDA controller)
 *
 * Model: a single normalised difficulty level  D ∈ [0,1]  per game.
 *   0 = easiest anchor, 1 = hardest anchor. Game params are produced by
 *   interpolating between an EASY and a HARD anchor config (paramsFromD).
 *
 * Control loop (every EVAL_EVERY scored events, after MIN_EVENTS):
 *   1. Compute a performance score  P ∈ [0,1]  using a per-domain model:
 *        - 'speed-acc'  → blend of accuracy + speed-vs-baseline (+streak)
 *        - 'accuracy'   → accuracy-dominant (working-memory games)
 *        - 'outcome'    → win/draw/loss ratio (tic-tac-toe)
 *   2. Keep P inside a target band (flow zone). Inside the band → no change
 *      (dead-zone, prevents ping-pong).
 *   3. Outside the band → nudge D proportionally with a clamped step.
 *   4. Map D → absolute game params and send them. The game applies them at
 *      the next round boundary.
 *   5. Persist a *smoothed* D so the next session resumes at the same level
 *      (and a brief end-of-session fatigue dip does not regress the saved level).
 *
 * Library: simple-statistics (mean, standardDeviation, linearRegression).
 */

import { mean, standardDeviation, linearRegression } from 'simple-statistics';
import { getDb }                                      from '../firebase.js';
import type { DifficultyParams, GameId }              from '../types/game.types.js';
import { GAME_DOMAINS }                               from '../types/domains.js';
import { CROSSGAME_TUNING }                           from './progression.config.js';

// ── Controller config ───────────────────────────────────────────────────────────

const EMA_ALPHA       = 0.25;   // smoothing for reaction-time EMA
const TREND_WINDOW    = 12;     // reaction times kept for fatigue regression
const MIN_EVENTS      = 5;      // don't adjust until we have a little data
const MIN_COOLDOWN_MS = 2_500;  // anti-burst only; cadence is event-driven
const STEP_MAX        = 0.12;   // max change to D per adjustment → smooth
const BASE_GAIN       = 0.6;    // proportional gain (step = gain * error)
const D_DEFAULT       = 0.40;   // cold-start level (no saved history)
const DSMOOTH_ALPHA   = 0.30;   // smoothing for the persisted D
const ACCURACY_WINDOW = 16;     // hits/misses kept for the accuracy estimate

// ── Per-session state ─────────────────────────────────────────────────────────

export interface AdaptiveState {
  userId:    string;
  gameId:    GameId;
  sessionId: string;

  // Difficulty level
  D:          number;        // current difficulty 0..1
  dSmoothed:  number;        // slow EMA of D — this is what gets persisted
  profileLoaded: boolean;

  // Reaction-time signals (kept for speed scoring + report-agent)
  emaReactionMs:  number | null;
  baselineMean:   number | null;
  baselineStdDev: number | null;
  reactionWindow: number[];

  // Accuracy sliding window (hits vs misses, last 10)
  accuracyWindow: boolean[];

  // Outcome window for 'outcome' games (win=1, draw=0.5, loss=0, last 8)
  outcomeWindow:  number[];

  // Cadence / throttle
  lastAdjustAt:      number;
  totalScoredEvents: number;
  lastEvalCount:     number;  // totalScoredEvents at last evaluation
}

export function createAdaptiveState(sessionId: string, gameId: GameId, userId: string): AdaptiveState {
  return {
    userId, gameId, sessionId,
    D:              D_DEFAULT,
    dSmoothed:      D_DEFAULT,
    profileLoaded:  false,
    emaReactionMs:  null,
    baselineMean:   null,
    baselineStdDev: null,
    reactionWindow: [],
    accuracyWindow: [],
    outcomeWindow:  [],
    lastAdjustAt:      0,
    totalScoredEvents: 0,
    lastEvalCount:     0,
  };
}

// ── Per-game tuning ─────────────────────────────────────────────────────────────

type PMode = 'speed-acc' | 'accuracy' | 'outcome';

interface GameTuning {
  pMode:       PMode;
  target:      number;                 // P target centre (flow zone)
  band:        number;                 // dead-zone half-width
  evalEvery:   number;                 // scored events between evaluations
  weights?:    { acc: number; speed: number; streak: number };  // speed-acc only
  gain?:       number;                 // proportional gain (default BASE_GAIN)
  stepMax?:    number;                 // max |ΔD| per adjustment (default STEP_MAX)
  outcomeWindow?: number;              // window size for 'outcome' mode (default 8)
  anchors:     Record<string, [number, number]>;  // [easy(D=0), hard(D=1)]
  discreteKeys?: string[];             // rounded to integer
  evenKeys?:     string[];             // rounded to nearest even (pairs)
}

const GAME_TUNING: Record<GameId, GameTuning> = {
  'shapes-click': {
    pMode: 'speed-acc', target: 0.72, band: 0.07, evalEvery: 4,
    weights: { acc: 0.4, speed: 0.5, streak: 0.1 },
    anchors: { circleLifeMs: [3500, 900], distractorCount: [0, 5] },
    discreteKeys: ['distractorCount'],
  },
  'color-trains': {
    pMode: 'speed-acc', target: 0.72, band: 0.07, evalEvery: 4,
    weights: { acc: 0.4, speed: 0.5, streak: 0.1 },
    anchors: { trainSpeedPx: [80, 260], reactionMs: [9000, 2500] },
  },
  'green-light': {
    pMode: 'speed-acc', target: 0.72, band: 0.07, evalEvery: 4,
    weights: { acc: 0.5, speed: 0.4, streak: 0.1 },
    anchors: { greenWindowMs: [1500, 550], redHoldMinMs: [1400, 3200], redHoldMaxMs: [2600, 5200] },
  },
  'spot-difference': {
    pMode: 'speed-acc', target: 0.72, band: 0.07, evalEvery: 4,
    weights: { acc: 0.55, speed: 0.35, streak: 0.1 },
    anchors: { gridSize: [3, 7], similarity: [0.15, 0.92], roundTimeoutMs: [12000, 3500] },
    discreteKeys: ['gridSize'],
  },
  'find-letter': {
    pMode: 'speed-acc', target: 0.72, band: 0.07, evalEvery: 4,
    weights: { acc: 0.5, speed: 0.4, streak: 0.1 },
    anchors: { gridSize: [4, 9], roundTimeoutMs: [18000, 5000], distractorBoost: [0, 0.85] },
    discreteKeys: ['gridSize'],
  },
  'where-was-it': {
    pMode: 'accuracy', target: 0.72, band: 0.08, evalEvery: 2,
    anchors: { sequenceLength: [3, 9], flashDurationMs: [900, 280] },
    discreteKeys: ['sequenceLength'],
  },
  'memory': {
    pMode: 'accuracy', target: 0.72, band: 0.08, evalEvery: 3,
    anchors: { cardCount: [6, 24], flipTimeMs: [1600, 450] },
    evenKeys: ['cardCount'],
  },
  'tictactoe': {
    // Outcomes are very noisy (win/loss/draw), so this controller is deliberately
    // slow & coarse: a wide dead-zone, gentle gain, small steps and a long window
    // average out luck instead of chasing it.
    pMode: 'outcome', target: 0.58, band: 0.15, evalEvery: 3,
    gain: 0.35, stepMax: 0.06, outcomeWindow: 14,
    anchors: { aiDepth: [1, 6] },
    discreteKeys: ['aiDepth'],
  },
};

// ── Event classification ────────────────────────────────────────────────────────

// Events that count as a "hit" for accuracy.
const HIT_TYPES: Record<string, Set<string>> = {
  'shapes-click':    new Set(['CIRCLE_HIT']),
  'color-trains':    new Set(['STATION_SELECTED']),
  'memory':          new Set(['PAIR_MATCHED']),
  'green-light':     new Set(['GO_HIT']),
  'spot-difference': new Set(['ODD_HIT']),
  'where-was-it':    new Set(['SEQUENCE_COMPLETE']),
  'find-letter':     new Set(['LETTER_HIT', 'ROUND_COMPLETE']),
};

// Coarse per-event classification, shared with the server's in-process session
// tracker (the Kafka-independent snapshot fallback).
export function classifyEvent(gameId: string, type: string): 'hit' | 'miss' | 'timeout' | 'neutral' {
  if (HIT_TYPES[gameId]?.has(type)) return 'hit';
  if (!SCORED_TYPES[gameId]?.has(type)) return 'neutral';
  if (type === 'TIMEOUT' || (gameId === 'green-light' && type === 'MISS')) return 'timeout';
  return 'miss';
}

// Events that count toward accuracy denominator (hit OR miss).
const SCORED_TYPES: Record<string, Set<string>> = {
  'shapes-click':    new Set(['CIRCLE_HIT', 'DISTRACTOR_CLICK', 'TIMEOUT']),
  'color-trains':    new Set(['STATION_SELECTED', 'MISSED_SWITCH', 'ROUND_END']),
  'memory':          new Set(['PAIR_MATCHED', 'PAIR_MISSED']),
  'green-light':     new Set(['GO_HIT', 'FALSE_START', 'MISS']),
  'spot-difference': new Set(['ODD_HIT', 'WRONG_PICK', 'TIMEOUT']),
  'where-was-it':    new Set(['SEQUENCE_COMPLETE', 'SEQUENCE_FAIL']),
  'find-letter':     new Set(['LETTER_HIT', 'ROUND_COMPLETE', 'WRONG_PICK', 'TIMEOUT']),
};

// ── Firebase profile (baseline + saved difficulty) ──────────────────────────────

async function loadProfile(
  userId: string, gameId: GameId,
): Promise<{ mean: number | null; stdDev: number | null; difficulty: number | null }> {
  if (userId === 'anonymous') return { mean: null, stdDev: null, difficulty: null };
  try {
    const doc = await getDb().collection('users').doc(userId).collection('stats').doc(gameId).get();
    if (!doc.exists) return { mean: null, stdDev: null, difficulty: null };
    const d = doc.data()!;
    const mean   = typeof d.avgReactionMs    === 'number' ? d.avgReactionMs    : null;
    const stdDev = typeof d.stdDevReactionMs === 'number' ? d.stdDevReactionMs : null;
    const difficulty = typeof d.difficultyLevel === 'number' ? d.difficultyLevel : null;
    return { mean, stdDev, difficulty };
  } catch { return { mean: null, stdDev: null, difficulty: null }; }
}

/**
 * Load the saved baseline + difficulty into the state exactly once. Returns the
 * resumed difficulty params when a saved difficulty was applied (so the caller
 * can snap the game to it immediately), otherwise null. Idempotent — guarded by
 * `state.profileLoaded`.
 */
async function ensureProfileLoaded(state: AdaptiveState): Promise<DifficultyParams | null> {
  if (state.profileLoaded) return null;
  state.profileLoaded = true;
  const p = await loadProfile(state.userId, state.gameId);
  state.baselineMean   = p.mean;
  state.baselineStdDev = p.stdDev;
  if (p.difficulty !== null) {
    // Ease-in: open a touch BELOW the saved level and let the controller ramp
    // back up to it, so a returning player warms up smoothly instead of being
    // dropped straight into full difficulty (the "jarring jump" after session 1).
    const warmed    = clamp01(p.difficulty * CROSSGAME_TUNING.RESUME_FACTOR);
    state.D         = warmed;
    state.dSmoothed = p.difficulty;   // keep the true converged level as the EMA target
    return paramsFromD(state.gameId, state.D);
  }
  return null;
}

/**
 * Server-side hook: prime baseline + resumed difficulty before the first event,
 * so the game can be snapped to the resumed difficulty up-front (Phase E1).
 * Returns the resumed params, or null if there was nothing to resume.
 */
export function resumeDifficulty(state: AdaptiveState): Promise<DifficultyParams | null> {
  return ensureProfileLoaded(state);
}

/** Persist the smoothed difficulty level so the next session resumes here. */
export async function persistDifficulty(userId: string, gameId: GameId, dSmoothed: number): Promise<void> {
  if (userId === 'anonymous') return;
  try {
    const ref = getDb().collection('users').doc(userId).collection('stats').doc(gameId);
    await ref.set({
      difficultyLevel:     Math.round(clamp01(dSmoothed) * 1000) / 1000,
      difficultyUpdatedAt: Date.now(),
    }, { merge: true });
  } catch { /* non-critical */ }
}

// ── Cross-game warm-up transfer (A2) ─────────────────────────────────────────

/**
 * Derive a 0..100 starting level for a game the user has NOT played before, from
 * the cognitive-profile levels of the domains that game trains. Ability lives at
 * the DOMAIN level (shared across games), so a strong working-memory profile
 * should let a brand-new memory game open above the cold-start floor.
 *
 * Returns a confidence-weighted blend of the game's primary + secondary domain
 * levels, or null when there isn't enough trustworthy signal (anonymous user,
 * no profile, or every relevant domain below MIN_CONFIDENCE). null → cold start.
 */
export async function seedLevelFromProfile(userId: string, gameId: GameId): Promise<number | null> {
  if (userId === 'anonymous') return null;

  const { primary, secondary } = GAME_DOMAINS[gameId];
  const weights = new Map<string, number>([[primary, CROSSGAME_TUNING.W_PRIMARY]]);
  for (const d of secondary) weights.set(d, CROSSGAME_TUNING.W_SECONDARY);

  try {
    const col = getDb().collection('users').doc(userId).collection('cognitiveProfile');
    const snaps = await Promise.all([...weights.keys()].map(d => col.doc(d).get()));

    let numerator = 0;   // Σ level · weight · confidence
    let denominator = 0; // Σ weight · confidence
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const d = snap.data()!;
      const level      = typeof d.level === 'number' ? d.level : null;
      const confidence = typeof d.confidence === 'number' ? d.confidence : 0;
      if (level === null || confidence < CROSSGAME_TUNING.MIN_CONFIDENCE) continue;
      const weight = weights.get(d.domainId) ?? weights.get(snap.id) ?? 0;
      numerator   += level * weight * confidence;
      denominator += weight * confidence;
    }

    if (denominator === 0) return null;
    return numerator / denominator;
  } catch {
    return null;
  }
}

/**
 * Warm-start this session's difficulty from a cross-game seed level (0..100),
 * damped by WARMUP_FACTOR. Mutates state.D + dSmoothed and returns the matching
 * params so the server can snap the game up-front. Call only before the first
 * event, when there is no same-game saved difficulty to resume.
 */
export function applyWarmupSeed(state: AdaptiveState, seedLevel: number): DifficultyParams {
  const D = clamp01(CROSSGAME_TUNING.WARMUP_FACTOR * seedLevel / 100);
  state.D         = D;
  state.dSmoothed = D;
  return paramsFromD(state.gameId, D);
}

// ── Public event/result shapes ──────────────────────────────────────────────────

export interface AdaptiveEvent {
  type:        string;
  reactionMs?: number;
  correct?:    boolean;
  winner?:     'player' | 'ai';   // tic-tac-toe GAME_WON
}

export interface AdaptiveResult {
  adjusted:  boolean;
  direction?: 'harder' | 'easier';
  reason?:   string;
  params?:   DifficultyParams;
  debug?: {
    P:        number | null;
    D:        number;
    accuracy: number;
    ema:      number | null;
    baseline: number | null;
  };
}

// ── Core update ──────────────────────────────────────────────────────────────────

export async function processEvent(state: AdaptiveState, event: AdaptiveEvent): Promise<AdaptiveResult> {
  const tuning      = GAME_TUNING[state.gameId];
  if (!tuning) return { adjusted: false };

  const hitTypes    = HIT_TYPES[state.gameId]    ?? new Set<string>();
  const scoredTypes = SCORED_TYPES[state.gameId] ?? new Set<string>();

  // Load personal profile once per session (baseline + saved difficulty). The
  // server normally primes this via resumeDifficulty() before the first event;
  // this lazy call is the fallback path when it didn't.
  await ensureProfileLoaded(state);

  // ── Ingest the event per scoring mode ──────────────────────────
  if (tuning.pMode === 'outcome') {
    // Only completed games drive the controller; individual moves are ignored.
    if (event.type === 'GAME_WON')      state.outcomeWindow.push(event.winner === 'ai' ? 0 : 1);
    else if (event.type === 'GAME_DRAW') state.outcomeWindow.push(0.5);
    else return { adjusted: false };
    if (state.outcomeWindow.length > (tuning.outcomeWindow ?? 8)) state.outcomeWindow.shift();
    state.totalScoredEvents++;
  } else {
    if (!scoredTypes.has(event.type)) return { adjusted: false };
    state.totalScoredEvents++;

    const isHit = hitTypes.has(event.type);
    state.accuracyWindow.push(isHit);
    if (state.accuracyWindow.length > ACCURACY_WINDOW) state.accuracyWindow.shift();

    // Reaction-time EMA + trend window (hits only — misses have no clean RT).
    const rt = event.reactionMs ?? null;
    if (rt && rt > 0 && rt < 10_000 && isHit) {
      state.emaReactionMs = state.emaReactionMs === null
        ? rt
        : EMA_ALPHA * rt + (1 - EMA_ALPHA) * state.emaReactionMs;
      state.reactionWindow.push(rt);
      if (state.reactionWindow.length > TREND_WINDOW) state.reactionWindow.shift();
    }
  }

  // ── Gate: enough data + event-count cadence + anti-burst cooldown ──
  if (state.totalScoredEvents < MIN_EVENTS) return { adjusted: false };
  if (state.totalScoredEvents - state.lastEvalCount < tuning.evalEvery) return { adjusted: false };
  if (Date.now() - state.lastAdjustAt < MIN_COOLDOWN_MS) return { adjusted: false };
  state.lastEvalCount = state.totalScoredEvents;

  // ── Compute performance score P ────────────────────────────────
  const P = computeP(state, tuning);
  if (P === null) return { adjusted: false };

  // Track smoothed D every evaluation (even when not adjusting) so the
  // persisted level reflects sustained performance, not a transient dip.
  state.dSmoothed = DSMOOTH_ALPHA * state.D + (1 - DSMOOTH_ALPHA) * state.dSmoothed;

  const accuracy = state.accuracyWindow.length
    ? mean(state.accuracyWindow.map(h => (h ? 1 : 0)))
    : 0;

  const debug = { P, D: state.D, accuracy, ema: state.emaReactionMs, baseline: state.baselineMean };

  // ── Controller: dead-zone + proportional clamped step ──────────
  const error = P - tuning.target;
  if (Math.abs(error) <= tuning.band) return { adjusted: false, debug };

  const gain    = tuning.gain    ?? BASE_GAIN;
  const stepMax = tuning.stepMax ?? STEP_MAX;
  const step = clamp(gain * error, -stepMax, stepMax);
  const newD = clamp01(state.D + step);
  if (Math.abs(newD - state.D) < 1e-3) return { adjusted: false, debug };

  const direction: 'harder' | 'easier' = step > 0 ? 'harder' : 'easier';
  state.D            = newD;
  state.dSmoothed    = DSMOOTH_ALPHA * newD + (1 - DSMOOTH_ALPHA) * state.dSmoothed;
  state.lastAdjustAt = Date.now();

  const params = paramsFromD(state.gameId, newD);
  const reason = `P=${P.toFixed(2)} vs target ${tuning.target} → D=${newD.toFixed(2)} (${direction})`;

  return { adjusted: true, direction, reason, params, debug: { ...debug, D: newD } };
}

// ── Performance score ────────────────────────────────────────────────────────────

function computeP(state: AdaptiveState, tuning: GameTuning): number | null {
  if (tuning.pMode === 'outcome') {
    if (state.outcomeWindow.length === 0) return null;
    return clamp01(mean(state.outcomeWindow));
  }

  if (state.accuracyWindow.length === 0) return null;
  // P is kept directly interpretable as a success rate so the target band
  // ("keep the player succeeding ~72% of the time") means what it says.
  const acc = mean(state.accuracyWindow.map(h => (h ? 1 : 0)));

  if (tuning.pMode === 'accuracy') {
    // Working-memory games: accuracy is the whole signal.
    return clamp01(acc - fatiguePenalty(state.reactionWindow));
  }

  // speed-acc: accuracy IS the success rate; speed-vs-baseline only PERTURBS it
  // around neutral (0.5 = playing at your usual pace). Averaging them instead
  // used to saturate P at the target for a perfect-accuracy player moving at
  // their normal speed — P = (0.4·1.0 + 0.5·0.5)/0.9 ≈ 0.72 — parking the
  // controller in its dead-zone forever despite flawless play. Anchoring on
  // accuracy keeps the target band meaning what it says ("succeed ~72% of the
  // time"), while faster/slower-than-usual play still nudges P up/down.
  const w     = tuning.weights!;
  const speed = speedScore(state);
  const P = speed === null
    ? acc                                    // no baseline yet → accuracy only
    : acc + w.speed * (speed - 0.5);         // speed as a ± modifier around par

  return clamp01(P - fatiguePenalty(state.reactionWindow));
}

/** 0..1 — how fast the user is vs their personal baseline. null when unknown. */
function speedScore(state: AdaptiveState): number | null {
  return speedVsBaseline(state.emaReactionMs, state.baselineMean, state.baselineStdDev);
}

/**
 * 0..1 — how fast a reaction-time EMA is vs a personal baseline (0.5 = on par,
 * >0.5 = faster than usual). null when there is no usable baseline. Exported so
 * the report-agent can reuse the exact same speed model the live controller uses.
 */
export function speedVsBaseline(
  ema: number | null, baselineMean: number | null, baselineStdDev: number | null,
): number | null {
  if (ema === null || baselineMean === null || !baselineStdDev || baselineStdDev <= 10) return null;
  // z<0 (faster than baseline) → high score. Centre at 0.5, ±2σ spans the range.
  const z = (ema - baselineMean) / baselineStdDev;
  return clamp01(0.5 - z / 4);
}

/** Small penalty (0..0.15) when reaction times are trending upward (fatigue). */
export function fatiguePenalty(reactionWindow: number[]): number {
  if (reactionWindow.length < 5) return 0;
  const pts   = reactionWindow.map((y, x) => [x, y] as [number, number]);
  const slope = linearRegression(pts).m; // ms per event
  if (slope <= 8) return 0;
  return Math.min(0.15, (slope - 8) / 200);
}

// ── D → game params ──────────────────────────────────────────────────────────────

export function paramsFromD(gameId: GameId, D: number): DifficultyParams {
  const tuning = GAME_TUNING[gameId];
  const out: DifficultyParams = {};
  const discrete = new Set(tuning.discreteKeys ?? []);
  const even     = new Set(tuning.evenKeys ?? []);

  for (const [key, [easy, hard]] of Object.entries(tuning.anchors)) {
    let v = lerp(easy, hard, D);
    if (even.has(key))          v = Math.round(v / 2) * 2;
    else if (discrete.has(key)) v = Math.round(v);
    else                        v = Math.round(v * 1000) / 1000; // keep fractions tidy
    out[key] = v;
  }
  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number { return a + (b - a) * clamp01(t); }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function clamp01(v: number): number { return clamp(v, 0, 1); }

// ── Stat helper (used by analytics/baseline to summarise a session) ──────────────

export function computeSessionStats(reactionTimes: number[]): { mean: number; stdDev: number } | null {
  if (reactionTimes.length < 3) return null;
  return {
    mean:   Math.round(mean(reactionTimes)),
    stdDev: Math.round(standardDeviation(reactionTimes)),
  };
}
