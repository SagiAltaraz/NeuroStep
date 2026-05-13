/**
 * Per-game instructions content (bilingual).
 *
 * Adding a new game's instructions:
 *   1. Add an entry below keyed by the game's id (matches GamesPage.tsx)
 *   2. Provide emoji + bilingual title/desc/rules/tips
 *   3. <GameInstructionsView gameId="..." /> picks it up automatically
 */

type Bi = { he: string; en: string };

export interface GameInstructionsData {
  emoji: string;
  title: Bi;
  desc:  Bi;
  rules: Bi[];
  tips:  Bi[];
}

export const GAME_INSTRUCTIONS: Record<string, GameInstructionsData> = {

  shapesClick: {
    emoji: '🔵',
    title: { he: 'צורות שקופצות',                en: 'Pop the Circles' },
    desc:  { he: 'אמן עיכוב תגובה וקשב סלקטיבי', en: 'Train response inhibition and selective attention' },
    rules: [
      { he: 'צורות שונות יקפצו על המסך בצורה אקראית',
        en: 'Different shapes will pop up at random positions' },
      { he: 'לחץ רק על עיגולים — כמה שיותר מהר',
        en: 'Tap only the circles — as fast as you can' },
      { he: 'אל תלחץ על משולשים, ריבועים או צורות אחרות',
        en: "Don't tap triangles, squares, or any other shapes" },
      { he: 'לחיצה שגויה תוריד נקודות',
        en: 'Wrong taps reduce your score' },
    ],
    tips: [
      { he: 'הסתכל על הצורה לפני שאתה לוחץ — שניה אחת של בדיקה שווה!',
        en: 'Glance at the shape before tapping — a single second of checking pays off!' },
      { he: 'דיוק חשוב יותר ממהירות בשלבים מתקדמים',
        en: 'At higher levels accuracy beats speed' },
      { he: 'התאמן להגדיל את מהירות הסינון החזותי',
        en: 'Practice speeding up your visual filtering' },
    ],
  },

  memory: {
    emoji: '🃏',
    title: { he: 'משחק זיכרון',             en: 'Memory Match' },
    desc:  { he: 'אמן זיכרון חזותי וריכוז', en: 'Train visual memory and focus' },
    rules: [
      { he: 'לוח קלפים הפוכים מוצג על המסך',
        en: 'A board of face-down cards is shown' },
      { he: 'לחץ על קלף כלשהו כדי לגלות אותו',
        en: 'Tap any card to flip it over' },
      { he: 'לחץ על קלף שני — אם הם תואמים, הם נשארים גלויים',
        en: "Tap a second card — if they match, they stay face-up" },
      { he: 'אם אינם תואמים, שניהם יתהפכו חזרה',
        en: "If they don't match, both flip back down" },
      { he: 'מצא את כל הזוגות בכמה שפחות מהלכים',
        en: 'Find all the pairs in as few moves as possible' },
    ],
    tips: [
      { he: 'שנן את מיקום הקלפים שנחשפו גם אם לא הצלחת לצרף זוג',
        en: 'Memorize the position of every revealed card, even when you miss the match' },
      { he: 'התחל מפינות — קל יותר לנווט את הלוח',
        en: 'Start from the corners — the board is easier to navigate that way' },
      { he: 'התאמן באופן קבוע לשיפור הזיכרון לטווח קצר',
        en: 'Play regularly to sharpen short-term memory' },
    ],
  },

  ticTacToe: {
    emoji: '✖️',
    title: { he: 'איקס עיגול',                       en: 'Tic-Tac-Toe' },
    desc:  { he: 'אמן חשיבה אסטרטגית ותכנון קדימה',  en: 'Train strategic thinking and planning ahead' },
    rules: [
      { he: 'אתה משחק נגד המחשב על לוח 3×3',
        en: 'You play against the computer on a 3×3 board' },
      { he: 'לחץ על ריבוע ריק כדי לסמן X',
        en: 'Tap an empty square to mark it X' },
      { he: 'הראשון ליצור שלושה סימנים ברצף (שורה, עמודה, אלכסון) מנצח',
        en: 'First to line up three marks (row, column, or diagonal) wins' },
      { he: 'אם כל הריבועים מלאים ואין מנצח — זה תיקו',
        en: "If every square is filled with no winner, it's a draw" },
    ],
    tips: [
      { he: 'תמיד חשוב גם על ההתקפה וגם על ההגנה',
        en: 'Always think about both offense and defense' },
      { he: 'הפינות הן המיקומים החזקים ביותר בלוח',
        en: 'Corners are the strongest squares on the board' },
      { he: 'שים לב לשניים ברצף של המחשב — חסום אותם!',
        en: "Watch for two of the computer's marks in a row — block them!" },
    ],
  },

  colorTracking: {
    emoji: '🚂',
    title: { he: 'רכבות הצבעים',                          en: 'Color Trains' },
    desc:  { he: 'אימון קוגניטיבי לשיפור יכולות המוח',   en: 'Cognitive training to strengthen your mind' },
    rules: [
      { he: 'רכבת צבעונית תופיע על המסך',
        en: 'A colored train will appear on screen' },
      { he: 'שים לב לצבע הרכבת',
        en: 'Pay attention to its color' },
      { he: 'לחץ על התחנה בצבע המתאים לרכבת',
        en: 'Tap the station that matches the train\'s color' },
      { he: 'ככל שתהיה מהיר ומדויק יותר, תצבור יותר נקודות',
        en: 'The faster and more accurate you are, the more points you score' },
    ],
    tips: [
      { he: 'התרכז בצבע הרכבת מיד כשהיא מופיעה',
        en: "Lock onto the train's color the moment it appears" },
      { he: 'דיוק חשוב יותר ממהירות — קח את הזמן שלך',
        en: 'Accuracy matters more than speed — take your time' },
      { he: 'התאמן באופן קבוע לשיפור התוצאות',
        en: 'Practice regularly to improve results' },
    ],
  },
};
