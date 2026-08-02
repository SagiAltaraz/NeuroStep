/**
 * One-off backfill — bring EXISTING players onto the paced journey.
 *
 * Before JOURNEY_TUNING existed, a domain's journey step (cognitiveProfile.level)
 * was seeded straight from the session score, so a single strong 10-minute first
 * game could land a player on step 68 of 100. New sessions are now paced (see
 * nextJourneyLevel), but profiles written under the old rule keep their inflated
 * step until something corrects them — that is what this script does.
 *
 * Per domain doc it rewrites ONLY the journey bookkeeping:
 *   level     → min(round(ability), journeyCeiling(sessionsCount))
 *   bestLevel → never above the corrected level
 *   deteriorationFlag → recomputed, so a correction never reads as decline
 * The measured ability (`_ema`), the score history, sessionsCount and confidence
 * are left untouched: nothing the player actually did is discarded.
 *
 * Then users/{uid}/progression/current is rebuilt from the corrected levels
 * (node = floor(level/10)+1, peakNode clamped to it) so the map, the rank and the
 * overall level agree with the profile again.
 *
 * Usage:
 *   npx tsx scripts/backfill-journey-pacing.ts              # dry run, prints the diff
 *   npx tsx scripts/backfill-journey-pacing.ts --apply      # write it
 *   npx tsx scripts/backfill-journey-pacing.ts --apply --user <uid>   # one player
 */

import 'dotenv/config';
import { getDb } from '../firebase.js';
import { journeyCeiling } from '../agents/profile-agent.js';
import { computeRank, PROGRESSION_SCHEMA_VERSION } from '../agents/progression.js';
import type { Regions } from '../agents/progression.js';
import { PROFILE_TUNING, PROGRESSION_TUNING } from '../agents/progression.config.js';
import { PROBLEM_IDS } from '../types/domains.js';
import type { ProblemId } from '../types/domains.js';

const APPLY = process.argv.includes('--apply');
const ONLY_USER = (() => {
  const i = process.argv.indexOf('--user');
  return i >= 0 ? process.argv[i + 1] : null;
})();

const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface DomainFix {
  domainId:  string;
  fromLevel: number;
  toLevel:   number;
  sessions:  number;
  ability:   number;
}

/** The step this domain WOULD be on if it had always been paced. */
function correctedLevel(d: Record<string, unknown>): { level: number; ability: number; sessions: number } {
  const storedLevel = clamp(Math.round(num(d.level, 0)), 0, 100);
  const ability     = clamp(Math.round(num(d._ema, storedLevel)), 0, 100);
  const sessions    = Math.max(1, Math.round(num(d.sessionsCount, 1)));
  return { level: Math.min(ability, journeyCeiling(sessions)), ability, sessions };
}

async function fixUser(userId: string): Promise<DomainFix[]> {
  const db  = getDb();
  const col = db.collection('users').doc(userId).collection('cognitiveProfile');
  const snap = await col.get();
  if (snap.empty) return [];

  const fixes: DomainFix[] = [];
  const levelByDomain = new Map<string, number>();

  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const storedLevel = clamp(Math.round(num(d.level, 0)), 0, 100);
    const { level, ability, sessions } = correctedLevel(d);
    levelByDomain.set(doc.id, level);

    if (level === storedLevel) continue;

    const bestLevel = Math.min(clamp(Math.round(num(d.bestLevel, storedLevel)), 0, 100), level);
    const trend = d.trend === 'up' || d.trend === 'down' ? d.trend : 'stable';
    const deteriorationFlag =
      num(d.confidence, 0) >= PROFILE_TUNING.MIN_CONFIDENCE_TO_FLAG &&
      bestLevel - level >= PROFILE_TUNING.DETERIORATION_DROP &&
      trend !== 'up';

    fixes.push({ domainId: doc.id, fromLevel: storedLevel, toLevel: level, sessions, ability });

    if (APPLY) {
      await doc.ref.set({ level, bestLevel, deteriorationFlag }, { merge: true });
    }
  }

  // Rebuild the journey map from the corrected levels — a region's node must not
  // outlive the step that earned it.
  const regions = {} as Regions;
  for (const id of PROBLEM_IDS as readonly ProblemId[]) {
    const level = levelByDomain.get(id);
    const node = level === undefined
      ? 1
      : clamp(Math.floor(level / 10) + 1, 1, PROGRESSION_TUNING.NODES_PER_REGION);
    regions[id] = { node, peakNode: node, graceLeft: PROGRESSION_TUNING.DEMOTE_GRACE, lastDelta: 0 };
  }
  const overallLevel = PROBLEM_IDS.reduce((sum, d) => sum + regions[d as ProblemId].node, 0);

  if (fixes.length > 0 && APPLY) {
    await db.collection('users').doc(userId).collection('progression').doc('current').set({
      overallLevel,
      rank:        computeRank(overallLevel),
      regions,
      avatarState: 'idle',
      updatedAt:   Date.now(),
      v:           PROGRESSION_SCHEMA_VERSION,
    }, { merge: true });
  }

  return fixes;
}

async function main() {
  const db = getDb();
  const userIds = ONLY_USER
    ? [ONLY_USER]
    : (await db.collection('users').get()).docs.map((d) => d.id);

  console.log(`[backfill] ${APPLY ? 'APPLY' : 'DRY RUN'} — ${userIds.length} user(s)`);

  let touchedUsers = 0;
  let touchedDomains = 0;

  for (const userId of userIds) {
    const fixes = await fixUser(userId);
    if (fixes.length === 0) continue;
    touchedUsers += 1;
    touchedDomains += fixes.length;
    for (const f of fixes) {
      console.log(
        `  ${userId} ${f.domainId}: level ${f.fromLevel} → ${f.toLevel} ` +
        `(ability ${f.ability}, ${f.sessions} session${f.sessions === 1 ? '' : 's'})`,
      );
    }
  }

  console.log(
    `[backfill] ${touchedDomains} domain(s) across ${touchedUsers} user(s) ` +
    `${APPLY ? 'updated' : 'would change — re-run with --apply to write'}`,
  );
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('[backfill]', err);
  process.exit(1);
});
