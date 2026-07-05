import { config }          from 'dotenv';
import { fileURLToPath }   from 'url';
import { resolve, dirname } from 'path';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../backend/.env') });

import { WebSocketServer, WebSocket }                        from 'ws';
import type { GameEvent, GameId }                           from './types/game.types.js';
import { GAME_DOMAINS }                                     from './types/domains.js';
import { connectProducer, disconnectProducer,
         sendToKafka, sendGameEvent }                       from './kafka/producer.js';
import { TOPICS }                                           from './kafka/topics.js';
import { startAdjustmentsConsumer, getAdjustmentsForSession } from './kafka/adjustments-consumer.js';
import { getSession, initSession, deleteSession }           from './sessions/session-store.js';
import { processEvent, persistDifficulty, resumeDifficulty,
         seedLevelFromProfile, applyWarmupSeed, applyTirednessDamping,
         classifyEvent } from './agents/adaptive-agent.js';
import { startAnalyticsAgent, getSessionSnapshot }          from './agents/analytics-agent.js';
import type { SessionSnapshot }                             from './agents/analytics-agent.js';
import { generateSessionReport, deterministicCognitiveScore,
         computeDomainScores }                              from './agents/report-agent.js';
import type { AdjustmentRecord }                            from './agents/report-agent.js';
import { updateBaseline }                                   from './agents/baseline-agent.js';
import { getCoachingMessage, isMeaningfulMoment,
         coachingFallback }                                 from './agents/coaching-agent.js';
import { checkAndRunCoach }                                 from './agents/coach-agent.js';
import { checkAlerts }                                      from './agents/alert-agent.js';
import { updateCognitiveProfile }                           from './agents/profile-agent.js';
import type { ProfileUpdateResult }                         from './agents/profile-agent.js';
import { updateProgression }                                from './agents/progression.js';
import type { LevelChange, ProgressionResult }              from './agents/progression.js';
import { isMilestone }                                      from './agents/milestone.js';
import { startTokenWatcher }                                from './agents/token-watcher.js';
import { flushLiveModel, currentFingerprint }               from './agents/live-model.js';
import { updateTrainingPlan }                               from './agents/planner-agent.js';
import { runDirector, loadDomainSnapshots }                 from './agents/director-agent.js';

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
  // In-process session tracker — the Kafka-INDEPENDENT snapshot source. The
  // analytics agent (a Kafka consumer) is the primary; if Kafka is down or the
  // consumer lags, this local tally still lets the report/profile/progression
  // pipeline finalize the session. The real-time loop was already
  // Kafka-independent; with this, session finalization is too.
  const local = {
    startedAt: 0, lastEventAt: 0,
    hits: 0, misses: 0, timeouts: 0,
    streak: 0, peakStreak: 0,
    reactionTimes: [] as number[],
  };
  function localSnapshot(userId: string, gameId: string): SessionSnapshot | undefined {
    if (!local.startedAt) return undefined;
    const scored = local.hits + local.misses + local.timeouts;
    const avg = local.reactionTimes.length
      ? Math.round(local.reactionTimes.reduce((a, b) => a + b, 0) / local.reactionTimes.length)
      : 0;
    return {
      userId, gameId,
      durationMs:    Math.max(0, local.lastEventAt - local.startedAt),
      hits: local.hits, misses: local.misses, timeouts: local.timeouts,
      accuracy:      scored > 0 ? local.hits / scored : null,
      avgReactionMs: avg,
      peakStreak:    local.peakStreak,
      reactionTimes: local.reactionTimes,
    };
  }
  // Guard so the post-session pipeline runs exactly once per connection —
  // whether triggered by an explicit 'end-session' (normal) or 'close' (abandon).
  let finalized = false;
  // B2: at most one live coaching Claude call per session. Every other
  // adjustment is acknowledged with a Hebrew message from the fallback bank.
  let coachingLlmUsed = false;

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

    const { sessionId, gameId, userId } = session;
    // Primary: the analytics agent's Kafka-fed aggregate. Fallback: the
    // in-process tally, so a Kafka outage never costs the player their
    // report, profile update or level-up.
    let snapshot = getSessionSnapshot(sessionId);
    if (!snapshot) {
      snapshot = localSnapshot(userId, gameId) ?? null;
      if (snapshot) console.warn(`[Finalize] Kafka snapshot missing — using in-process fallback | session=${sessionId}`);
    }
    if (!snapshot) return;

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

    // 2. Deterministic score + per-domain scores (no Claude). These feed both
    //    gamification and the milestone decision that gates the Claude narrative.
    const cognitiveScore = deterministicCognitiveScore(snapshot, session.adaptive);
    const domainScores   = computeDomainScores(cognitiveScore, gameId);

    // 2b. Final live-model flush — the session's behavioral fingerprint
    //     (impulsivity, hesitation, recovery, fatigue, chosen path) lands in
    //     users/{uid}/liveModel/{gameId} exactly as the session ended, and the
    //     playstyle tags ride into the cognitive profile below.
    flushLiveModel(session.adaptive, { force: true })
      .catch(err => console.error('[LiveModel] final flush:', (err as Error).message));
    const { tags: playstyleTags } = currentFingerprint(session.adaptive);

    // 3. Gamification — only on a normal game-over. Profile → progression →
    //    alerts run BEFORE the report so we know whether this session is a
    //    milestone worth a Claude-written narrative.
    let progRes: ProgressionResult | null = null;
    let milestone = false;
    if (opts.withGamification) {
      try {
        const profileRes: ProfileUpdateResult[] = await updateCognitiveProfile(userId, gameId, domainScores, playstyleTags);
        progRes = await updateProgression(userId, profileRes);
        const alertFired = await checkAlerts(userId, gameId, snapshot)
          .catch(err => { console.error('[Alert]', (err as Error).message); return false; });
        const levelChanges: LevelChange[] = progRes.levelChanges;
        milestone = isMilestone({ gameId, profileUpdates: profileRes, levelChanges, alertTriggered: alertFired });

        // 3b. Rebuild the training plan from the (now enriched) profile —
        //     fire-and-forget so it never delays the results push.
        updateTrainingPlan(userId)
          .catch(err => console.error('[Planner]', (err as Error).message));

        // 3c. Director — milestone sessions only (the LLM cadence lives with
        //     the report narrative's). Advisory JSON + prompt snapshot; any
        //     failure simply means "no advice this session".
        if (milestone) {
          loadDomainSnapshots(userId)
            .then(domains => runDirector({
              sessionId, userId, gameId,
              adaptive: session.adaptive,
              domains,
              sessionsTotal: profileRes.find(p => p.domainId === GAME_DOMAINS[gameId].primary)?.sessionsCount,
            }))
            .catch(err => console.error('[Director]', (err as Error).message));
        }
      } catch (err) {
        console.error('[Gamification]', (err as Error).message);
      }
    }

    // 4. Report (persists; narrative via Claude ONLY on milestone sessions —
    //    every other session uses the templated Hebrew narrative, zero tokens).
    let report = null;
    try {
      report = await generateSessionReport(
        { sessionId, snapshot, adaptive: session.adaptive, adjustments },
        { milestone },
      );
    } catch (err) {
      console.error('[Report]', (err as Error).message);
    }

    // 5. Push live results to the still-open socket (normal game-over only).
    if (opts.push && report && progRes) {
      safeSend(ws, {
        type:         'session-report',
        report,
        levelChanges: progRes.levelChanges,
        overallLevel: progRes.overallLevel,
        rank:         progRes.rank,
        avatarState:  progRes.avatarState,
      });
    }

    // 6. Persist the converged difficulty so the next session of this game
    //    resumes where it left off. Runs for both modes.
    persistDifficulty(userId, gameId, session.adaptive.dSmoothed)
      .catch(err => console.error('[Adaptive] persist:', (err as Error).message));

    // 7. Baseline → coach — fire-and-forget, both modes. Alerts already ran in
    //    the gamification path; on abandon run them here for caregivers.
    updateBaseline(userId, gameId, snapshot.reactionTimes)
      .then(() => checkAndRunCoach(userId, gameId).catch(err => console.error('[Coach]', (err as Error).message)))
      .catch(err => console.error('[Baseline]', (err as Error).message));
    if (!opts.withGamification) {
      checkAlerts(userId, gameId, snapshot).catch(err => console.error('[Alert]', (err as Error).message));
    }
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

      // ── Warm-start difficulty BEFORE the first event is processed ────
      // Two tiers, in priority order:
      //   E1 (resume): the user has played THIS game before → snap to the saved
      //     per-game difficulty.
      //   A3 (cross-game transfer): first time on this game, but the cognitive
      //     profile of the domains it trains is strong enough → warm-start from
      //     that ability instead of the cold-start floor.
      // Otherwise the controller cold-starts at D_DEFAULT as usual.
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
      } else if (!resumeParams) {
        const seedLevel = await seedLevelFromProfile(event.userId, event.gameId as GameId);
        if (seedLevel !== null) {
          const warmupParams = applyWarmupSeed(session.adaptive, seedLevel);
          console.log(`[Warmup] ${event.gameId} seedLevel:${seedLevel.toFixed(0)} → D:${session.adaptive.D.toFixed(2)} | user:${event.userId}`);
          if (ws.readyState === WebSocket.OPEN) {
            safeSend(ws, {
              type:      'adjustment',
              reason:    'warmup-transfer',
              params:    warmupParams,
              level:     session.adaptive.D,
              direction: null,
            });
          }
        }
      }

      // ── Daily check-in (B1): ease the opening if the user is tired today ──
      // Runs after resume/seed have set the starting D; only lowers this
      // session's opening, never the persisted level.
      const tiredParams = await applyTirednessDamping(session.adaptive, event.userId);
      if (tiredParams && ws.readyState === WebSocket.OPEN) {
        console.log(`[Tired] ${event.gameId} eased → D:${session.adaptive.D.toFixed(2)} | user:${event.userId}`);
        safeSend(ws, {
          type:      'adjustment',
          reason:    'tired',
          params:    tiredParams,
          level:     session.adaptive.D,
          direction: 'easier',
        });
      }
    }

    // ── 1b. In-process tally (Kafka-independent snapshot source) ──
    {
      const now = Date.now();
      if (!local.startedAt) local.startedAt = now;
      local.lastEventAt = now;
      const kind = classifyEvent(event.gameId, event.type);
      if (kind === 'hit') {
        local.hits++; local.streak++;
        local.peakStreak = Math.max(local.peakStreak, local.streak);
        const rt = event.reactionMs
          ?? (typeof event.payload?.reactionMs === 'number' ? event.payload.reactionMs : undefined);
        if (typeof rt === 'number') local.reactionTimes.push(rt);
      } else if (kind === 'miss' || kind === 'timeout') {
        if (kind === 'miss') local.misses++; else local.timeouts++;
        local.streak = 0;
      }
    }

    // ── 2. Write to Kafka (fire-and-forget) ──────────────────────
    // Audit/analytics only — never block the real-time adaptive loop on the
    // Kafka produce. A slow or degraded broker must not add latency to
    // difficulty adjustments; the write runs concurrently with processEvent and
    // errors are logged and swallowed.
    sendGameEvent(event)
      .then(() => console.log(`[Kafka] ✓ ${event.type} | user:${event.userId}`))
      .catch((err) => console.error(`[Kafka] ✗ ${(err as Error).message}`));

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

      // Live player-model snapshot — throttled inside flushLiveModel (min 15s
      // between writes) and fire-and-forget, so the real-time loop never waits
      // on Firestore. This is the "prompt data" agents read mid-session.
      flushLiveModel(session.adaptive)
        .catch(err => console.error('[LiveModel]', (err as Error).message));
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

    // ── 4b. Async coaching message (gated Claude + fallback bank) ─
    // Fires after the adjustment is already sent — never blocks the game.
    // B2: we spend at most ONE Claude call per session, on the first
    // "meaningful" adjustment; every other adjustment is acknowledged from
    // the Hebrew fallback bank (~1ms, zero tokens). Either way a toast lands.
    {
      const sendCoaching = (message: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'coaching', message }));
        }
      };

      if (!coachingLlmUsed && isMeaningfulMoment({ totalScoredEvents: session.adaptive.totalScoredEvents })) {
        coachingLlmUsed = true;
        const snap        = getSessionSnapshot(session.sessionId);
        const accuracy    = snap?.accuracy ?? 0;
        const durationSec = snap ? Math.round(snap.durationMs / 1000) : 0;
        getCoachingMessage(session.gameId, result.direction!, accuracy, durationSec, session.sessionId)
          .then(sendCoaching)
          .catch(() => {});
      } else {
        sendCoaching(coachingFallback(result.direction!, session.sessionId, 'gated'));
      }
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
    // ANY exit ends the session for real: back button, navigating home/games,
    // or closing the tab. If it already finalized via 'end-session' this is a
    // no-op; otherwise run the FULL pipeline — report, profile, progression,
    // level-up — so the player's progress never depends on pressing a button.
    // (push: false — the socket is gone; the journey map reflects it next load.)
    // NOTE: finalizeSession runs synchronously up to its first await, so the
    // snapshot/session are captured before deleteSession().
    finalizeSession({ withGamification: true, push: false })
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

// Resilience: a single bad event / missing credential / stray rejection must
// never take down the real-time difficulty loop for every connected player.
// Log loudly and keep serving.
process.on('unhandledRejection', (err) => console.error('[GameServer] Unhandled rejection:', err));
process.on('uncaughtException',  (err) => console.error('[GameServer] Uncaught exception:', err));

process.on('SIGINT', async () => {
  await disconnectProducer();
  wss.close();
  process.exit(0);
});

start().catch(err => { console.error('[GameServer] Startup failed:', err); process.exit(1); });
