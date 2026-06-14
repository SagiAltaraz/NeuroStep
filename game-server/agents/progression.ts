/**
 * Progression — the gamified "journey map" layer.
 *
 * Trigger : server.ts post-session pipeline, after profile-agent returns the
 *           per-domain ProfileUpdateResult[].
 * Output  : users/{userId}/progression/current — one doc holding all 8 regions.
 *
 * Each cognitive domain is a "region" the player climbs. A region has NODES_PER_
 * REGION nodes; the continuous profile `level` (0..100) maps to a node (1..10).
 *
 * Promotion is eager (cross a boundary → climb immediately). Demotion is
 * deliberately reluctant, to protect elderly players from a discouraging
 * yo-yo:
 *   - only when the level falls a buffer BELOW the node floor,
 *   - only when we are confident in the profile,
 *   - only after DEMOTE_GRACE consecutive sub-threshold sessions,
 *   - and never more than FLOOR_BELOW_PEAK nodes below the best node reached.
 *
 * The pure core (computeProgression) is fully unit-tested; the async wrapper
 * only adds Firestore read/modify/write.
 */

import { getDb }              from '../firebase.js';
import { PROBLEM_IDS }        from '../types/domains.js';
import type { ProblemId }     from '../types/domains.js';
import { PROGRESSION_TUNING } from './progression.config.js';
import type { ProfileUpdateResult } from './profile-agent.js';

export type Rank = 'beginner' | 'explorer' | 'advanced' | 'expert' | 'champion';
export type AvatarState = 'idle' | 'climb' | 'drop' | 'celebrate';

export interface RegionState {
  node:      number;
  peakNode:  number;
  graceLeft: number;
  lastDelta: number;  // last node movement: +1 climbed, -1 dropped, 0 held
}

export type Regions = Record<ProblemId, RegionState>;

export interface LevelChange {
  domainId: ProblemId;
  prevNode: number;
  newNode:  number;
  delta:    number;   // newNode - prevNode (can be >1 on a big jump)
}

export interface ProgressionComputation {
  regions:      Regions;
  overallLevel: number;
  rank:         Rank;
  avatarState:  AvatarState;
  levelChanges: LevelChange[];
}

// What the server pushes to the client + persists summary of.
export interface ProgressionResult {
  levelChanges: LevelChange[];
  overallLevel: number;
  rank:         Rank;
  avatarState:  AvatarState;
}

// ── Pure core ────────────────────────────────────────────────────────────────

function defaultRegion(tuning = PROGRESSION_TUNING): RegionState {
  return { node: 1, peakNode: 1, graceLeft: tuning.DEMOTE_GRACE, lastDelta: 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeRank(overallLevel: number): Rank {
  if (overallLevel <= 15) return 'beginner';
  if (overallLevel <= 35) return 'explorer';
  if (overallLevel <= 55) return 'advanced';
  if (overallLevel <= 70) return 'expert';
  return 'champion';
}

export function computeProgression(
  prevRegions:    Partial<Regions>,
  profileUpdates: ProfileUpdateResult[],
  tuning = PROGRESSION_TUNING,
): ProgressionComputation {
  // Materialise all 8 regions, filling gaps with defaults (copy so we never
  // mutate the caller's objects).
  const regions = {} as Regions;
  for (const d of PROBLEM_IDS) {
    const r = prevRegions[d];
    regions[d] = r ? { ...r } : defaultRegion(tuning);
  }

  const levelChanges: LevelChange[] = [];

  for (const upd of profileUpdates) {
    const r        = regions[upd.domainId];
    const prevNode = r.node;
    const targetNode = clamp(Math.floor(upd.newLevel / 10) + 1, 1, tuning.NODES_PER_REGION);

    if (targetNode > r.node) {
      // Promote — eager.
      r.node      = targetNode;
      r.peakNode  = Math.max(r.peakNode, r.node);
      r.graceLeft = tuning.DEMOTE_GRACE;
      r.lastDelta = 1;
    } else {
      const belowFloor      = upd.newLevel < (r.node - 1) * 10 - tuning.DEMOTE_BUFFER;
      const confidentEnough = upd.confidence >= tuning.MIN_CONFIDENCE_TO_DEMOTE;

      if (belowFloor && confidentEnough) {
        r.graceLeft -= 1;
        if (r.graceLeft <= 0) {
          // Demote one node, but never below the peak floor.
          r.node      = Math.max(r.node - 1, r.peakNode - tuning.FLOOR_BELOW_PEAK, 1);
          r.graceLeft = tuning.DEMOTE_GRACE;
          r.lastDelta = r.node < prevNode ? -1 : 0;
        } else {
          r.lastDelta = 0;   // grace consumed, holding this session
        }
      } else {
        // Recovered / stable / not confident — reset grace, hold the node.
        r.graceLeft = tuning.DEMOTE_GRACE;
        r.lastDelta = 0;
      }
    }

    levelChanges.push({ domainId: upd.domainId, prevNode, newNode: r.node, delta: r.node - prevNode });
  }

  const overallLevel = PROBLEM_IDS.reduce((sum, d) => sum + regions[d].node, 0);
  const rank         = computeRank(overallLevel);
  const avatarState: AvatarState =
    levelChanges.some(c => c.delta > 0) ? 'climb'
    : levelChanges.some(c => c.delta < 0) ? 'drop'
    : 'idle';

  return { regions, overallLevel, rank, avatarState, levelChanges };
}

// ── Firestore wrapper ────────────────────────────────────────────────────────

function readRegions(data: Record<string, unknown> | undefined): Partial<Regions> {
  const raw = data?.regions;
  if (!raw || typeof raw !== 'object') return {};
  const map = raw as Record<string, unknown>;
  const out: Partial<Regions> = {};
  for (const id of PROBLEM_IDS) {
    const r = map[id] as Record<string, unknown> | undefined;
    if (r && typeof r.node === 'number') {
      out[id] = {
        node:      r.node,
        peakNode:  typeof r.peakNode  === 'number' ? r.peakNode  : r.node,
        graceLeft: typeof r.graceLeft === 'number' ? r.graceLeft : PROGRESSION_TUNING.DEMOTE_GRACE,
        lastDelta: typeof r.lastDelta === 'number' ? r.lastDelta : 0,
      };
    }
  }
  return out;
}

export async function updateProgression(
  userId:         string,
  profileUpdates: ProfileUpdateResult[],
): Promise<ProgressionResult> {
  const empty: ProgressionResult = { levelChanges: [], overallLevel: 0, rank: 'beginner', avatarState: 'idle' };
  if (userId === 'anonymous' || profileUpdates.length === 0) return empty;

  const db  = getDb();
  const ref = db.collection('users').doc(userId).collection('progression').doc('current');

  try {
    const snap        = await ref.get();
    const prevRegions = readRegions(snap.exists ? (snap.data() as Record<string, unknown>) : undefined);
    const result      = computeProgression(prevRegions, profileUpdates);

    await ref.set({
      overallLevel: result.overallLevel,
      rank:         result.rank,
      regions:      result.regions,
      avatarState:  result.avatarState,
      updatedAt:    Date.now(),
    }, { merge: true });

    const changed = result.levelChanges.filter(c => c.delta !== 0)
      .map(c => `${c.domainId}:${c.prevNode}→${c.newNode}`).join(' ') || 'no node change';
    console.log(`[Progression] ${userId} overall:${result.overallLevel} rank:${result.rank} | ${changed}`);

    return {
      levelChanges: result.levelChanges,
      overallLevel: result.overallLevel,
      rank:         result.rank,
      avatarState:  result.avatarState,
    };
  } catch (err) {
    console.error('[Progression]', (err as Error).message);
    return empty;
  }
}
