/**
 * Baseline Agent — cross-session reaction-time statistics
 *
 * Uses Welford's online algorithm via atomic Firestore increments.
 * Storing (_n, _sum, _sumSq) lets us compute an accurate running mean and
 * population standard deviation across ALL sessions without a read-lock.
 *
 * Formula:  mean   = _sum / _n
 *           stdDev = sqrt( _sumSq/_n  -  mean² )
 *
 * Called once per session close from server.ts — never in the hot path.
 * Writes: users/{userId}/stats/{gameId}
 *   avgReactionMs    ← adaptive-agent reads this as the personal baseline mean
 *   stdDevReactionMs ← adaptive-agent reads this for Z-score normalisation
 *   sessionsCount    ← coach-agent uses this for the 5-session trigger
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getDb }      from '../firebase.js';
import type { GameId } from '../types/game.types.js';

export async function updateBaseline(
  userId:        string,
  gameId:        GameId,
  reactionTimes: number[],
): Promise<void> {
  if (userId === 'anonymous' || reactionTimes.length < 3) return;

  const n     = reactionTimes.length;
  const sum   = reactionTimes.reduce((a, b) => a + b, 0);
  const sumSq = reactionTimes.reduce((a, b) => a + b * b, 0);

  const db  = getDb();
  const ref = db.collection('users').doc(userId).collection('stats').doc(gameId);

  try {
    // Step 1 — atomic increment: no read needed, no race condition
    await ref.set({
      _n:           FieldValue.increment(n),
      _sum:         FieldValue.increment(sum),
      _sumSq:       FieldValue.increment(sumSq),
      sessionsCount: FieldValue.increment(1),
      lastPlayedAt:  Date.now(),
    }, { merge: true });

    // Step 2 — re-read totals and materialise derived fields that adaptive-agent reads
    const snap       = (await ref.get()).data()!;
    const totalN     = snap._n   as number;
    const totalSum   = snap._sum as number;
    const totalSumSq = snap._sumSq as number;

    const mean     = totalSum / totalN;
    const variance = Math.max(0, totalSumSq / totalN - mean * mean);
    const stdDev   = Math.sqrt(variance);

    await ref.update({
      avgReactionMs:    Math.round(mean),
      stdDevReactionMs: Math.round(stdDev),
    });

    console.log(
      `[Baseline] ${userId}/${gameId}: μ=${Math.round(mean)}ms σ=${Math.round(stdDev)}ms (total n=${totalN})`,
    );
  } catch (err) {
    console.error('[Baseline]', (err as Error).message);
  }
}
