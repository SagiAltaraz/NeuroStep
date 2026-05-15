// sync with game-server/types/game.types.ts

export type GameId =
  | 'shapes-click'
  | 'color-trains'
  | 'tictactoe'
  | 'memory';

export type GameEventType =
  // shapes-click
  | 'ROUND_START'
  | 'CIRCLE_HIT'
  | 'DISTRACTOR_CLICK'
  | 'TIMEOUT'
  // color-trains
  | 'STATION_SELECTED'
  | 'ROUND_END'
  | 'MISSED_SWITCH'
  // tictactoe
  | 'MOVE_MADE'
  | 'GAME_WON'
  | 'GAME_DRAW'
  // memory
  | 'CARD_FLIP'
  | 'PAIR_MATCHED'
  | 'PAIR_MISSED';

export interface GameEvent {
  // identity
  gameId:    GameId;
  sessionId: string;
  userId:    string;
  // event
  type:      GameEventType;
  timestamp: number;
  // performance — fill what applies, leave others undefined
  reactionMs?: number;
  correct?:    boolean;
  score?:      number;
  streak?:     number;
  // anything game-specific goes here
  payload: Record<string, unknown>;
}

// Difficulty parameters sent from server → game.
// Named fields cover common cases; the index signature allows game-specific keys.
export interface DifficultyParams {
  speed?:       number;   // general speed multiplier
  objectCount?: number;   // number of items on screen
  timeoutMs?:   number;   // time window for a correct action
  distractors?: number;   // number of decoy objects
  [key: string]: unknown; // game-specific params (e.g. circleLifeMs, trainSpeed)
}

// Full adjustment message sent from server to client via WebSocket.
export interface DifficultyUpdate {
  sessionId: string;
  gameId:    GameId;
  params:    DifficultyParams;
  reason?:   string;
}
