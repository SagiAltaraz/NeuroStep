import { config }          from 'dotenv';
import { fileURLToPath }   from 'url';
import { resolve, dirname } from 'path';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../backend/.env') });

import { WebSocketServer, WebSocket }                        from 'ws';
import type { GameEvent, GameId }                           from './types/game.types.js';
import { connectProducer, disconnectProducer,
         sendToKafka, sendGameEvent }                       from './kafka/producer.js';
import { TOPICS }                                           from './kafka/topics.js';
import { startAdjustmentsConsumer, getAdjustmentsForSession } from './kafka/adjustments-consumer.js';
import { getSession, initSession, deleteSession }           from './sessions/session-store.js';
import { processEvent, persistDifficulty, resumeDifficulty } from './agents/adaptive-agent.js';
import { startAnalyticsAgent, getSessionSnapshot }          from './agents/analytics-agent.js';
import { generateSessionReport }                            from './agents/report-agent.js';
import type { AdjustmentRecord }                            from './agents/report-agent.js';
import { updateBaseline }                                   from './agents/baseline-agent.js';
import { getCoachingMessage }                               from './agents/coaching-agent.js';
import { checkAndRunCoach }                                 from './agents/coach-agent.js';
import { checkAlerts }                                      from './agents/alert-agent.js';
import { updateCognitiveProfile }                           from './agents/profile-agent.js';
import { updateProgression }                                from './agents/progression.js';
import { startTokenWatcher }                                from './agents/token-watcher.js';

// ── WebSocket server ───────────────────────────────────────────────────────────

const PORT = Number(process.env.WS_PORT ?? 3001);
const wss  = new WebSocketServer({ port: PORT });

wss.on('listening', () => console.log(`[GameServer] WebSocket on ws://localhost:${PORT}`));

// Send JSON to a socket only if it's still open. Never throws.
function safeSend(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(payload)); } catch { /* socket died mid-send */ }
}

wss.on('connection', (ws: WebSocket) => {
  // Per-connection adjustment log — used by report-agent at session end
  const adjustmentLog: AdjustmentRecord[] = [];
  // Guard so the post-session pipeline runs exactly once per connection —
  // whether triggered by an explicit 'end-session' (normal) or 'close' (abandon).
  let finalized = false;

  // Runs the post-session pipeline. Two modes:
  //   • normal game-over ('end-session'): withGamification + push results live
  //     over the still-open socket.
  //   • abandon ('close'): persist report/baseline/alert for caregivers, but
  //     award no gamification and push nothing (socket is closing).
  async function finalizeSession(opts: { withGamification: boolean; push: boolean }): Promise<void> {
    const session = getSession(ws);
    if (!session || finalized) return;
    finalized = true;

    // Trivial sessions don't earn a report (too little signal).
    if (session.adaptive.totalScoredEvents < 5) return;

    const snapshot = getSessionSnapshot(session.sessionId);
    if (!snapshot) return;
    const { sessionId, gameId, userId } = session;

    // Crash-recovery: if the in-memory adjustmentLog was wiped (e.g. server
    // restarted mid-session), fall back to the Kafka-buffered copy.
    let adjustments    = adjustmentLog;
    let adjustmentSrc  = 'memory';
    if (adjustmentLog.length === 0) {
      const fromKafka = getAdjustmentsForSession(sessionId);
      if (fromKafka.length > 0) { adjustments = fromKafka; adjustmentSrc = 'kafka'; }
    }
    console.log(`[Finalize] mode=${opts.push ? 'end-session' : 'abandon'} adjustments=${adjustmentSrc} count=${adjustments.length} session=${sessionId}`);

    // 1. Immediate summary so the results screen can render instantly.
    if (opts.push) {
      safeSend(ws, {
        type: 'session-summary',
        stats: {
          accuracy:      snapshot.accuracy,
          avgReactionMs: snapshot.avgReactionMs,
          hits:          snapshot.hits,
          misses:        snapshot.misses,
          timeouts:      snapshot.timeouts,
          peakStreak:    snapshot.peakStreak,
          durationSec:   Math.round(snapshot.durationMs / 1000),
        },
      });
    }

    // 2. Report (awaited — feeds gamification + the push). Never null unless the
    //    Firestore write itself fails (Claude failures fall back internally).
    let report = null;
    try {
      report = await generateSessionReport({ sessionId, snapshot, adaptive: session.adaptive, adjustments });
    } catch (err) {
      console.error('[Report]', (err as Error).message);
    }

    // 3. Gamification — only on a normal game-over.
    if (opts.withGamification && report) {
      try {
        const profileRes = await updateCognitiveProfile(userId, gameId, report.domainScores);
        const progRes    = await updateProgression(userId, profileRes);
        if (opts.push) {
          safeSend(ws, {
            type:         'session-report',
            report,
            levelChanges: progRes.levelChanges,
            overallLevel: progRes.overallLevel,
            rank:         progRes.rank,
            avatarState:  progRes.avatarState,
          });
        }
      } catch (err) {
        console.error('[Gamification]', (err as Error).message);
      }
    }

    // 4. Persist the converged difficulty so the next session of this game
    //    resumes where it left off (main's D-controller). Runs for both modes.
    persistDifficulty(userId, gameId, session.adaptive.dSmoothed)
      .catch(err => console.error('[Adaptive] persist:', (err as Error).message));

    // 5. Baseline → coach, and alerts — fire-and-forget, run for both modes.
    updateBaseline(userId, gameId, snapshot.reactionTimes)
      .then(() => checkAndRunCoach(userId, gameId).catch(err => console.error('[Coach]', (err as Error).message)))
      .catch(err => console.error('[Baseline]', (err as Error).message));
    checkAlerts(userId, gameId, snapshot).catch(err => console.error('[Alert]', (err as Error).message));
  }

  ws.on('message', async (raw: Buffer) => {
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString()); }
    catch { return; }

    // ── Control message: normal game-over. Keeps the socket open so we can push
    //    results back; the client closes once it receives 'session-report'. ──
    if (parsed && typeof parsed === 'object' && (parsed as { type?: unknown }).type === 'end-session') {
      finalizeSession({ withGamification: true, push: true })
        .catch(err => console.error('[Finalize]', (err as Error).message));
      return;
    }

    const event = parsed as GameEvent;

    // ── 1. Init session on first event ──────────────────────────
    let session = getSession(ws);
    if (!session) {
      session = initSession(ws, event.sessionId, event.gameId as GameId, event.userId);
      console.log(`[GameServer] Session: ${event.sessionId} | game:${event.gameId} | user:${event.userId}`);

      // ── E1: resume same-game difficulty ──────────────────────────
      // Prime the saved baseline + difficulty BEFORE this first event is
      // processed, and snap the game to the resumed difficulty up-front instead
      // of waiting for the controller's first adjustment.
      const resumeParams = await resumeDifficulty(session.adaptive);
      if (resumeParams && ws.readyState === WebSocket.OPEN) {
        console.log(`[Resume] ${event.gameId} → D:${session.adaptive.D.toFixed(2)} | user:${event.userId}`);
        safeSend(ws, {
          type:      'adjustment',
          reason:    'resume',
          params:    resumeParams,
          level:     session.adaptive.D,
          direction: null,
        });
      }
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
      winner:     event.payload?.winner === 'player' || event.payload?.winner === 'ai'
        ? (event.payload.winner as 'player' | 'ai')
        : undefined,
    });

    if (result.debug) {
      console.log(`[Adaptive] P:${result.debug.P?.toFixed(2) ?? '—'} `
        + `D:${result.debug.D.toFixed(2)} `
        + `acc:${(result.debug.accuracy * 100).toFixed(0)}% `
        + `ema:${result.debug.ema?.toFixed(0) ?? '—'}ms `
        + `baseline:${result.debug.baseline?.toFixed(0) ?? '—'}ms`);

      // Live telemetry — fires on every evaluation (even inside the dead-zone)
      // so the client HUD can show the difficulty controller working in real time.
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type:     'telemetry',
          P:        result.debug.P,
          D:        result.debug.D,
          accuracy: result.debug.accuracy,
          events:   session.adaptive.totalScoredEvents,
        }));
      }
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
        type:      'adjustment',
        reason:    result.reason,
        params:    result.params,
        level:     result.debug?.D,
        direction: result.direction,
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
    // Abandon path: browser closed / navigated away / dropped connection. If the
    // session already finalized normally via 'end-session', this is a no-op.
    // Otherwise persist report/baseline/alert/difficulty for caregivers — no
    // gamification, no push. NOTE: finalizeSession runs synchronously up to its
    // first await, so the snapshot/session are captured before deleteSession().
    finalizeSession({ withGamification: false, push: false })
      .catch(err => console.error('[Finalize:abandon]', (err as Error).message));
    deleteSession(ws);
  });
  ws.on('error', (err) => console.error('[GameServer] WS error:', err.message));
});

// ── Startup ────────────────────────────────────────────────────────────────────

async function start() {
  // Kafka is only used for audit/analytics. The real-time adaptive loop runs
  // entirely in-process, so a Kafka outage must NOT take the game-server (and
  // all difficulty adaptation) down. Connect best-effort and carry on.
  try {
    await connectProducer();
  } catch (err) {
    console.error('[Kafka] Producer connect failed — running WITHOUT Kafka '
      + '(adaptation still works; audit/analytics disabled):', (err as Error).message);
  }
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
