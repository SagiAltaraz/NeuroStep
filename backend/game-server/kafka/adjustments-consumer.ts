/**
 * Adjustments Consumer — buffer of difficulty changes per session.
 *
 * The `adjustmentLog[]` in server.ts lives in process memory. If the
 * game-server crashes mid-session and the player reconnects (or the WS
 * eventually closes), Report Agent loses all the difficulty-adjustment
 * history. Meanwhile, server.ts already writes every adjustment to Kafka's
 * `adjustments` topic (audit only) — this consumer turns that audit log
 * into a recoverable in-memory buffer so Report Agent can fall back to it.
 *
 * Memory bound: the eviction sweep removes any session whose newest record
 * is older than 24h. Per-session arrays are unbounded but in practice hold
 * fewer than ~10 entries.
 */

import { Kafka } from 'kafkajs';
import { TOPICS } from './topics.js';
import type { AdjustmentRecord } from '../agents/report-agent.js';

// ── Public API ─────────────────────────────────────────────────────────────────

const sessions = new Map<string, AdjustmentRecord[]>();

export function getAdjustmentsForSession(sessionId: string): AdjustmentRecord[] {
  return sessions.get(sessionId) ?? [];
}

// ── Wire format from server.ts (see TOPICS.ADJUSTMENTS write site) ────────────

interface AdjustmentMessage {
  sessionId: string;
  reason?:   string;
  direction?: 'harder' | 'easier';
  at?:       number;
}

// ── Consumer + eviction ────────────────────────────────────────────────────────

const EVICTION_INTERVAL_MS = 30 * 60 * 1000;    // 30 minutes
const SESSION_TTL_MS       = 24 * 60 * 60 * 1000; // 24 hours

function evictStale() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  let evicted = 0;
  for (const [sessionId, records] of sessions) {
    const newest = records.length === 0 ? 0 : records[records.length - 1].at;
    if (newest < cutoff) {
      sessions.delete(sessionId);
      evicted++;
    }
  }
  if (evicted > 0) console.log(`[AdjustmentsConsumer] Evicted ${evicted} stale session(s)`);
}

export async function startAdjustmentsConsumer(): Promise<void> {
  const kafka    = new Kafka({
    clientId: 'adjustments-buffer',
    brokers:  [process.env.KAFKA_BROKER ?? 'localhost:9092'],
  });
  const consumer = kafka.consumer({ groupId: 'adjustments-buffer-group' });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.ADJUSTMENTS, fromBeginning: false });

  setInterval(evictStale, EVICTION_INTERVAL_MS);

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const msg = JSON.parse(message.value.toString()) as AdjustmentMessage;
        if (!msg.sessionId || !msg.direction || typeof msg.at !== 'number') return;

        const arr = sessions.get(msg.sessionId) ?? [];
        arr.push({
          reason:    msg.reason    ?? '',
          direction: msg.direction,
          at:        msg.at,
        });
        sessions.set(msg.sessionId, arr);
      } catch {
        // skip malformed
      }
    },
  });

  console.log('[AdjustmentsConsumer] Running — buffering difficulty changes from Kafka');
}
