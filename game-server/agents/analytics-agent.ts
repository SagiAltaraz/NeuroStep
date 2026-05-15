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
 *     lastPlayedAt, lastAccuracy, lastAvgReactionMs
 *     (avgReactionMs / stdDevReactionMs / sessionsCount are owned by baseline-agent)
 */

import { Kafka } from 'kafkajs';
import type { GameEvent } from '../types/game.types.js';
import { TOPICS } from '../kafka/topics.js';
import { getDb } from '../firebase.js';

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

  // Reaction times are independent of hit/miss classification — push whenever
  // present so neutral events (e.g. tic-tac-toe MOVE_MADE) still feed baseline.
  const rt = typeof event.reactionMs === 'number' ? event.reactionMs
           : typeof event.payload?.reactionMs === 'number' ? event.payload.reactionMs as number
           : null;
  if (rt !== null && rt > 0) buf.reactionTimes.push(rt);

  // ── Classification ──────────────────────────────────────────────────────────
  // Three buckets: hit / miss / timeout. Anything else is NEUTRAL — counted in
  // totalEvents but not in accuracy. This matters for tic-tac-toe where a single
  // MOVE_MADE is neither correct nor wrong (only the GAME_WON outcome is), and
  // GAME_DRAW is not a loss.
  //
  // ROUND_END carries `correct:boolean` in payload — color-trains uses this.
  // GAME_WON carries `winner:'player'|'ai'` in payload — tic-tac-toe uses this.
  const roundEndCorrect = type === 'ROUND_END'
    ? event.payload?.correct === true
    : null;
  const gameWonByPlayer = type === 'GAME_WON' && event.payload?.winner === 'player';
  const gameWonByAi     = type === 'GAME_WON' && event.payload?.winner === 'ai';

  const isHit = type === 'CIRCLE_HIT' || type === 'PAIR_MATCHED' ||
                type === 'STATION_SELECTED' ||
                roundEndCorrect === true ||
                gameWonByPlayer;
  const isMiss = type === 'DISTRACTOR_CLICK' || type === 'PAIR_MISSED' ||
                 type === 'MISSED_SWITCH' ||
                 roundEndCorrect === false ||
                 gameWonByAi;
  const isTimeout = type === 'TIMEOUT';
  // Implicitly neutral: ROUND_START, MOVE_MADE, GAME_DRAW

  if (isHit) {
    buf.hits++;
    buf.currentStreak++;
    if (buf.currentStreak > buf.peakStreak) buf.peakStreak = buf.currentStreak;
  } else if (isMiss || isTimeout) {
    if (isMiss) buf.misses++;
    if (isTimeout) buf.timeouts++;
    buf.currentStreak = 0;
  }
}

async function flushAll() {
  const db = getDb();
  const dirty = [...buffers.entries()].filter(([, buf]) => buf.dirty);
  if (dirty.length === 0) return;

  const batch = db.batch();

  for (const [sessionId, buf] of dirty) {
    buf.dirty = false;
    const scored  = buf.hits + buf.misses + buf.timeouts;
    // accuracy is null when no scored events exist (e.g. tic-tac-toe session
    // with only MOVE_MADE / ROUND_START / GAME_DRAW). Downstream consumers
    // (Alert / Coach / Report) skip or label such sessions instead of treating
    // 0/0 as 0%.
    const accuracy: number | null = scored > 0 ? buf.hits / scored : null;
    const accuracyRounded = accuracy === null ? null : Math.round(accuracy * 100) / 100;
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
      accuracy:     accuracyRounded,
      avgReactionMs,
      peakStreak:   buf.peakStreak,
    }, { merge: true });

    // Update per-user per-game last-session snapshot.
    // avgReactionMs / stdDevReactionMs / sessionsCount are written by baseline-agent
    // (once per session close, using Welford cross-session statistics).
    const statsRef = db.collection('users').doc(buf.userId)
                       .collection('stats').doc(buf.gameId);
    batch.set(statsRef, {
      lastPlayedAt:      buf.lastEventAt,
      lastAccuracy:      accuracyRounded,
      lastAvgReactionMs: avgReactionMs,
    }, { merge: true });
  }

  await batch.commit();
  console.log(`[Analytics] Flushed ${dirty.length} sessions to Firestore`);
}

// ── Kafka consumer ─────────────────────────────────────────────────────────────

export async function startAnalyticsAgent(): Promise<void> {
  const kafka    = new Kafka({ clientId: 'analytics-agent', brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'] });
  const consumer = kafka.consumer({ groupId: 'analytics-group' });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.GAME_EVENTS, fromBeginning: false });

  // Flush every 5 seconds
  setInterval(() => {
    flushAll().catch(err => console.error('[Analytics] Flush error:', err));
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

// ── Session snapshot (used by report-agent on session end) ─────────────────────

export interface SessionSnapshot {
  userId:        string;
  gameId:        string;
  durationMs:    number;
  hits:          number;
  misses:        number;
  timeouts:      number;
  accuracy:      number | null;   // null when scored events == 0 (e.g. tic-tac-toe with no game completed)
  avgReactionMs: number;
  peakStreak:    number;
  reactionTimes: number[];   // raw array — baseline-agent uses this for Welford update
}

export function getSessionSnapshot(sessionId: string): SessionSnapshot | null {
  const buf = buffers.get(sessionId);
  if (!buf) return null;
  const scored        = buf.hits + buf.misses + buf.timeouts;
  const accuracy: number | null = scored > 0 ? buf.hits / scored : null;
  const avgReactionMs = buf.reactionTimes.length > 0
    ? Math.round(buf.reactionTimes.reduce((a, b) => a + b, 0) / buf.reactionTimes.length)
    : 0;
  return {
    userId:        buf.userId,
    gameId:        buf.gameId,
    durationMs:    buf.lastEventAt - buf.startedAt,
    hits:          buf.hits,
    misses:        buf.misses,
    timeouts:      buf.timeouts,
    accuracy:      accuracy === null ? null : Math.round(accuracy * 100) / 100,
    avgReactionMs,
    peakStreak:    buf.peakStreak,
    reactionTimes: [...buf.reactionTimes],
  };
}
