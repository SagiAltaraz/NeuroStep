/**
 * Token Watcher — daily Anthropic-token usage cap monitor.
 *
 * Reads `meta/tokenUsage` (written by Report / Coach / Coaching agents on
 * every Claude call) and compares the day's delta against env-configurable
 * thresholds. When a threshold is crossed, writes an idempotent alert into
 * `admin/tokenAlerts` so an admin UI (or operations runbook) can react.
 *
 * Flow per tick (every 15 min):
 *   1. Read current `meta/tokenUsage`
 *   2. Read or create today's `meta/tokenUsage/dailySnapshots/{YYYY-MM-DD}`
 *   3. delta = current - todaySnapshot
 *   4. If delta > critical threshold AND no critical alert today → write one
 *   5. If delta > warning  threshold AND no warning  alert today → write one
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getDb } from '../firebase.js';

type AlertLevel = 'warning' | 'critical';

const TICK_MS = 15 * 60 * 1000;

function thresholds() {
  const warn = Number(process.env.TOKEN_DAILY_WARNING_THRESHOLD  ?? 500_000);
  const crit = Number(process.env.TOKEN_DAILY_CRITICAL_THRESHOLD ?? 1_000_000);
  return { warn, crit };
}

function utcDateKey(): string {
  // YYYY-MM-DD in UTC — matches the format the snapshots collection is keyed by.
  return new Date().toISOString().slice(0, 10);
}

interface TokenUsageDoc {
  totalInputTokens?:  number;
  totalOutputTokens?: number;
}

interface DailySnapshotDoc {
  inputAtStartOfDay:  number;
  outputAtStartOfDay: number;
  capturedAt:         number;
}

async function ensureDailySnapshot(
  db:        Firestore,
  date:      string,
  current:   { input: number; output: number },
): Promise<DailySnapshotDoc> {
  const ref  = db.collection('meta').doc('tokenUsage')
                 .collection('dailySnapshots').doc(date);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as DailySnapshotDoc;

  const fresh: DailySnapshotDoc = {
    inputAtStartOfDay:  current.input,
    outputAtStartOfDay: current.output,
    capturedAt:         Date.now(),
  };
  await ref.set(fresh);
  console.log(`[TokenWatcher] Snapshot for ${date}: in=${fresh.inputAtStartOfDay} out=${fresh.outputAtStartOfDay}`);
  return fresh;
}

async function writeAlertIfMissing(
  db:        Firestore,
  level:     AlertLevel,
  date:      string,
  usage:     number,
  threshold: number,
): Promise<void> {
  // Idempotency: query existing alerts for this date+level (acknowledged or not)
  const existing = await db.collection('admin').doc('tokenAlerts').collection('items')
    .where('date',  '==', date)
    .where('level', '==', level)
    .limit(1)
    .get();
  if (!existing.empty) return;

  await db.collection('admin').doc('tokenAlerts').collection('items').add({
    level,
    usage,
    threshold,
    date,
    triggeredAt:  FieldValue.serverTimestamp(),
    acknowledged: false,
  });
  console.warn(`[TokenWatcher] ${level.toUpperCase()} alert: ${usage} tokens used today (threshold ${threshold})`);
}

async function tick(): Promise<void> {
  try {
    const db   = getDb();
    const date = utcDateKey();

    const usageSnap = await db.collection('meta').doc('tokenUsage').get();
    const usage     = (usageSnap.data() ?? {}) as TokenUsageDoc;
    const current   = {
      input:  usage.totalInputTokens  ?? 0,
      output: usage.totalOutputTokens ?? 0,
    };

    const baseline  = await ensureDailySnapshot(db, date, current);
    const dailyUsed = (current.input  - baseline.inputAtStartOfDay)
                    + (current.output - baseline.outputAtStartOfDay);

    const { warn, crit } = thresholds();

    if (dailyUsed >= crit) await writeAlertIfMissing(db, 'critical', date, dailyUsed, crit);
    if (dailyUsed >= warn) await writeAlertIfMissing(db, 'warning',  date, dailyUsed, warn);
  } catch (err) {
    console.error('[TokenWatcher] tick failed:', (err as Error).message);
  }
}

export async function startTokenWatcher(): Promise<void> {
  // First tick on a short delay so it doesn't block server boot.
  setTimeout(() => { tick().catch(() => {}); }, 5_000);
  setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  console.log(`[TokenWatcher] Polling every ${TICK_MS / 60_000} min — thresholds:`, thresholds());
}
