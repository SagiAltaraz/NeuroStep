/**
 * Game Server — WebSocket + Kafka producer + adaptive engine
 *
 * Responsibilities (this file only):
 *   1. Accept WebSocket connections from the browser
 *   2. Forward every event to Kafka (via kafka/producer.ts)
 *   3. Run per-session adaptive logic → send DifficultyUpdate back to client
 *
 * Infrastructure lives in sub-modules:
 *   kafka/producer.ts    — Kafka client, connect/disconnect, sendToKafka
 *   kafka/topics.ts      — topic name constants
 *   sessions/session-store.ts — in-memory session Map + CRUD helpers
 *   types/game.types.ts  — shared GameEvent, DifficultyParams, etc.
 *
 * .env: loaded from backend/.env (no separate game-server .env)
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

import { WebSocketServer, WebSocket } from 'ws';
import type { GameEvent } from './types/game.types.js';
import { connectProducer, disconnectProducer, sendToKafka, sendGameEvent } from './kafka/producer.js';
import { TOPICS } from './kafka/topics.js';
import { type SessionState, type GameParams, getSession, setSession, deleteSession } from './sessions/session-store.js';

// ── Adaptive engine (shapes-click) ────────────────────────────────────────────
// When other games need adaptive logic, add a case per gameId here.

const WINDOW_SIZE  = 10;
const MIN_EVENTS   = 5;
const COOLDOWN_MS  = 15_000;
const SCORED_TYPES = new Set(['CIRCLE_HIT', 'DISTRACTOR_CLICK', 'TIMEOUT']);

function computeAdjustment(
  state: SessionState,
): { reason: string; params: GameParams } | null {

  if (state.window.length < MIN_EVENTS)               return null;
  if (Date.now() - state.lastAdjustAt < COOLDOWN_MS)  return null;

  const w        = state.window.slice(-WINDOW_SIZE);
  const hits     = w.filter(e => e.type === 'CIRCLE_HIT').length;
  const accuracy = hits / w.length;

  let streak = 0;
  for (let i = w.length - 1; i >= 0; i--) {
    if (w[i].type === 'CIRCLE_HIT') streak++;
    else break;
  }

  let errorStreak = 0;
  for (let i = w.length - 1; i >= 0; i--) {
    if (w[i].type !== 'CIRCLE_HIT') errorStreak++;
    else break;
  }

  const p = { ...state.params };

  if (streak >= 4 && accuracy >= 0.75) {
    p.circleLifeMs    = Math.max(600,  p.circleLifeMs - 300);
    p.distractorCount = Math.min(6,    p.distractorCount + 1);
    return { reason: 'too_easy', params: p };
  }

  if (errorStreak >= 4 && accuracy <= 0.35) {
    p.circleLifeMs    = Math.min(5000, p.circleLifeMs + 400);
    p.distractorCount = Math.max(0,    p.distractorCount - 1);
    return { reason: 'too_hard', params: p };
  }

  return null;
}

// ── WebSocket server ───────────────────────────────────────────────────────────

const PORT = Number(process.env.WS_PORT ?? 3001);
const wss  = new WebSocketServer({ port: PORT });

wss.on('listening', () => console.log(`[GameServer] WebSocket on ws://localhost:${PORT}`));

wss.on('connection', (ws: WebSocket) => {
  console.log('[GameServer] Browser connected');

  ws.on('message', async (raw: Buffer) => {
    let event: GameEvent;
    try {
      event = JSON.parse(raw.toString()) as GameEvent;
    } catch {
      return;
    }

    // 1. Lazy session init
    if (!getSession(ws)) {
      setSession(ws, {
        sessionId:    event.sessionId,
        gameId:       event.gameId,
        params:       { circleLifeMs: 3000, distractorCount: 0 },
        window:       [],
        lastAdjustAt: 0,
      });
      console.log(`[GameServer] Session: ${event.sessionId} (${event.gameId})`);
    }
    const state = getSession(ws)!;

    // 2. Write to Kafka
    try {
      await sendGameEvent(event);
      console.log(`[Kafka] ✓ ${TOPICS.GAME_EVENTS} | ${event.type}`);
    } catch (err) {
      console.error(`[Kafka] ✗ ${TOPICS.GAME_EVENTS} | ${(err as Error).message}`);
    }

    // 3. Update rolling window
    if (SCORED_TYPES.has(event.type)) {
      state.window.push(event);
      if (state.window.length > WINDOW_SIZE * 2) {
        state.window = state.window.slice(-WINDOW_SIZE);
      }
    }

    // 4. Check for adjustment
    const adj = computeAdjustment(state);
    if (!adj) return;

    state.params       = adj.params;
    state.lastAdjustAt = Date.now();
    console.log(`[GameServer] Adjustment (${adj.reason}):`, adj.params);

    // 5. Send adjustment to game
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'adjustment', reason: adj.reason, params: adj.params }));
    }

    // 6. Log adjustment to Kafka (fire-and-forget — don't block the response)
    sendToKafka(TOPICS.ADJUSTMENTS, event.sessionId, { sessionId: event.sessionId, ...adj })
      .catch(err => console.error('[Kafka] adjustments error:', (err as Error).message));
  });

  ws.on('close', () => {
    deleteSession(ws);
    console.log('[GameServer] Browser disconnected');
  });

  ws.on('error', (err) => console.error('[GameServer] WS error:', err.message));
});

// ── Startup / shutdown ─────────────────────────────────────────────────────────

async function start(): Promise<void> {
  await connectProducer();
}

process.on('SIGINT', async () => {
  await disconnectProducer();
  wss.close();
  process.exit(0);
});

start().catch(err => { console.error('[GameServer] Startup failed:', err); process.exit(1); });
