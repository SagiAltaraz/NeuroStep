/**
 * Live Model — the in-session behavioral fingerprint (player model).
 *
 * Trigger : server.ts on every controller evaluation (throttled), plus a final
 *           forced flush from the finalize pipeline.
 * Input   : the per-session feature-event stream recorded by adaptive-agent
 *           (state.featureEvents) + the personal RT baseline.
 * Output  : users/{userId}/liveModel/{gameId} — ONE doc per game, overwritten
 *           as the session progresses. This is the structured "prompt" the
 *           agents read: the DDA/path director reads it as numbers, and every
 *           LLM prompt (Director / coaching / report) is rendered FROM it on
 *           demand — prose is never the source of truth.
 *
 * Design rules (player-model phase):
 *   - No Firestore write per event. Snapshots are throttled to
 *     FLUSH_MIN_INTERVAL_MS and fire-and-forget — the real-time loop never waits.
 *   - Every feature is null-safe: insufficient signal → null, never a guess.
 *   - The pure core (computeLiveFeatures / chooseTrainingPath / playstyleTags)
 *     is fully unit-tested; the async wrapper only adds the Firestore write.
 */

import { mean, standardDeviation, linearRegression } from 'simple-statistics';
import { getDb }             from '../firebase.js';
import type { GameId }       from '../types/game.types.js';
import type { AdaptiveState } from './adaptive-agent.js';
import { LIVEMODEL_TUNING }  from './progression.config.js';

// Schema version for users/{uid}/liveModel/{gameId}. Bumped when the doc shape
// changes so a future migration can detect older docs.
export const LIVEMODEL_SCHEMA_VERSION = 1;

// ── Event stream ─────────────────────────────────────────────────────────────

// One scored event, as classified by the adaptive controller:
//   hit     → correct response (rt attached when the game reported one)
//   miss    → commission error — the player ACTED, wrongly (impulsivity signal)
//   timeout → omission error — the player did NOT act in time (hesitation signal)
export type FeatureKind = 'hit' | 'miss' | 'timeout';

export interface FeatureEvent {
  kind: FeatureKind;
  rt:   number | null;
}

// ── Features ─────────────────────────────────────────────────────────────────

// Every field is null when there is not enough signal to compute it honestly.
export interface LiveFeatures {
  events:            number;         // scored events seen
  accuracy:          number | null;  // hits / scored
  accuracySlope:     number | null;  // per-event trend of the hit rate
  reactionMean:      number | null;  // ms, hits only
  reactionStd:       number | null;  // ms — consistency (high = unstable)
  reactionSlope:     number | null;  // ms/event — within-session fatigue/warmup
  impulsivityRate:   number | null;  // commission errors / scored
  hesitationRate:    number | null;  // (timeouts + over-slow hits) / scored
  errorRecovery:     number | null;  // P(hit immediately after an error) — resilience
  speedAccuracyBias: number | null;  // -1 caution … +1 recklessness (needs baseline)
  fatigueOnsetIdx:   number | null;  // hit-index where RTs start climbing, null = never
}

// The deterministic "director" verdict — HOW the next stretch should challenge
// the player, not just how hard. Games/LLM prompts read this as chosen_path.
export type ChosenPath = 'speed' | 'distractors' | 'memory-load' | 'hold' | 'recover';

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp  = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function computeLiveFeatures(
  events:         FeatureEvent[],
  baselineMean:   number | null = null,
  baselineStdDev: number | null = null,
  tuning = LIVEMODEL_TUNING,
): LiveFeatures {
  const n = events.length;
  const empty: LiveFeatures = {
    events: n,
    accuracy: null, accuracySlope: null,
    reactionMean: null, reactionStd: null, reactionSlope: null,
    impulsivityRate: null, hesitationRate: null, errorRecovery: null,
    speedAccuracyBias: null, fatigueOnsetIdx: null,
  };
  if (n === 0) return empty;

  const hits     = events.filter(e => e.kind === 'hit').length;
  const misses   = events.filter(e => e.kind === 'miss').length;
  const timeouts = events.filter(e => e.kind === 'timeout').length;
  const accuracy = round3(hits / n);

  // Accuracy trend — regression over the 0/1 hit series. Needs a real window.
  const accuracySlope = n >= 8
    ? round3(linearRegression(events.map((e, i) => [i, e.kind === 'hit' ? 1 : 0] as [number, number])).m)
    : null;

  // Reaction stats — hits only (misses have no clean RT).
  const rts = events.filter(e => e.kind === 'hit' && e.rt !== null && e.rt > 0).map(e => e.rt!);
  const hasRt        = rts.length >= tuning.MIN_RT_SAMPLES;
  const reactionMean = hasRt ? Math.round(mean(rts)) : null;
  const reactionStd  = hasRt ? Math.round(standardDeviation(rts)) : null;
  const reactionSlope = hasRt
    ? round3(linearRegression(rts.map((y, x) => [x, y] as [number, number])).m)
    : null;

  // Rate features are honest only with a minimal denominator.
  const enough = n >= 5;

  // Impulsivity — commission errors: the player ACTED and was wrong.
  const impulsivityRate = enough ? round3(misses / n) : null;

  // Hesitation — omissions plus hits that were much slower than this session's
  // own pace (mean + σ·SLOW_HIT_SIGMA). Without RT stats, timeouts alone still count.
  let slowHits = 0;
  if (reactionMean !== null && reactionStd !== null) {
    const slowCut = reactionMean + reactionStd * tuning.SLOW_HIT_SIGMA;
    slowHits = rts.filter(rt => rt > slowCut).length;
  }
  const hesitationRate = enough ? round3((timeouts + slowHits) / n) : null;

  // Error recovery — of the errors that had a following event, how many were
  // answered with an immediate hit. Resilience; low → end sessions on a success.
  let errWithNext = 0, recovered = 0;
  for (let i = 0; i < n - 1; i++) {
    if (events[i].kind !== 'hit') {
      errWithNext++;
      if (events[i + 1].kind === 'hit') recovered++;
    }
  }
  const errorRecovery = errWithNext >= 2 ? round3(recovered / errWithNext) : null;

  // Speed-accuracy bias — fast AND inaccurate → positive (recklessness);
  // slow AND accurate → negative (caution). Needs the personal baseline.
  let speedAccuracyBias: number | null = null;
  if (reactionMean !== null && baselineMean !== null && baselineStdDev !== null && baselineStdDev > 10) {
    const z         = (reactionMean - baselineMean) / baselineStdDev;
    const speedNorm = clamp(0.5 - z / 4, 0, 1);          // 0.5 = par, >0.5 = faster
    const fastness  = (speedNorm - 0.5) * 2;             // -1..1
    const accNorm   = clamp((accuracy - 0.72) / 0.28, -1, 1);
    speedAccuracyBias = round3(clamp((fastness - accNorm) / 2, -1, 1));
  }

  // Fatigue onset — first hit-index where the rolling RT slope turns clearly
  // positive. Uses the same "slope in ms/event" language as fatiguePenalty.
  let fatigueOnsetIdx: number | null = null;
  const W = tuning.FATIGUE_WINDOW;
  for (let i = W; i <= rts.length; i++) {
    const window = rts.slice(i - W, i);
    const slope  = linearRegression(window.map((y, x) => [x, y] as [number, number])).m;
    if (slope > tuning.FATIGUE_SLOPE_MS) { fatigueOnsetIdx = i - 1; break; }
  }

  return {
    events: n, accuracy, accuracySlope,
    reactionMean, reactionStd, reactionSlope,
    impulsivityRate, hesitationRate, errorRecovery,
    speedAccuracyBias, fatigueOnsetIdx,
  };
}

// ── Deterministic path director ──────────────────────────────────────────────

/**
 * Choose HOW the next stretch should challenge the player. Priority order is
 * deliberate: safety first (recover), then playstyle-specific training, then
 * mastery load, then hold. Null features simply skip their rule — with little
 * signal the answer is 'hold'.
 */
export function chooseTrainingPath(f: LiveFeatures, tuning = LIVEMODEL_TUNING): ChosenPath {
  if (f.accuracy !== null && f.accuracy < tuning.PATH_RECOVER_ACC)          return 'recover';
  if (f.impulsivityRate !== null && f.impulsivityRate > tuning.PATH_IMPULSIVE_RATE) return 'distractors';
  if (f.hesitationRate !== null && f.hesitationRate > tuning.PATH_HESITANT_RATE)    return 'speed';
  if (
    f.accuracy !== null && f.accuracy > tuning.PATH_MASTERY_ACC &&
    (f.accuracySlope === null || f.accuracySlope >= 0)
  ) return 'memory-load';
  return 'hold';
}

// ── Playstyle tags ───────────────────────────────────────────────────────────

/** Human-readable behavior tags, derived — never asked from an LLM. */
export function playstyleTags(f: LiveFeatures, tuning = LIVEMODEL_TUNING): string[] {
  const tags: string[] = [];
  if (f.impulsivityRate !== null && f.impulsivityRate > tuning.PATH_IMPULSIVE_RATE) tags.push('impulsive');
  if (f.hesitationRate  !== null && f.hesitationRate  > tuning.PATH_HESITANT_RATE)  tags.push('hesitant');
  if (f.speedAccuracyBias !== null && f.speedAccuracyBias < -0.35)                  tags.push('cautious');
  if (f.fatigueOnsetIdx !== null && f.fatigueOnsetIdx < 15)                         tags.push('fatigues-fast');
  if (f.reactionMean !== null && f.reactionStd !== null && f.reactionStd < 0.25 * f.reactionMean) tags.push('consistent');
  if (f.errorRecovery !== null && f.errorRecovery >= 0.7)                           tags.push('resilient');
  return tags;
}

// ── Firestore wrapper ────────────────────────────────────────────────────────

// Per-session flush throttle. Keyed by sessionId; cleaned on the final flush.
const lastFlushAt = new Map<string, number>();

/**
 * Snapshot the live model to users/{uid}/liveModel/{gameId}. Throttled to
 * FLUSH_MIN_INTERVAL_MS unless `force` (the end-of-session flush). Never
 * throws, never blocks the caller — failures are logged and swallowed.
 */
export async function flushLiveModel(
  state: AdaptiveState,
  opts: { force?: boolean } = {},
): Promise<void> {
  const { userId, gameId, sessionId } = state;
  if (userId === 'anonymous') return;

  const now  = Date.now();
  const last = lastFlushAt.get(sessionId) ?? 0;
  if (!opts.force && now - last < LIVEMODEL_TUNING.FLUSH_MIN_INTERVAL_MS) return;
  lastFlushAt.set(sessionId, now);
  if (opts.force) lastFlushAt.delete(sessionId);

  const features = computeLiveFeatures(state.featureEvents, state.baselineMean, state.baselineStdDev);
  const path     = chooseTrainingPath(features);
  const tags     = playstyleTags(features);

  try {
    await getDb().collection('users').doc(userId).collection('liveModel').doc(gameId).set({
      sessionId,
      gameId,
      d:          Math.round(clamp(state.D, 0, 1) * 1000) / 1000,
      ...features,
      chosenPath: path,
      playstyleTags: tags,
      updatedAt:  now,
      v:          LIVEMODEL_SCHEMA_VERSION,
    });
    console.log(`[LiveModel] ${userId}/${gameId} acc:${features.accuracy ?? '—'} `
      + `imp:${features.impulsivityRate ?? '—'} hes:${features.hesitationRate ?? '—'} `
      + `path:${path}${tags.length ? ` tags:${tags.join(',')}` : ''}`);
  } catch (err) {
    console.error('[LiveModel]', (err as Error).message);
  }
}

/** The latest computed fingerprint for a session — used by the finalize pipeline. */
export function currentFingerprint(state: AdaptiveState): {
  features: LiveFeatures; chosenPath: ChosenPath; tags: string[];
} {
  const features = computeLiveFeatures(state.featureEvents, state.baselineMean, state.baselineStdDev);
  return { features, chosenPath: chooseTrainingPath(features), tags: playstyleTags(features) };
}
