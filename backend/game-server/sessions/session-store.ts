import type { WebSocket } from 'ws';
import type { GameEvent } from '../types/game.types.js';

// Concrete params used by the adaptive engine.
// Currently shaped for shapes-click; will become a union or generic when
// other games are wired up.
export interface GameParams {
  circleLifeMs:    number;
  distractorCount: number;
}

export interface SessionState {
  sessionId:    string;
  gameId:       string;
  params:       GameParams;
  window:       GameEvent[];   // rolling window of scored events
  lastAdjustAt: number;
}

const sessions = new Map<WebSocket, SessionState>();

export function getSession(ws: WebSocket): SessionState | undefined {
  return sessions.get(ws);
}

export function setSession(ws: WebSocket, state: SessionState): void {
  sessions.set(ws, state);
}

export function deleteSession(ws: WebSocket): void {
  sessions.delete(ws);
}

export function getAllSessions(): Map<WebSocket, SessionState> {
  return sessions;
}
