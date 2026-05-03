import type { WebSocket } from 'ws';
import type { GameId }    from '../types/game.types.js';
import { type AdaptiveState, createAdaptiveState } from '../agents/adaptive-agent.js';

export interface SessionState {
  sessionId: string;
  gameId:    GameId;
  userId:    string;
  adaptive:  AdaptiveState;
}

const sessions = new Map<WebSocket, SessionState>();

export function getSession(ws: WebSocket): SessionState | undefined {
  return sessions.get(ws);
}

export function initSession(ws: WebSocket, sessionId: string, gameId: GameId, userId: string): SessionState {
  const state: SessionState = {
    sessionId,
    gameId,
    userId,
    adaptive: createAdaptiveState(sessionId, gameId, userId),
  };
  sessions.set(ws, state);
  return state;
}

export function deleteSession(ws: WebSocket): void {
  sessions.delete(ws);
}
