import { config }          from 'dotenv';
import { fileURLToPath }   from 'url';
import { resolve, dirname } from 'path';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

import { WebSocketServer, WebSocket }                        from 'ws';
import type { GameEvent, GameId }                           from './types/game.types.js';
import { connectProducer, disconnectProducer,
         sendToKafka, sendGameEvent }                       from './kafka/producer.js';
import { TOPICS }                                           from './kafka/topics.js';
import { getSession, initSession, deleteSession }           from './sessions/session-store.js';
import { processEvent }                                     from './agents/adaptive-agent.js';
import { startAnalyticsAgent, getSessionSnapshot }          from './agents/analytics-agent.js';
import { generateSessionReport }                            from './agents/report-agent.js';
import type { AdjustmentRecord }                            from './agents/report-agent.js';

// ── WebSocket server ───────────────────────────────────────────────────────────

const PORT = Number(process.env.WS_PORT ?? 3001);
const wss  = new WebSocketServer({ port: PORT });

wss.on('listening', () => console.log(`[GameServer] WebSocket on ws://localhost:${PORT}`));

wss.on('connection', (ws: WebSocket) => {
  // Per-connection adjustment log — used by report-agent on close
  const adjustmentLog: AdjustmentRecord[] = [];

  ws.on('message', async (raw: Buffer) => {
    let event: GameEvent;
    try { event = JSON.parse(raw.toString()) as GameEvent; }
    catch { return; }

    // ── 1. Init session on first event ──────────────────────────
    let session = getSession(ws);
    if (!session) {
      session = initSession(ws, event.sessionId, event.gameId as GameId, event.userId);
      console.log(`[GameServer] Session: ${event.sessionId} | game:${event.gameId} | user:${event.userId}`);
    }

    // ── 2. Write to Kafka ────────────────────────────────────────
    try {
      await sendGameEvent(event);
      console.log(`[Kafka] ✓ ${event.type} | user:${event.userId}`);
    } catch (err) {
      console.error(`[Kafka] ✗ ${(err as Error).message}`);
    }

    // ── 3. Run adaptive agent ────────────────────────────────────
    const result = await processEvent(session.adaptive, {
      type:       event.type,
      reactionMs: event.reactionMs
        ?? (typeof event.payload?.reactionMs === 'number' ? event.payload.reactionMs : undefined),
      correct:    event.correct
        ?? (typeof event.payload?.correct === 'boolean' ? event.payload.correct : undefined),
    });

    if (result.debug) {
      console.log(`[Adaptive] ema:${result.debug.ema?.toFixed(0)}ms `
        + `baseline:${result.debug.baseline?.toFixed(0) ?? '—'}ms `
        + `z:${result.debug.zScore?.toFixed(2) ?? '—'} `
        + `trend:${result.debug.trend?.toFixed(1) ?? '—'} `
        + `acc:${(result.debug.accuracy * 100).toFixed(0)}%`);
    }

    if (!result.adjusted || !result.params) return;

    console.log(`[Adaptive] → ${result.reason} | params:`, result.params);

    // Record for end-of-session report
    adjustmentLog.push({
      reason:    result.reason ?? '',
      direction: result.params && Object.values(result.params).some(v => typeof v === 'number' && v > 0)
                   ? 'harder' : 'easier',
      at:        Date.now(),
    });

    // ── 4. Send adjustment to game ───────────────────────────────
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type:   'adjustment',
        reason: result.reason,
        params: result.params,
      }));
    }

    // ── 5. Log adjustment to Kafka ───────────────────────────────
    sendToKafka(TOPICS.ADJUSTMENTS, event.sessionId, {
      sessionId: event.sessionId,
      userId:    event.userId,
      gameId:    event.gameId,
      reason:    result.reason,
      params:    result.params,
    }).catch(err => console.error('[Kafka] adjustments:', (err as Error).message));
  });

  ws.on('close', () => {
    const session = getSession(ws);
    if (session && session.adaptive.totalScoredEvents >= 5) {
      const snapshot = getSessionSnapshot(session.sessionId);
      if (snapshot) {
        generateSessionReport({
          sessionId:   session.sessionId,
          snapshot,
          adaptive:    session.adaptive,
          adjustments: adjustmentLog,
        }).catch(err => console.error('[Report] Failed:', (err as Error).message));
      }
    }
    deleteSession(ws);
  });
  ws.on('error', (err) => console.error('[GameServer] WS error:', err.message));
});

// ── Startup ────────────────────────────────────────────────────────────────────

async function start() {
  await connectProducer();
  startAnalyticsAgent().catch(err =>
    console.error('[Analytics] Failed to start:', err.message)
  );
}

process.on('SIGINT', async () => {
  await disconnectProducer();
  wss.close();
  process.exit(0);
});

start().catch(err => { console.error('[GameServer] Startup failed:', err); process.exit(1); });
