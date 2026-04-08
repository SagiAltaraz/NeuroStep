/**
 * Adaptive Agent
 *
 * Trigger : called by server.ts after every scored event per session
 * Input   : recent GameEvents from the session's rolling window
 * Output  : DifficultyUpdate pushed back to the client via WebSocket
 *
 * Current state: STUB — returns no change.
 *
 * TODO (in priority order):
 *   1. Replace inline computeAdjustment() in server.ts with this agent
 *   2. Read rolling window from Redis  (key: session:{sessionId}:events)
 *      so that the agent survives a server restart
 *   3. Implement per-gameId strategy (shapes-click, color-trains, …)
 *   4. Add trend analysis (not just the last 10 events, but improvement over time)
 */

import type { GameEvent, DifficultyUpdate, GameId } from '../types/game.types.js';

export async function runAdaptiveCheck(
  sessionId:    string,
  recentEvents: GameEvent[],
): Promise<DifficultyUpdate> {
  // Stub — no change
  return {
    sessionId,
    gameId: (recentEvents[0]?.gameId ?? 'shapes-click') as GameId,
    params: {},
    reason: 'stub — adaptive-agent not yet implemented',
  };
}
