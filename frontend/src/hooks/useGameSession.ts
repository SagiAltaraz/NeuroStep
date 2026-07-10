/**
 * useGameSession — shared WebSocket hook for every game.
 *
 * Usage:
 *   const { sendEvent, adjustment, isConnected, sessionId } = useGameSession('shapes-click');
 *
 *   sendEvent(action)  → game-server → Kafka "game-events" → Firestore
 *   adjustment         → server computed a difficulty change (null until first)
 *   isConnected        → WebSocket live status
 *   sessionId          → stable UUID for this session
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type { GameId, DifficultyParams } from '../types/game.types';
import type { ProblemId } from '../data/cognitiveProblems';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001';

// If the server never pushes a 'session-report' (e.g. a trivial sub-5-event
// session, or Claude+Firestore stalling), stop waiting and release the socket.
const REPORT_TIMEOUT_MS = 12_000;

export type GameAdjustment = Record<string, number>;

// ── End-of-session result types (mirror game-server payloads) ────────────────

export type Rank = 'beginner' | 'explorer' | 'advanced' | 'expert' | 'champion';
export type AvatarState = 'idle' | 'climb' | 'drop' | 'celebrate';

/** Quick stats pushed in 'session-summary' — renders the results screen instantly. */
export interface SessionStats {
  accuracy:      number | null;
  avgReactionMs: number;
  hits:          number;
  misses:        number;
  timeouts:      number;
  peakStreak:    number;
  durationSec:   number;
}

/** One journey-map node move, from the progression engine. */
export interface LevelChange {
  domainId: ProblemId;
  prevNode: number;
  newNode:  number;
  delta:    number;
}

/** Full cognitive report pushed in 'session-report' (persisted shape). */
export interface SessionReport {
  sessionId:         string;
  userId:            string;
  gameId:            GameId;
  generatedAt:       number;
  cognitiveScore:    number;
  summaryHe:         string;
  strengthsHe:       string[];
  recommendationsHe: string[];
  domainScores:      Record<ProblemId, number>;
  rawStats: {
    accuracy:        number | null;
    avgReactionMs:   number;
    peakStreak:      number;
    durationMs:      number;
    adjustmentCount: number;
    netDirection:    'harder' | 'easier' | 'stable';
  };
  // Phase E2 — the difficulty the session converged to (optional for back-compat
  // with reports persisted before E2 shipped).
  difficulty?:    number;            // 0..1 smoothed level
  currentConfig?: DifficultyParams;  // per-game params at that difficulty
}

/**
 * The single source of truth the results overlay (F2) reads.
 *   phase 'none'    → no end-of-session data yet
 *   phase 'summary' → quick stats arrived; report still computing
 *   phase 'report'  → full report + gamification arrived
 */
export interface SessionResult {
  phase:        'none' | 'summary' | 'report';
  stats?:       SessionStats;
  report?:      SessionReport;
  domainScores?: Record<ProblemId, number>;
  levelChanges?: LevelChange[];
  overallLevel?: number;
  rank?:         Rank;
  avatarState?:  AvatarState;
}

const INITIAL_RESULT: SessionResult = { phase: 'none' };

/** Live difficulty telemetry — what the adaptive controller currently sees. */
export interface AdaptiveTelemetry {
  P:        number | null;   // performance score 0..1
  D:        number;          // difficulty level 0..1
  accuracy: number;          // recent accuracy 0..1
  events:   number;          // scored events this session
}

/** The most recent difficulty change the server applied. */
export interface AdaptiveAdjustment {
  reason:    string;
  params:    GameAdjustment;
  level:     number | null;        // D after the change
  direction: 'harder' | 'easier' | null;
  count:     number;               // how many adjustments so far this session
  at:        number;
}

export function useGameSession(gameId: GameId) {
  const { user } = useAuth();
  const userId   = user?.id ?? 'anonymous';

  const wsRef     = useRef<WebSocket | null>(null);
  const sessionId = useRef(`${gameId}-${crypto.randomUUID()}`);
  const adjustCount = useRef(0);
  const endedRef       = useRef(false);              // guards double end-session
  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isConnected,    setIsConnected]    = useState(false);
  const [adjustment,     setAdjustment]     = useState<GameAdjustment | null>(null);
  const [coachingMessage, setCoachingMessage] = useState<string | null>(null);
  const [telemetry,      setTelemetry]      = useState<AdaptiveTelemetry | null>(null);
  const [lastAdjustment, setLastAdjustment] = useState<AdaptiveAdjustment | null>(null);
  const [sessionResult,  setSessionResult]  = useState<SessionResult>(INITIAL_RESULT);

  useEffect(() => {
    sessionId.current = `${gameId}-${crypto.randomUUID()}`;
    adjustCount.current = 0;
    endedRef.current = false;
    setAdjustment(null);
    setCoachingMessage(null);
    setTelemetry(null);
    setLastAdjustment(null);
    setSessionResult(INITIAL_RESULT);

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen  = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => console.warn(`[${gameId}] WS error — is game-server running?`);

    ws.onmessage = (evt: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(evt.data) as {
          type: string; reason?: string; params?: GameAdjustment; message?: string;
          P?: number | null; D?: number; accuracy?: number; events?: number;
          level?: number | null; direction?: 'harder' | 'easier' | null;
          stats?: SessionStats; report?: SessionReport;
          levelChanges?: LevelChange[]; overallLevel?: number;
          rank?: Rank; avatarState?: AvatarState;
        };
        if (msg.type === 'session-summary' && msg.stats) {
          // Quick stats — render the results screen immediately; report follows.
          setSessionResult(prev => ({ ...prev, phase: 'summary', stats: msg.stats }));
        } else if (msg.type === 'session-report' && msg.report) {
          // Full report + gamification — the terminal message; stop waiting.
          if (reportTimerRef.current) clearTimeout(reportTimerRef.current);
          setSessionResult(prev => ({
            ...prev,
            phase:        'report',
            report:       msg.report,
            domainScores: msg.report!.domainScores,
            levelChanges: msg.levelChanges ?? [],
            overallLevel: msg.overallLevel,
            rank:         msg.rank,
            avatarState:  msg.avatarState,
          }));
          wsRef.current?.close();   // session finalized server-side; release it
        } else if (msg.type === 'adjustment' && msg.params) {
          console.log(`[${gameId}] Adjustment (${msg.reason}):`, msg.params);
          // ddaLevel rides along with the params so games can drive their
          // visible level/variety from the agent-computed difficulty D (0..1)
          // — including the personalised resume/warm-up sent before play starts.
          setAdjustment(typeof msg.level === 'number' ? { ...msg.params, ddaLevel: msg.level } : msg.params);
          adjustCount.current += 1;
          setLastAdjustment({
            reason:    msg.reason ?? '',
            params:    msg.params,
            level:     msg.level ?? null,
            direction: msg.direction ?? null,
            count:     adjustCount.current,
            at:        Date.now(),
          });
        } else if (msg.type === 'telemetry') {
          setTelemetry({
            P:        msg.P ?? null,
            D:        msg.D ?? 0,
            accuracy: msg.accuracy ?? 0,
            events:   msg.events ?? 0,
          });
          // Keep the game's difficulty view live even inside the controller's
          // dead-zone (telemetry fires on every evaluation, adjustments don't).
          if (typeof msg.D === 'number') {
            const d = msg.D;
            setAdjustment(prev => ({ ...(prev ?? {}), ddaLevel: d }));
          }
        } else if (msg.type === 'coaching' && msg.message) {
          setCoachingMessage(msg.message);
          // Auto-clear after 4 seconds so it doesn't linger
          setTimeout(() => setCoachingMessage(null), 4000);
        }
      } catch { /* ignore malformed */ }
    };

    return () => {
      if (reportTimerRef.current) clearTimeout(reportTimerRef.current);
      ws.close();
    };
  }, [gameId, userId]);

  const sendEvent = useCallback((action: object) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      ...action,
      gameId,
      sessionId: sessionId.current,
      userId,
    }));
  }, [gameId, userId]);

  /**
   * Signal game-over. Sends {type:'end-session'} and keeps the socket open so
   * the server can push 'session-summary' then 'session-report'. The socket is
   * closed once the report arrives (in onmessage) or after REPORT_TIMEOUT_MS.
   * Idempotent — safe to call once per game-over.
   */
  const endSession = useCallback(() => {
    const ws = wsRef.current;
    if (endedRef.current) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    endedRef.current = true;
    ws.send(JSON.stringify({ type: 'end-session' }));
    reportTimerRef.current = setTimeout(() => {
      // No report in time (trivial session or a stalled pipeline) — stop waiting.
      reportTimerRef.current = null;
      wsRef.current?.close();
    }, REPORT_TIMEOUT_MS);
  }, []);

  return {
    sendEvent, endSession, adjustment, coachingMessage, isConnected,
    telemetry, lastAdjustment, sessionResult,
    sessionId: sessionId.current, userId,
  };
}
