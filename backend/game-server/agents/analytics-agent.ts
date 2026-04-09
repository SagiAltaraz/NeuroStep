/**
 * Analytics Agent — Kafka consumer → Firestore
 *
 * Consumes "game-events" topic and writes session summaries to Firestore.
 *
 * Firestore structure:
 *   sessions/{sessionId}
 *     userId, gameId, startedAt, lastEventAt,
 *     totalEvents, hits, misses, timeouts,
 *     accuracy, avgReactionMs, peakStreak
 *
 *   users/{userId}/stats/{gameId}
 *     sessionsCount, avgAccuracy, avgReactionMs, lastPlayedAt
 */

import { Kafka } from 'kafkajs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { GameEvent } from '../types/game.types.js';
import { computeSessionStats } from './adaptive-agent.js';
import { TOPICS } from '../kafka/topics.js';

// ── Firebase Admin init ────────────────────────────────────────────────────────
// Uses the same credentials already in backend/.env

function getFirestoreClient(): Firestore {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId:    process.env.FIREBASE_PROJECT_ID,
        clientEmail:  process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:   process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

// ── In-memory session buffer ───────────────────────────────────────────────────
// We accumulate events per session and flush to Firestore every FLUSH_INTERVAL_MS
// to avoid one Firestore write per event.

const FLUSH_INTERVAL_MS = 5_000;

interface SessionBuffer {
  userId:        string;
  gameId:        string;
  startedAt:     number;
  lastEventAt:   number;
  totalEvents:   number;
  hits:          number;
  misses:        number;
  timeouts:      number;
  reactionTimes: number[];
  peakStreak:    number;
  currentStreak: number;
  dirty:         boolean;  // true = has new events since last flush
}

const buffers = new Map<string, SessionBuffer>();

function applyEvent(event: GameEvent) {
  const { sessionId, userId, gameId, type, timestamp } = event;

  if (!buffers.has(sessionId)) {
    buffers.set(sessionId, {
      userId, gameId,
      startedAt:    timestamp,
      lastEventAt:  timestamp,
      totalEvents:  0,
      hits: 0, misses: 0, timeouts: 0,
      reactionTimes: [],
      peakStreak: 0, currentStreak: 0,
      dirty: false,
    });
  }

  const buf = buffers.get(sessionId)!;
  buf.lastEventAt = timestamp;
  buf.totalEvents++;
  buf.dirty = true;

  const isHit = type === 'CIRCLE_HIT' || type === 'PAIR_MATCHED' ||
                type === 'STATION_SELECTED' || type === 'ROUND_END';
  const isMiss = type === 'DISTRACTOR_CLICK' || type === 'PAIR_MISSED' ||
                 type === 'MISSED_SWITCH' || type === 'MOVE_MADE';
  const isTimeout = type === 'TIMEOUT';

  if (isHit) {
    buf.hits++;
    buf.currentStreak++;
    if (buf.currentStreak > buf.peakStreak) buf.peakStreak = buf.currentStreak;
  } else if (isMiss || isTimeout) {
    if (isMiss) buf.misses++;
    if (isTimeout) buf.timeouts++;
    buf.currentStreak = 0;
  }

  const rt = typeof event.reactionMs === 'number' ? event.reactionMs
           : typeof event.payload?.reactionMs === 'number' ? event.payload.reactionMs as number
           : null;
  if (rt !== null && rt > 0) buf.reactionTimes.push(rt);
}

async function flushAll(db: Firestore) {
  const dirty = [...buffers.entries()].filter(([, buf]) => buf.dirty);
  if (dirty.length === 0) return;

  const batch = db.batch();

  for (const [sessionId, buf] of dirty) {
    buf.dirty = false;
    const scored  = buf.hits + buf.misses + buf.timeouts;
    const accuracy = scored > 0 ? buf.hits / scored : 0;
    const avgReactionMs = buf.reactionTimes.length > 0
      ? Math.round(buf.reactionTimes.reduce((a, b) => a + b, 0) / buf.reactionTimes.length)
      : 0;

    // Write session summary
    const sessionRef = db.collection('sessions').doc(sessionId);
    batch.set(sessionRef, {
      userId:       buf.userId,
      gameId:       buf.gameId,
      startedAt:    buf.startedAt,
      lastEventAt:  buf.lastEventAt,
      totalEvents:  buf.totalEvents,
      hits:         buf.hits,
      misses:       buf.misses,
      timeouts:     buf.timeouts,
      accuracy:     Math.round(accuracy * 100) / 100,
      avgReactionMs,
      peakStreak:   buf.peakStreak,
    }, { merge: true });

    // Update per-user per-game rolling stats
    const statsRef = db.collection('users').doc(buf.userId)
                       .collection('stats').doc(buf.gameId);
    batch.set(statsRef, {
      lastPlayedAt:      buf.lastEventAt,
      lastAccuracy:      Math.round(accuracy * 100) / 100,
      lastAvgReactionMs: avgReactionMs,
      // stdDev is used by adaptive-agent as the personal baseline spread
      ...(computeSessionStats(buf.reactionTimes) && {
        avgReactionMs:    computeSessionStats(buf.reactionTimes)!.mean,
        stdDevReactionMs: computeSessionStats(buf.reactionTimes)!.stdDev,
      }),
    }, { merge: true });
  }

  await batch.commit();
  console.log(`[Analytics] Flushed ${dirty.length} sessions to Firestore`);
}

// ── Kafka consumer ─────────────────────────────────────────────────────────────

export async function startAnalyticsAgent(): Promise<void> {
  const db = getFirestoreClient();

  const kafka    = new Kafka({ clientId: 'analytics-agent', brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'] });
  const consumer = kafka.consumer({ groupId: 'analytics-group' });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.GAME_EVENTS, fromBeginning: false });

  // Flush every 5 seconds
  setInterval(() => {
    flushAll(db).catch(err => console.error('[Analytics] Flush error:', err));
  }, FLUSH_INTERVAL_MS);

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const event = JSON.parse(message.value.toString()) as GameEvent;
        applyEvent(event);
      } catch {
        // skip malformed messages
      }
    },
  });

  console.log('[Analytics] Agent running — consuming game-events → Firestore');
}
