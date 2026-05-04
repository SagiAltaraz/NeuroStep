import { config }          from 'dotenv';
import { fileURLToPath }   from 'url';
import { resolve, dirname } from 'path';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

import { WebSocketServer, WebSocket }                        from 'ws';
import type { GameEvent, GameId }                           from './types/game.types.js';
import { connectProducer, disconnectProducer,
         sendToKafka, sendGameEvent }                       from './kafka/producer.js';
import { TOPICS }                                           from './kafka/topics.js';
import { startAdjustmentsConsumer, getAdjustmentsForSession } from './kafka/adjustments-consumer.js';
import { getSession, initSession, deleteSession }           from './sessions/session-store.js';
import { processEvent }                                     from './agents/adaptive-agent.js';
import { startAnalyticsAgent, getSessionSnapshot }          from './agents/analytics-agent.js';
import { generateSessionReport }                            from './agents/report-agent.js';
import type { AdjustmentRecord }                            from './agents/report-agent.js';
import { updateBaseline }                                   from './agents/baseline-agent.js';
import { getCoachingMessage }                               from './agents/coaching-agent.js';
import { checkAndRunCoach }                                 from './agents/coach-agent.js';
import { checkAlerts }                                      from './agents/alert-agent.js';
import { startTokenWatcher }                                from './agents/token-watcher.js';

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
      direction: result.direction ?? 'harder',
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

    // ── 4b. Async coaching message (Claude + fallback) ───────────
    // Fires after the adjustment is already sent — never blocks the game.
    // Arrives ~300-600ms later (Claude) or ~1ms later (fallback) as a
    // separate 'coaching' WS message. Always returns a string now — the
    // Hebrew fallback bank guarantees a toast even if Claude fails.
    {
      const snap        = getSessionSnapshot(session.sessionId);
      const accuracy    = snap?.accuracy ?? 0;
      const durationSec = snap ? Math.round(snap.durationMs / 1000) : 0;
      getCoachingMessage(session.gameId, result.direction!, accuracy, durationSec, session.sessionId)
        .then(message => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'coaching', message }));
          }
        })
        .catch(() => {});
    }

    // ── 5. Log adjustment to Kafka ───────────────────────────────
    // Includes `direction` and `at` so the adjustments-consumer can rebuild
    // the same AdjustmentRecord shape Report Agent expects (used as crash
    // recovery when the in-memory adjustmentLog is empty at WS-close).
    sendToKafka(TOPICS.ADJUSTMENTS, event.sessionId, {
      sessionId: event.sessionId,
      userId:    event.userId,
      gameId:    event.gameId,
      reason:    result.reason,
      direction: result.direction,
      at:        Date.now(),
      params:    result.params,
    }).catch(err => console.error('[Kafka] adjustments:', (err as Error).message));
  });

  ws.on('close', () => {
    const session = getSession(ws);
    if (session && session.adaptive.totalScoredEvents >= 5) {
      const snapshot = getSessionSnapshot(session.sessionId);
      if (snapshot) {
        const { sessionId, gameId, userId } = session;

        // Crash-recovery: if the in-memory adjustmentLog was wiped (e.g.
        // server restarted mid-session), fall back to the Kafka-buffered
        // copy maintained by adjustments-consumer.
        let adjustmentsForReport = adjustmentLog;
        let adjustmentSource     = 'memory';
        if (adjustmentLog.length === 0) {
          const fromKafka = getAdjustmentsForSession(sessionId);
          if (fromKafka.length > 0) {
            adjustmentsForReport = fromKafka;
            adjustmentSource     = 'kafka';
          }
        }
        console.log(`[Report] adjustments source=${adjustmentSource} count=${adjustmentsForReport.length} session=${sessionId}`);

        // All post-session jobs run in parallel, fire-and-forget.
        // Order doesn't matter — each agent is independently idempotent.

        generateSessionReport({
          sessionId,
          snapshot,
          adaptive:    session.adaptive,
          adjustments: adjustmentsForReport,
        }).catch(err => console.error('[Report]', (err as Error).message));

        updateBaseline(userId, gameId, snapshot.reactionTimes)
          .then(() => {
            // Coach report depends on sessionsCount written by updateBaseline
            checkAndRunCoach(userId, gameId)
              .catch(err => console.error('[Coach]', (err as Error).message));
          })
          .catch(err => console.error('[Baseline]', (err as Error).message));

        checkAlerts(userId, gameId, snapshot)
          .catch(err => console.error('[Alert]', (err as Error).message));
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
  startAdjustmentsConsumer().catch(err =>
    console.error('[AdjustmentsConsumer] Failed to start:', err.message)
  );
  startTokenWatcher().catch(err =>
    console.error('[TokenWatcher] Failed to start:', err.message)
  );
}

process.on('SIGINT', async () => {
  await disconnectProducer();
  wss.close();
  process.exit(0);
});

start().catch(err => { console.error('[GameServer] Startup failed:', err); process.exit(1); });
