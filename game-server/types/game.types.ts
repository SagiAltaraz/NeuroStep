// sync with frontend/src/types/game.types.ts

export type GameId =
  | 'shapes-click'
  | 'color-trains'
  | 'tictactoe'
  | 'memory'
  | 'green-light'
  | 'spot-difference'
  | 'where-was-it'
  | 'find-letter';

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
  | 'PAIR_MISSED'
  // green-light
  | 'GO_HIT'
  | 'FALSE_START'
  | 'MISS'
  // spot-difference
  | 'ODD_HIT'
  | 'WRONG_PICK'
  // where-was-it
  | 'SEQUENCE_SHOWN'
  | 'CELL_TAP'
  | 'SEQUENCE_COMPLETE'
  | 'SEQUENCE_FAIL'
  // find-letter
  | 'LETTER_HIT'
  | 'ROUND_COMPLETE';

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
export interface DifficultyParams {
  speed?:       number;
  objectCount?: number;
  timeoutMs?:   number;
  distractors?: number;
  [key: string]: unknown;
}

// Full adjustment message sent from server to client via WebSocket.
export interface DifficultyUpdate {
  sessionId: string;
  gameId:    GameId;
  params:    DifficultyParams;
  reason?:   string;
}
