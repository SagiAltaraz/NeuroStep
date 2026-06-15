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

import { getDb }              from '../firebase.js';
import type { GameId }        from '../types/game.types.js';
import { GAME_DOMAINS }       from '../types/domains.js';
import type { ProblemId }     from '../types/domains.js';
import { PROFILE_TUNING }     from './progression.config.js';

export type Trend = 'up' | 'stable' | 'down';

// The persisted/derived state of one domain (the numeric core, no metadata).
export interface ProfileState {
  _ema:             number;
  level:            number;
  confidence:       number;
  sessionsCount:    number;
  trend:            Trend;
  lastDomainScores: number[];
}

// Returned to the progression step so it knows which domains moved.
export interface ProfileUpdateResult {
  domainId:   ProblemId;
  prevLevel:  number;
  newLevel:   number;
  confidence: number;
}

// ── Pure core ────────────────────────────────────────────────────────────────

// Direction of the recent score window. 'stable' until we have enough samples.
export function computeTrend(scores: number[], tuning = PROFILE_TUNING): Trend {
  if (scores.length < 3) return 'stable';
  const delta = scores[scores.length - 1] - scores[0];
  if (delta >= tuning.TREND_THRESHOLD)  return 'up';
  if (delta <= -tuning.TREND_THRESHOLD) return 'down';
  return 'stable';
}

// Fold one new domain score into a domain's profile. `prev === null` = cold start.
// `weight` is 1.0 for the game's primary domain, 0.5 for secondary domains.
export function computeProfileUpdate(
  prev:        ProfileState | null,
  domainScore: number,
  weight:      number,
  tuning = PROFILE_TUNING,
): ProfileState {
  // Cold start — first ever score for this domain seeds the EMA directly.
  if (prev === null) {
    return {
      _ema:             domainScore,
      level:            Math.round(domainScore),
      confidence:       Math.min(1, 1 / tuning.WARMUP_SESSIONS),
      sessionsCount:    1,
      trend:            'stable',
      lastDomainScores: [domainScore],
    };
  }

  const sessionsCount = prev.sessionsCount + 1;
  const confidence    = Math.min(1, sessionsCount / tuning.WARMUP_SESSIONS);

  // Alpha by weight; boosted (and capped) while still warming up.
  let alpha: number = weight >= 1 ? tuning.ALPHA_PRIMARY : tuning.ALPHA_SECONDARY;
  if (prev.confidence < 1) alpha = Math.min(tuning.ALPHA_MAX, alpha * tuning.WARMUP_ALPHA_BOOST);

  const _ema  = prev._ema * (1 - alpha) + domainScore * alpha;
  const level = Math.round(_ema);

  const lastDomainScores = [...prev.lastDomainScores, domainScore].slice(-tuning.TREND_WINDOW);
  const trend            = computeTrend(lastDomainScores, tuning);

  return { _ema, level, confidence, sessionsCount, trend, lastDomainScores };
}

// ── Firestore wrapper ────────────────────────────────────────────────────────

// Coerce a Firestore doc into a ProfileState with safe defaults (tolerates
// partial/legacy docs without throwing).
function readProfileState(d: Record<string, unknown>): ProfileState {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);
  const level = num(d.level, 0);
  return {
    _ema:             num(d._ema, level),
    level,
    confidence:       num(d.confidence, 0),
    sessionsCount:    num(d.sessionsCount, 0),
    trend:            d.trend === 'up' || d.trend === 'down' ? d.trend : 'stable',
    lastDomainScores: Array.isArray(d.lastDomainScores)
      ? d.lastDomainScores.filter((x): x is number => typeof x === 'number')
      : [],
  };
}

export async function updateCognitiveProfile(
  userId:       string,
  gameId:       GameId,
  domainScores: Record<ProblemId, number>,
): Promise<ProfileUpdateResult[]> {
  if (userId === 'anonymous') return [];

  const { primary } = GAME_DOMAINS[gameId];
  const db = getDb();
  const results: ProfileUpdateResult[] = [];
  const now = Date.now();

  // Read-modify-write per domain. Safe because a user plays one session at a
  // time, so there is no concurrent writer for the same (user, domain).
  for (const [domainId, score] of Object.entries(domainScores) as [ProblemId, number][]) {
    const weight = domainId === primary ? 1.0 : 0.5;
    const ref    = db.collection('users').doc(userId).collection('cognitiveProfile').doc(domainId);

    try {
      const snap = await ref.get();
      const prev = snap.exists ? readProfileState(snap.data() as Record<string, unknown>) : null;
      const next = computeProfileUpdate(prev, score, weight);

      await ref.set({
        domainId,
        level:            next.level,
        _ema:             next._ema,
        confidence:       next.confidence,
        sessionsCount:    next.sessionsCount,
        trend:            next.trend,
        lastDomainScores: next.lastDomainScores,
        lastPlayedAt:     now,
        updatedAt:        now,
      }, { merge: true });

      results.push({ domainId, prevLevel: prev?.level ?? 0, newLevel: next.level, confidence: next.confidence });
    } catch (err) {
      console.error(`[Profile] ${userId}/${domainId}:`, (err as Error).message);
    }
  }

  console.log(`[Profile] ${userId} ${gameId} → ${results.map(r => `${r.domainId}:${r.prevLevel}→${r.newLevel}`).join(' ')}`);
  return results;
}
