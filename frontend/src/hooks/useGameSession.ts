/**
 * useGameSession — shared hook for every game in NeuroStep.
 *
 * Usage (copy-paste for any new game):
 *   const { sendEvent, adjustment, isConnected, sessionId } = useGameSession('my-game');
 *
 *   sendEvent(action)   → goes to game-server → Kafka "game-events"
 *   adjustment          → DifficultyParams the server decided to change (null until first)
 *   isConnected         → WebSocket status (useful for a debug indicator)
 *   sessionId           → stable UUID for this session (same value injected into every event)
 *
 * Protocol (WebSocket messages):
 *   Browser  → Server:  { ...action, gameId, sessionId, userId }
 *   Server   → Browser: { type: 'adjustment', reason: string, params: Record<string, number> }
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameId } from '../types/game.types';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001';

// Adjustment params — keys are game-specific (circleLifeMs, trainSpeed, …)
export type GameAdjustment = Record<string, number>;

export function useGameSession(gameId: GameId) {
  const wsRef     = useRef<WebSocket | null>(null);
  const sessionId = useRef(`${gameId}-${crypto.randomUUID()}`);
  const userId    = 'anonymous'; // TODO: pull from AuthContext when auth is wired up

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
      } catch { /* ignore malformed messages */ }
    };

    return () => ws.close();
  }, [gameId]);

  // Send any game action — the hook stamps gameId, sessionId, userId automatically
  const sendEvent = useCallback((action: object) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      ...action,
      gameId,
      sessionId: sessionId.current,
      userId,
    }));
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    sendEvent,
    adjustment,
    isConnected,
    sessionId: sessionId.current, // stable string — safe to read directly
    userId,
  };
}
