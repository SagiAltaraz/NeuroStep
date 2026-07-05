/**
 * Alert Agent — consecutive performance decline detector
 *
 * Pure math, no Claude. Designed to catch meaningful deterioration patterns
 * before they show up in clinical assessment.
 *
 * Trigger conditions (both must hold over 3 consecutive sessions):
 *   • Monotonically declining accuracy (each session worse than the last)
 *   • Total accuracy drop ≥ ACCURACY_DROP_THRESHOLD
 *
 * OR:
 *   • Cognitive score dropped ≥ SCORE_DROP_THRESHOLD across 3 sessions with scores
 *
 * Why 3 sessions and not 2?
 *   Two bad sessions is noise. Three is a pattern. Erring toward fewer false alarms
 *   is important with elderly users — unwarranted concern causes anxiety.
 *
 * Output:
 *   users/{userId}/alerts/{docId}        ← per-user audit trail
 *   admin/pendingAlerts/{userId_gameId}  ← admin dashboard badge
 */

import { getDb }      from '../firebase.js';
import type { GameId } from '../types/game.types.js';
import type { SessionSnapshot } from './analytics-agent.js';

const ACCURACY_DROP_THRESHOLD = 0.25;   // 25 percentage points across 3 sessions
const SCORE_DROP_THRESHOLD    = 20;     // cognitive score points across 3 sessions

// Admin-tunable thresholds live in admin/alertConfig; we fall back to the
// constants above if the doc is missing or unreadable. Read per check — alert
// checks run once per session end, so the extra single-doc read is negligible.
async function loadThresholds(
  db: ReturnType<typeof getDb>,
): Promise<{ accuracyDrop: number; scoreDrop: number }> {
  try {
    const doc = await db.collection('admin').doc('alertConfig').get();
    const d = doc.exists ? doc.data() ?? {} : {};
    const accuracyDrop = typeof d.accuracyDropPct === 'number'
      ? d.accuracyDropPct / 100
      : ACCURACY_DROP_THRESHOLD;
    const scoreDrop = typeof d.scoreDrop === 'number' ? d.scoreDrop : SCORE_DROP_THRESHOLD;
    return { accuracyDrop, scoreDrop };
  } catch {
    return { accuracyDrop: ACCURACY_DROP_THRESHOLD, scoreDrop: SCORE_DROP_THRESHOLD };
  }
}

export async function checkAlerts(
  userId:   string,
  gameId:   GameId,
  current:  SessionSnapshot,            // freshest session (not yet in Firestore)
): Promise<boolean> {                   // → true when a decline alert was written
  if (userId === 'anonymous') return false;

  // Sessions with no scored events (e.g. tic-tac-toe with only MOVE_MADE) have
  // accuracy=null and cannot be part of a decline pattern. Skip the accuracy
  // trigger entirely — but still allow the cognitive-score trigger to fire,
  // which doesn't depend on this session's accuracy.
  const currentAccuracy = current.accuracy;

  const db = getDb();
  const { accuracyDrop, scoreDrop } = await loadThresholds(db);

  let prevSnap;
  try {
    prevSnap = await db.collection('sessions')
      .where('userId', '==', userId)
      .where('gameId', '==', gameId)
      .orderBy('startedAt', 'desc')
      .limit(2)   // last 2 completed sessions; current is the 3rd
      .get();
  } catch (err) {
    console.warn('[Alert] Firestore query failed (check composite index):', (err as Error).message);
    return false;
  }

  if (prevSnap.size < 2) return false;   // need at least 2 historical sessions

  const prev = prevSnap.docs.map(d => ({
    accuracy: (d.data().accuracy ?? null)              as number | null,
    cogScore: (d.data().report?.cognitiveScore ?? null) as number | null,
  }));

  // Accuracy trigger only when all three sessions have a defined accuracy.
  let isLargeAccuracyDrop = false;
  let totalDrop           = 0;
  if (currentAccuracy !== null && prev[0].accuracy !== null && prev[1].accuracy !== null) {
    const accuracies = [currentAccuracy, prev[0].accuracy, prev[1].accuracy];
    totalDrop        = accuracies[2] - accuracies[0];   // oldest minus newest = drop when positive

    const isMonotoneDecline = accuracies[0] < accuracies[1] && accuracies[1] < accuracies[2];
    isLargeAccuracyDrop     = isMonotoneDecline && totalDrop >= accuracyDrop;
  }

  // Cognitive scores come from completed report-agent runs — current session's
  // report hasn't been generated yet, so we only look at previous sessions.
  const cogScores = [prev[0].cogScore, prev[1].cogScore]
    .filter((v): v is number => v !== null);

  const isLargeScoreDrop =
    cogScores.length >= 2 &&
    (cogScores[cogScores.length - 1] - cogScores[0]) >= scoreDrop;

  if (!isLargeAccuracyDrop && !isLargeScoreDrop) return false;

  const alertRef = db.collection('users').doc(userId).collection('alerts').doc();
  const alertData = {
    type:         'performance_decline',
    gameId,
    userId,
    createdAt:    Date.now(),
    accuracyDrop: Math.round(totalDrop * 100),
    trigger:      isLargeAccuracyDrop ? 'accuracy' : 'cognitive_score',
    acknowledged: false,
  };

  try {
    await alertRef.set(alertData);

    // Merge into the admin pending-alerts map (last-write-wins per user+game key)
    await db.collection('admin').doc('pendingAlerts').set({
      [`${userId}_${gameId}`]: { ...alertData, alertId: alertRef.id },
    }, { merge: true });

    console.log(
      `[Alert] ⚠ Decline flagged for ${userId}/${gameId}: ` +
      `accuracy drop ${Math.round(totalDrop * 100)}%, trigger=${alertData.trigger}`,
    );
    return true;
  } catch (err) {
    console.error('[Alert]', (err as Error).message);
    return false;
  }
}
