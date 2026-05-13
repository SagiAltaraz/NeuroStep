/**
 * In-canvas labels for each Phaser game.
 *
 * Every string the player sees INSIDE a game canvas lives here, in he/en
 * pairs. The React wrapper picks the current language and passes a flat
 * dictionary into the Phaser scene via init data. The scene also exposes
 * `applyLabels(newLabels)` so mid-session toggles update text in place.
 *
 * Template strings use {placeholder} tokens — the scene calls
 * `.replace('{n}', value)` at render time. Add new templates here, not in
 * the scenes.
 */

type Bi = { he: string; en: string };

const TABLE = {
  shapesClick: {
    score:       { he: 'ניקוד',  en: 'SCORE'  },
    streak:      { he: 'רצף',    en: 'STREAK' },
    level:       { he: 'רמה',    en: 'LEVEL'  },
    instruction: { he: 'לחץ על העיגול — אל תיגע בצורות האחרות',
                   en: 'Tap only the circle — avoid every other shape' },
    levelUp:     { he: 'רמה {n}!', en: 'Level {n}!' },
  },
  colorTracking: {
    track:       { he: 'מסלול',  en: 'TRACK' },
    score:       { he: 'ניקוד',  en: 'SCORE' },
    instruction: { he: 'לחץ על התחנה לפי צבע הרכבת לפני שתגיע לצומת',
                   en: 'Tap the matching station before the train reaches the junction' },
    sendTo:      { he: 'שלח לתחנה: {station}', en: 'Send to: {station}' },
    color_red:   { he: 'אדום',   en: 'Red'   },
    color_blue:  { he: 'כחול',   en: 'Blue'  },
    color_green: { he: 'ירוק',   en: 'Green' },
  },
  memory: {
    pairs:         { he: 'זוגות',                            en: 'PAIRS' },
    exposureTime:  { he: 'זמן חשיפה',                        en: 'PEEK TIME' },
    moves:         { he: 'מהלכים',                            en: 'MOVES' },
    statusInitial: { he: 'הפוך שני קלפים — מצא זוגות תואמים', en: 'Flip two cards — find matching pairs' },
    newRound:      { he: 'סיבוב חדש',                         en: 'New round' },
    finished:      { he: 'סיימת ב־{moves} מהלכים 🎉',         en: 'Finished in {moves} moves 🎉' },
    allFound:      { he: 'כל הזוגות נמצאו!',                  en: 'All pairs found!' },
    timeSec:       { he: '{n}ש׳',                            en: '{n}s' },
  },
  ticTacToe: {
    you:            { he: 'אתה ✖',                  en: 'You ✖' },
    draw:           { he: 'תיקו',                   en: 'Draws' },
    computer:       { he: 'מחשב ⭕',                en: 'CPU ⭕' },
    statusYourTurn: { he: 'התור שלך — בחר משבצת',   en: 'Your turn — pick a square' },
    statusThinking: { he: 'המחשב חושב…',            en: 'Computer is thinking…' },
    statusWon:      { he: 'כל הכבוד 🎉',            en: 'Well done 🎉' },
    statusLost:     { he: 'המחשב ניצח',            en: 'Computer wins' },
    statusDraw:     { he: 'המשחק הסתיים בתיקו',    en: "It's a draw" },
    feedbackWin:    { he: 'ניצחת!',                en: 'You win!' },
    feedbackLose:   { he: 'הפסדת',                 en: 'You lost' },
    feedbackDraw:   { he: 'תיקו',                  en: 'Draw' },
    diffEasy:       { he: 'קל',                    en: 'Easy'   },
    diffMedium:     { he: 'בינוני',                en: 'Medium' },
    diffHard:       { he: 'קשה',                   en: 'Hard'   },
    diffExpert:     { he: 'מומחה',                 en: 'Expert' },
    newRound:       { he: 'סיבוב חדש',             en: 'New round' },
  },
} as const satisfies Record<string, Record<string, Bi>>;

// ── Types ──────────────────────────────────────────────────────────────────────

export type LabelGameId = keyof typeof TABLE;
export type GameLabels<G extends LabelGameId> = Record<keyof typeof TABLE[G], string>;

// ── Helper ─────────────────────────────────────────────────────────────────────

export function getGameLabels<G extends LabelGameId>(
  gameId: G,
  lang: 'he' | 'en',
): GameLabels<G> {
  const game = TABLE[gameId];
  const out = {} as Record<string, string>;
  for (const key in game) {
    out[key] = (game as Record<string, Bi>)[key][lang];
  }
  return out as GameLabels<G>;
}
