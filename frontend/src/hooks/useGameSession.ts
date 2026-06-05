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
import type { GameId } from '../types/game.types';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001';

export type GameAdjustment = Record<string, number>;

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

  const [isConnected,    setIsConnected]    = useState(false);
  const [adjustment,     setAdjustment]     = useState<GameAdjustment | null>(null);
  const [coachingMessage, setCoachingMessage] = useState<string | null>(null);
  const [telemetry,      setTelemetry]      = useState<AdaptiveTelemetry | null>(null);
  const [lastAdjustment, setLastAdjustment] = useState<AdaptiveAdjustment | null>(null);

  useEffect(() => {
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
        };
        if (msg.type === 'adjustment' && msg.params) {
          console.log(`[${gameId}] Adjustment (${msg.reason}):`, msg.params);
          setAdjustment(msg.params);
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
        } else if (msg.type === 'coaching' && msg.message) {
          setCoachingMessage(msg.message);
          // Auto-clear after 4 seconds so it doesn't linger
          setTimeout(() => setCoachingMessage(null), 4000);
        }
      } catch { /* ignore malformed */ }
    };

    return () => ws.close();
  }, [gameId]);

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

  return {
    sendEvent, adjustment, coachingMessage, isConnected,
    telemetry, lastAdjustment,
    sessionId: sessionId.current, userId,
  };
}
