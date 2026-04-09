/**
 * Adaptive Agent — real-time difficulty adjustment
 *
 * Algorithm (per event):
 *   1. EMA  — exponential moving average of reactionMs this session
 *   2. Baseline — user's historical avg from Firestore (loaded once per session)
 *   3. Z-score — how far is the current EMA from the user's personal baseline?
 *   4. Trend — linear regression over last N reaction times (fatigue detection)
 *   5. Map to per-game difficulty params
 *
 * Works for ALL games — only the final param mapping is game-specific.
 *
 * Library: simple-statistics (mean, standardDeviation, linearRegression)
 *   → installed in backend/game-server/node_modules/simple-statistics
 *   → provides the maths so we don't hand-roll moving averages
 */

import { mean, standardDeviation, linearRegression } from 'simple-statistics';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore }                 from 'firebase-admin/firestore';
import type { DifficultyParams, GameId } from '../types/game.types.js';

// ── Config ─────────────────────────────────────────────────────────────────────

const EMA_ALPHA        = 0.25;   // smoothing factor (0=no update, 1=instant)
const TREND_WINDOW     = 12;     // last N reaction times used for regression
const MIN_EVENTS       = 6;      // don't adjust until we have enough data
const COOLDOWN_MS      = 12_000; // min ms between two adjustments
const Z_HARD_THRESHOLD = -1.3;   // user is faster than baseline → game too easy
const Z_EASY_THRESHOLD =  1.3;   // user is slower than baseline → game too hard
const TREND_THRESHOLD  =  8;     // ms per event upward slope = fatigue signal

// ── Per-session state ─────────────────────────────────────────────────────────

export interface AdaptiveState {
  userId:          string;
  gameId:          GameId;
  sessionId:       string;
  // EMA
  emaReactionMs:   number | null;  // null until first hit
  // Baseline (loaded from Firestore, null = anonymous / no history)
  baselineMean:    number | null;
  baselineStdDev:  number | null;
  baselineLoaded:  boolean;
  // Trend buffer
  reactionWindow:  number[];       // last TREND_WINDOW reaction times
  // Accuracy sliding window
  accuracyWindow:  boolean[];      // true=hit, false=miss/timeout, last 10
  // Throttle
  lastAdjustAt:    number;
  totalScoredEvents: number;
}

export function createAdaptiveState(sessionId: string, gameId: GameId, userId: string): AdaptiveState {
  return {
    userId, gameId, sessionId,
    emaReactionMs:    null,
    baselineMean:     null,
    baselineStdDev:   null,
    baselineLoaded:   false,
    reactionWindow:   [],
    accuracyWindow:   [],
    lastAdjustAt:     0,
    totalScoredEvents: 0,
  };
}

// ── Firebase ───────────────────────────────────────────────────────────────────

function db() {
  if (getApps().length === 0) {
    initializeApp({ credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })});
  }
  return getFirestore();
}

async function loadBaseline(userId: string, gameId: GameId): Promise<{ mean: number; stdDev: number } | null> {
  if (userId === 'anonymous') return null;
  try {
    const doc = await db().collection('users').doc(userId).collection('stats').doc(gameId).get();
    if (!doc.exists) return null;
    const data = doc.data()!;
    if (typeof data.avgReactionMs !== 'number' || typeof data.stdDevReactionMs !== 'number') return null;
    return { mean: data.avgReactionMs, stdDev: data.stdDevReactionMs };
  } catch { return null; }
}

// ── Core update ────────────────────────────────────────────────────────────────

export interface AdaptiveEvent {
  type:       string;
  reactionMs?: number;
  correct?:    boolean;
}

export interface AdaptiveResult {
  adjusted: boolean;
  reason?:  string;
  params?:  DifficultyParams;
  debug?:   {
    ema:       number | null;
    baseline:  number | null;
    zScore:    number | null;
    trend:     number | null;
    accuracy:  number;
  };
}

// Hit event types per game
const HIT_TYPES: Record<string, Set<string>> = {
  'shapes-click': new Set(['CIRCLE_HIT']),
  'color-trains': new Set(['STATION_SELECTED']),
  'tictactoe':    new Set(['GAME_WON', 'MOVE_MADE']),
  'memory':       new Set(['PAIR_MATCHED']),
};

const SCORED_TYPES: Record<string, Set<string>> = {
  'shapes-click': new Set(['CIRCLE_HIT', 'DISTRACTOR_CLICK', 'TIMEOUT']),
  'color-trains': new Set(['STATION_SELECTED', 'MISSED_SWITCH']),
  'tictactoe':    new Set(['GAME_WON', 'GAME_DRAW', 'MOVE_MADE']),
  'memory':       new Set(['PAIR_MATCHED', 'PAIR_MISSED']),
};

export async function processEvent(
  state: AdaptiveState,
  event: AdaptiveEvent,
): Promise<AdaptiveResult> {

  const hitTypes    = HIT_TYPES[state.gameId]    ?? new Set<string>();
  const scoredTypes = SCORED_TYPES[state.gameId] ?? new Set<string>();

  if (!scoredTypes.has(event.type)) return { adjusted: false };

  // Load baseline once per session
  if (!state.baselineLoaded) {
    state.baselineLoaded = true;
    const b = await loadBaseline(state.userId, state.gameId);
    if (b) { state.baselineMean = b.mean; state.baselineStdDev = b.stdDev; }
  }

  state.totalScoredEvents++;

  const isHit = hitTypes.has(event.type);
  state.accuracyWindow.push(isHit);
  if (state.accuracyWindow.length > 10) state.accuracyWindow.shift();

  // Update EMA and trend window with reactionMs (hits only — misses have no clean reaction time)
  const rt = event.reactionMs ?? null;
  if (rt && rt > 0 && rt < 10_000 && isHit) {
    state.emaReactionMs = state.emaReactionMs === null
      ? rt
      : EMA_ALPHA * rt + (1 - EMA_ALPHA) * state.emaReactionMs;

    state.reactionWindow.push(rt);
    if (state.reactionWindow.length > TREND_WINDOW) state.reactionWindow.shift();
  }

  // Not enough data yet
  if (state.totalScoredEvents < MIN_EVENTS) return { adjusted: false };

  // Cooldown
  if (Date.now() - state.lastAdjustAt < COOLDOWN_MS) return { adjusted: false };

  // ── Compute signals ────────────────────────────────────────────

  const accuracy = mean(state.accuracyWindow.map(h => h ? 1 : 0));

  // Z-score: how many std deviations is current EMA from user's personal baseline?
  let zScore: number | null = null;
  if (state.emaReactionMs !== null && state.baselineMean !== null && state.baselineStdDev && state.baselineStdDev > 10) {
    zScore = (state.emaReactionMs - state.baselineMean) / state.baselineStdDev;
  }

  // Trend: slope of reaction times (positive = getting slower = fatigue)
  let trend: number | null = null;
  if (state.reactionWindow.length >= 4) {
    const pts = state.reactionWindow.map((y, x) => [x, y] as [number, number]);
    trend = linearRegression(pts).m;  // ms per event
  }

  const debug = {
    ema:      state.emaReactionMs,
    baseline: state.baselineMean,
    zScore,
    trend,
    accuracy,
  };

  // ── Decision ───────────────────────────────────────────────────
  let direction: 'harder' | 'easier' | null = null;
  let reason    = '';

  // Priority 1: fatigue (reaction times rising fast)
  if (trend !== null && trend > TREND_THRESHOLD && accuracy < 0.6) {
    direction = 'easier';
    reason    = `fatigue (slope +${trend.toFixed(1)}ms/event, acc=${(accuracy*100).toFixed(0)}%)`;

  // Priority 2: z-score vs personal baseline
  } else if (zScore !== null && zScore > Z_EASY_THRESHOLD) {
    direction = 'easier';
    reason    = `slow vs baseline (z=${zScore.toFixed(2)})`;

  } else if (zScore !== null && zScore < Z_HARD_THRESHOLD) {
    direction = 'harder';
    reason    = `fast vs baseline (z=${zScore.toFixed(2)})`;

  // Priority 3: pure accuracy (fallback when no baseline)
  } else if (accuracy >= 0.85 && state.totalScoredEvents >= 8) {
    direction = 'harder';
    reason    = `high accuracy (${(accuracy*100).toFixed(0)}%)`;

  } else if (accuracy <= 0.30 && state.totalScoredEvents >= 8) {
    direction = 'easier';
    reason    = `low accuracy (${(accuracy*100).toFixed(0)}%)`;
  }

  if (!direction) return { adjusted: false, debug };

  state.lastAdjustAt = Date.now();

  const params = buildParams(state.gameId, direction, state.emaReactionMs);
  return { adjusted: true, reason, params, debug };
}

// ── Game-specific param mapping ────────────────────────────────────────────────
// Only this section changes when a new game is added.

function buildParams(gameId: GameId, dir: 'harder' | 'easier', emaMs: number | null): DifficultyParams {
  const harder = dir === 'harder';

  switch (gameId) {

    case 'shapes-click': {
      // Base circle life on EMA if available, else use a fixed step
      const currentLife = emaMs ? Math.max(800, Math.min(5000, emaMs * 1.6)) : null;
      return {
        circleLifeMs:    currentLife
          ? (harder ? currentLife * 0.75 : currentLife * 1.30)
          : (harder ? -300 : +400),          // relative delta (server applies)
        distractorCount: harder ? +1 : -1,   // relative delta
      };
    }

    case 'color-trains':
      return {
        trainSpeedPx: harder ? +25 : -20,    // relative delta
        reactionMs:   harder ? -500 : +700,  // relative delta
      };

    case 'tictactoe':
      return {
        aiDepth: harder ? +1 : -1,           // minimax depth delta
      };

    case 'memory':
      return {
        cardCount:    harder ? +2 : -2,      // number of card pairs delta
        flipTimeMs:   harder ? -200 : +300,  // how long cards stay visible
      };

    default:
      return {};
  }
}

// ── Stat helpers (used by analytics-agent to update baseline) ──────────────────

export function computeSessionStats(reactionTimes: number[]): { mean: number; stdDev: number } | null {
  if (reactionTimes.length < 3) return null;
  return {
    mean:   Math.round(mean(reactionTimes)),
    stdDev: Math.round(standardDeviation(reactionTimes)),
  };
}
