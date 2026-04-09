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

export function useGameSession(gameId: GameId) {
  const { user } = useAuth();
  const userId   = user?.id ?? 'anonymous';

  const wsRef     = useRef<WebSocket | null>(null);
  const sessionId = useRef(`${gameId}-${crypto.randomUUID()}`);

  const [isConnected, setIsConnected] = useState(false);
  const [adjustment,  setAdjustment]  = useState<GameAdjustment | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen  = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => console.warn(`[${gameId}] WS error — is game-server running?`);

    ws.onmessage = (evt: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(evt.data) as { type: string; reason: string; params: GameAdjustment };
        if (msg.type === 'adjustment') {
          console.log(`[${gameId}] Adjustment (${msg.reason}):`, msg.params);
          setAdjustment(msg.params);
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

  return { sendEvent, adjustment, isConnected, sessionId: sessionId.current, userId };
}
