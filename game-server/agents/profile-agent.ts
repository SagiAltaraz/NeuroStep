/**
 * Profile Agent — per-domain cognitive profile (cross-session).
 *
 * Trigger : server.ts post-session pipeline, after report-agent produces
 *           deterministic `domainScores`.
 * Input   : domainScores (Record<ProblemId, number>) for the game just played.
 * Output  : users/{userId}/cognitiveProfile/{domainId} — one doc per domain the
 *           user has ever touched.
 *
 * Each domain holds an EMA (`_ema`) of its scores. The primary domain of the
 * played game moves faster (higher alpha) than secondary domains; during the
 * warm-up period (first WARMUP_SESSIONS) alpha is boosted so early sessions
 * shape the profile quickly. `confidence` ramps 0→1 over the warm-up; `trend`
 * summarises the recent direction for the journey-map arrows.
 *
 * The pure core (computeProfileUpdate / computeTrend) is unit-tested; the
 * exported async wrapper only adds Firestore read/modify/write.
 */

import { getDb } from '../firebase.js';
import type { GameId } from '../types/game.types.js';
import { GAME_DOMAINS } from '../types/domains.js';
import type { ProblemId } from '../types/domains.js';
import { PROFILE_TUNING, JOURNEY_TUNING } from './progression.config.js';

export type Trend = 'up' | 'stable' | 'down';

// Schema version for users/{uid}/cognitiveProfile/{domainId}. Bumped when the
// doc shape changes so a future migration can detect older docs (D4).
// v2: player-model phase — volatility, plateauCount, deteriorationFlag,
//     bestLevel/bestAt, playstyleTags, plus the per-domain timeline rollup.
export const PROFILE_SCHEMA_VERSION = 2;

// The persisted/derived state of one domain (the numeric core, no metadata).
export interface ProfileState {
   _ema: number;
   level: number;
   confidence: number;
   sessionsCount: number;
   trend: Trend;
   lastDomainScores: number[];
   // ── Longitudinal health signals (player-model phase) ────────────────────
   volatility: number; // std-dev of the recent score window (0 = steady)
   plateauCount: number; // consecutive sessions without real level gain
   deteriorationFlag: boolean; // meaningfully below peak AND trending down
   bestLevel: number; // peak level ever reached
   bestAt: number; // timestamp of that peak (0 = unknown/legacy)
}

// Returned to the progression step so it knows which domains moved.
export interface ProfileUpdateResult {
   domainId: ProblemId;
   prevLevel: number;
   newLevel: number;
   confidence: number;
   sessionsCount: number; // sessions that have touched this domain (incl. this one)
   isNew: boolean; // true on the very first session for this domain
}

// ── Pure core ────────────────────────────────────────────────────────────────

// Direction of the recent score window. 'stable' until we have enough samples.
export function computeTrend(scores: number[], tuning = PROFILE_TUNING): Trend {
   if (scores.length < 3) return 'stable';
   const delta = scores[scores.length - 1] - scores[0];
   if (delta >= tuning.TREND_THRESHOLD) return 'up';
   if (delta <= -tuning.TREND_THRESHOLD) return 'down';
   return 'stable';
}

// ── Journey pacing ───────────────────────────────────────────────────────────
// `_ema` is the measured ability and moves as fast as the evidence does.
// `level` is the JOURNEY STEP — what the map draws — and is deliberately slower:
// it walks toward the ability a few steps per session and can never run ahead of
// the training actually done. See JOURNEY_TUNING for the reasoning.

// The highest step the player's experience in this domain justifies.
export function journeyCeiling(
   sessionsCount: number,
   tuning = JOURNEY_TUNING
): number {
   const sessions = Math.max(1, Math.round(sessionsCount));
   const ceiling =
      tuning.FIRST_SESSION_CAP + tuning.CEILING_PER_SESSION * (sessions - 1);
   return Math.min(100, ceiling);
}

// One session's move along the journey: toward `ability`, never past the
// experience ceiling, never more than the per-session step cap in either
// direction. Pure and exported so the backfill script reuses the exact rule.
export function nextJourneyLevel(
   prevLevel: number,
   ability: number,
   sessionsCount: number,
   tuning = JOURNEY_TUNING
): number {
   const from = Math.max(0, Math.round(prevLevel));
   const target = Math.max(0, Math.min(100, Math.round(ability)));
   const allowed = Math.min(target, journeyCeiling(sessionsCount, tuning));

   if (allowed > from) return Math.min(allowed, from + tuning.MAX_GAIN_PER_SESSION);
   if (allowed < from) return Math.max(allowed, from - tuning.MAX_DROP_PER_SESSION);
   return from;
}

// Std-dev of the recent score window — how NOISY this ability is session to
// session. High volatility = unstable performance (a health signal on its own,
// and a reason to trust single-session dips less).
export function computeVolatility(scores: number[]): number {
   if (scores.length < 3) return 0;
   const m = scores.reduce((a, b) => a + b, 0) / scores.length;
   const variance =
      scores.reduce((a, b) => a + (b - m) ** 2, 0) / scores.length;
   return Math.round(Math.sqrt(variance) * 10) / 10;
}

// Fold one new domain score into a domain's profile. `prev === null` = cold start.
// `weight` is 1.0 for the game's primary domain, 0.5 for secondary domains.
// `now` is injectable so tests are deterministic.
export function computeProfileUpdate(
   prev: ProfileState | null,
   domainScore: number,
   weight: number,
   tuning = PROFILE_TUNING,
   now: number = Date.now()
): ProfileState {
   // Cold start — the first ever score seeds the ABILITY estimate directly (it is
   // the only evidence we have), but the journey step starts at the bottom of the
   // map: one good session is not a climbed mountain. (The per-session "ease-in"
   // lives in the adaptive warm-up, which starts each session a touch BELOW the
   // player's ability and ramps up to it — see RESUME_FACTOR in adaptive-agent.)
   if (prev === null) {
      const level = nextJourneyLevel(0, domainScore, 1);
      return {
         _ema: domainScore,
         level,
         confidence: Math.min(1, 1 / tuning.WARMUP_SESSIONS),
         sessionsCount: 1,
         trend: 'stable',
         lastDomainScores: [domainScore],
         volatility: 0,
         plateauCount: 0,
         deteriorationFlag: false,
         bestLevel: level,
         bestAt: now,
      };
   }

   const sessionsCount = prev.sessionsCount + 1;
   const confidence = Math.min(1, sessionsCount / tuning.WARMUP_SESSIONS);

   // Alpha by weight; boosted (and capped) while still warming up.
   let alpha: number =
      weight >= 1 ? tuning.ALPHA_PRIMARY : tuning.ALPHA_SECONDARY;
   if (prev.confidence < 1)
      alpha = Math.min(tuning.ALPHA_MAX, alpha * tuning.WARMUP_ALPHA_BOOST);

   const _ema = prev._ema * (1 - alpha) + domainScore * alpha;
   // The journey walks toward the ability instead of jumping to it — a few steps
   // per session at most, and never beyond what this many sessions justify. This
   // also pulls legacy profiles (seeded straight from a session score, before the
   // gating existed) back onto the honest path without losing their ability.
   const level = nextJourneyLevel(prev.level, _ema, sessionsCount);

   const lastDomainScores = [...prev.lastDomainScores, domainScore].slice(
      -tuning.TREND_WINDOW
   );
   const trend = computeTrend(lastDomainScores, tuning);

   // ── Longitudinal health signals ─────────────────────────────────────────
   const volatility = computeVolatility(lastDomainScores);

   // Plateau: no REAL gain this session (≤ epsilon). Any true climb resets it.
   const plateauCount =
      level > prev.level + tuning.PLATEAU_EPSILON ? 0 : prev.plateauCount + 1;

   // A legacy profile sitting above its experience ceiling is being walked back
   // DOWN to the honest path — that is bookkeeping, not a player getting worse,
   // and it must never raise a caregiver-facing decline flag.
   const pacingCorrection = prev.level > journeyCeiling(sessionsCount);

   // Peak tracking — never decays; deterioration is judged against it. The one
   // exception is a peak that was never earned (recorded above the ceiling by the
   // old un-paced rule): it walks down with the level, or every later session
   // would measure the player against a summit they never climbed.
   const bestLevel = pacingCorrection ? level : Math.max(prev.bestLevel, level);
   const bestAt =
      pacingCorrection || level > prev.bestLevel ? now : prev.bestAt;

   // Deterioration: meaningfully below the personal peak with NO sign of
   // recovery (still falling, or stuck low — both are the sustained pattern a
   // caregiver should watch), on a profile we actually trust. Clears the moment
   // the trend turns up. Never a single-session verdict.
   const deteriorationFlag =
      !pacingCorrection &&
      confidence >= tuning.MIN_CONFIDENCE_TO_FLAG &&
      bestLevel - level >= tuning.DETERIORATION_DROP &&
      trend !== 'up';

   return {
      _ema,
      level,
      confidence,
      sessionsCount,
      trend,
      lastDomainScores,
      volatility,
      plateauCount,
      deteriorationFlag,
      bestLevel,
      bestAt,
   };
}

// ── Firestore wrapper ────────────────────────────────────────────────────────

// Coerce a Firestore doc into a ProfileState with safe defaults (tolerates
// partial/legacy docs without throwing).
function readProfileState(d: Record<string, unknown>): ProfileState {
   const num = (v: unknown, fallback: number) =>
      typeof v === 'number' ? v : fallback;
   const level = num(d.level, 0);
   return {
      _ema: num(d._ema, level),
      level,
      confidence: num(d.confidence, 0),
      sessionsCount: num(d.sessionsCount, 0),
      trend: d.trend === 'up' || d.trend === 'down' ? d.trend : 'stable',
      lastDomainScores: Array.isArray(d.lastDomainScores)
         ? d.lastDomainScores.filter((x): x is number => typeof x === 'number')
         : [],
      // v1 → v2 defaults: legacy docs seed the peak from their current level.
      volatility: num(d.volatility, 0),
      plateauCount: num(d.plateauCount, 0),
      deteriorationFlag: d.deteriorationFlag === true,
      bestLevel: num(d.bestLevel, level),
      bestAt: num(d.bestAt, 0),
   };
}

// ── Timeline rollup ──────────────────────────────────────────────────────────
// One doc per domain holding a capped array of {t, level, score, confidence}
// points — the series behind the long-term improvement/decline graph. A single
// read-modify-write per touched domain per session (2-3 per session), cheap.

async function appendTimelinePoint(
   userId: string,
   domainId: ProblemId,
   point: { t: number; level: number; score: number; confidence: number }
): Promise<void> {
   const ref = getDb()
      .collection('users')
      .doc(userId)
      .collection('timeline')
      .doc(domainId);
   try {
      const snap = await ref.get();
      const prev = snap.exists ? (snap.data()?.points as unknown) : [];
      const points = Array.isArray(prev) ? prev : [];
      points.push(point);
      await ref.set({
         domainId,
         points: points.slice(-PROFILE_TUNING.TIMELINE_MAX_POINTS),
         updatedAt: point.t,
         v: PROFILE_SCHEMA_VERSION,
      });
   } catch (err) {
      console.error(
         `[Timeline] ${userId}/${domainId}:`,
         (err as Error).message
      );
   }
}

export async function updateCognitiveProfile(
   userId: string,
   gameId: GameId,
   domainScores: Record<ProblemId, number>,
   // Behavior tags observed THIS session (from the live player model) — persisted
   // on every touched domain so the planner/Director can read style with ability.
   playstyleTags: string[] = []
): Promise<ProfileUpdateResult[]> {
   if (userId === 'anonymous') return [];

   const { primary } = GAME_DOMAINS[gameId];
   const db = getDb();
   const results: ProfileUpdateResult[] = [];
   const now = Date.now();

   // Read-modify-write per domain. Safe because a user plays one session at a
   // time, so there is no concurrent writer for the same (user, domain).
   for (const [domainId, score] of Object.entries(domainScores) as [
      ProblemId,
      number,
   ][]) {
      const weight = domainId === primary ? 1.0 : 0.5;
      const ref = db
         .collection('users')
         .doc(userId)
         .collection('cognitiveProfile')
         .doc(domainId);

      try {
         const snap = await ref.get();
         const prev = snap.exists
            ? readProfileState(snap.data() as Record<string, unknown>)
            : null;
         const next = computeProfileUpdate(
            prev,
            score,
            weight,
            PROFILE_TUNING,
            now
         );

         await ref.set(
            {
               domainId,
               level: next.level,
               _ema: next._ema,
               confidence: next.confidence,
               sessionsCount: next.sessionsCount,
               trend: next.trend,
               lastDomainScores: next.lastDomainScores,
               // Longitudinal health signals (v2) — the improvement/decline machinery.
               volatility: next.volatility,
               plateauCount: next.plateauCount,
               deteriorationFlag: next.deteriorationFlag,
               bestLevel: next.bestLevel,
               bestAt: next.bestAt,
               playstyleTags,
               // sourceGames: which games have fed this domain, and where each left off.
               // The documented basis for cross-game transfer (D4) — a domain's level is
               // shared, but the games that built it are tracked here for explainability.
               sourceGames: {
                  [gameId]: { lastLevel: next.level, lastPlayedAt: now },
               },
               lastPlayedAt: now,
               updatedAt: now,
               v: PROFILE_SCHEMA_VERSION,
            },
            { merge: true }
         );

         // Timeline point — the long-term graph datum. Fire-and-forget; a failed
         // point must never cost the player their profile update.
         appendTimelinePoint(userId, domainId, {
            t: now,
            level: next.level,
            score,
            confidence: next.confidence,
         }).catch(() => {});

         results.push({
            domainId,
            prevLevel: prev?.level ?? 0,
            newLevel: next.level,
            confidence: next.confidence,
            sessionsCount: next.sessionsCount,
            isNew: prev === null,
         });
      } catch (err) {
         console.error(
            `[Profile] ${userId}/${domainId}:`,
            (err as Error).message
         );
      }
   }

   console.log(
      `[Profile] ${userId} ${gameId} → ${results.map((r) => `${r.domainId}:${r.prevLevel}→${r.newLevel}`).join(' ')}`
   );
   return results;
}
