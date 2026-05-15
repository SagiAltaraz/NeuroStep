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

  greenLight: {
    emoji: '🚦',
    title: { he: 'אור ירוק',                             en: 'Green Light' },
    desc:  { he: 'אמן זמן תגובה ועיכוב תגובה',           en: 'Train reaction time and response inhibition' },
    rules: [
      { he: 'הרמזור יחליף בין אדום, צהוב וירוק',
        en: 'The light cycles between red, yellow and green' },
      { he: 'לחץ על כפתור TAP רק כשהאור הופך לירוק',
        en: 'Press the TAP button only when the light turns green' },
      { he: 'לחיצה באור אדום או צהוב נחשבת זינוק מוקדם',
        en: 'Pressing during red or yellow counts as a false start' },
      { he: 'אם איחרת ולא לחצת — תפסיד את הסיבוב',
        en: 'If you wait too long the round is lost' },
    ],
    tips: [
      { he: 'הסתכל על האור, לא על הכפתור',
        en: 'Look at the light, not the button' },
      { he: 'נשום עמוק — מתח גורם לתגובה מוקדמת',
        en: 'Breathe deeply — tension causes early reactions' },
      { he: 'התאמן יום יום לתגובה מהירה ומדויקת',
        en: 'Practice daily for fast, accurate reactions' },
    ],
  },

  spotDifference: {
    emoji: '🔍',
    title: { he: 'מצא את ההבדל',                         en: 'Spot the Difference' },
    desc:  { he: 'אמן מהירות עיבוד וקשב סלקטיבי',         en: 'Train processing speed and selective attention' },
    rules: [
      { he: 'תוצג רשת של צורות זהות',
        en: 'A grid of identical shapes will appear' },
      { he: 'בדיוק צורה אחת שונה מהאחרות',
        en: 'Exactly one shape differs from the rest' },
      { he: 'הקש על הצורה השונה לפני שיגמר הזמן',
        en: 'Tap the odd one before the timer runs out' },
      { he: 'לחיצה שגויה תפסיק את הסיבוב',
        en: 'A wrong tap ends the round' },
    ],
    tips: [
      { he: 'סרוק את הרשת בעין שלמה במקום אחד-אחד',
        en: 'Scan the grid with a wide gaze, not item by item' },
      { he: 'שים לב לצבע, לסיבוב ולגודל',
        en: 'Look at color, rotation and size' },
      { he: 'התאמן באופן קבוע לסריקה מהירה יותר',
        en: 'Practice regularly for faster scanning' },
    ],
  },

  whereWasIt: {
    emoji: '🧩',
    title: { he: 'איפה זה היה?',                          en: 'Where Was It?' },
    desc:  { he: 'אמן זיכרון חזותי-מרחבי ועבודה',         en: 'Train visual-spatial and working memory' },
    rules: [
      { he: 'משבצות בלוח יידלקו אחת אחרי השנייה',
        en: 'Squares on the board light up one after another' },
      { he: 'שנן את הסדר שבו הן נדלקו',
        en: 'Remember the order they lit up' },
      { he: 'הקש על המשבצות באותו סדר בדיוק',
        en: 'Tap the squares in the exact same order' },
      { he: 'הקשה שגויה אחת מאפסת את הסיבוב',
        en: 'A single wrong tap restarts the round' },
    ],
    tips: [
      { he: 'הסתכל על המסך כולו — אל תתמקד במשבצת אחת',
        en: 'Look at the whole board — not at a single square' },
      { he: 'נסה להגיד את המיקומים בלב כשהם נדלקים',
        en: 'Say the positions silently as they light up' },
      { he: 'התאמן באופן קבוע לחיזוק הזיכרון לטווח קצר',
        en: 'Practice regularly to strengthen short-term memory' },
    ],
  },

  findLetter: {
    emoji: '🔤',
    title: { he: 'מצא את האות',                           en: 'Find the Letter' },
    desc:  { he: 'אמן קשב סלקטיבי ומהירות עיבוד',         en: 'Train selective attention and processing speed' },
    rules: [
      { he: 'אות יעד מוצגת בראש המסך',
        en: 'A target letter is shown at the top of the screen' },
      { he: 'מתחתיה רשת של אותיות',
        en: 'Below it is a grid of letters' },
      { he: 'הקש על כל מופע של אות היעד לפני שהזמן ייגמר',
        en: 'Tap every instance of the target letter before time runs out' },
      { he: 'הקשה שגויה מורידה נקודות',
        en: 'A wrong tap costs you points' },
    ],
    tips: [
      { he: 'סרוק שורה אחר שורה',
        en: 'Scan row by row' },
      { he: 'תפוס את הצורה של האות, לא את שמה',
        en: 'Catch the shape of the letter, not its name' },
      { he: 'התאמן באופן קבוע לחיזוק הקשב הסלקטיבי',
        en: 'Practice regularly to sharpen selective attention' },
    ],
  },
};
