/**
 * Hebrew fallback messages for the Coaching Agent.
 *
 * Used when Claude is down, rate-limited, or returns a message that fails
 * CoachingMessageSchema. Without this fallback bank, a difficulty change
 * would land with no toast — the player sees the game speed up/slow down
 * with zero acknowledgement.
 *
 * Content rules (each sentence — also enforced by CoachingMessageSchema):
 *   - Exactly 1 sentence, ≤ 8 Hebrew words, ≤ 50 chars
 *   - Forbidden words: קושי, קל, קשה, שינוי, מערכת
 *   - No emoji, no end punctuation, no quotes
 *
 * 15 sentences per direction, distributed:
 *   5 effort     — recognise the player's investment
 *   5 momentum   — recognise their flow / persistence
 *   5 calming    — encourage steady breathing / pacing
 *
 * Tone shifts by direction:
 *   harder → confidence, flow, peak performance
 *   easier → gentleness, persistence, no-pressure
 *
 * NOTE FOR REVIEWER (Guy): The Hebrew copy below was AI-drafted to satisfy
 * the schema constraints. Please read each sentence and edit anything that
 * sounds unnatural or off-brand for elderly users. The structure (15 per
 * direction, 5+5+5 themes) should stay; word choices are open to revision.
 */

type Direction = 'harder' | 'easier';

export const COACHING_FALLBACKS_HE: Record<Direction, readonly string[]> = {
  // ── HARDER — player is excelling. Tone: confident, flowing, peak. ────────────
  harder: [
    // effort
    'אתה משקיע ורואים את זה',
    'הריכוז שלך עושה את ההבדל',
    'כל לחיצה שלך מדויקת',
    'אתה במיטבך עכשיו',
    'ההשקעה שלך משתלמת',
    // momentum
    'אתה בזרימה ממש טובה',
    'תמשיך עם הקצב הזה',
    'הכל הולך לך עכשיו',
    'אתה תופס את הקצב',
    'הראש שלך פתוח כרגע',
    // calming (steady at peak)
    'שמור על הריכוז הנינוח',
    'המשך בנשימה רגועה',
    'הראש בהיר ומדויק',
    'אתה רגוע ומדויק',
    'השלווה שלך עוזרת',
  ],

  // ── EASIER — player is working hard. Tone: gentle, encouraging, patient. ────
  easier: [
    // effort
    'המאמץ שלך ניכר מאוד',
    'אתה לא מוותר וזה יפה',
    'כל ניסיון שלך חשוב',
    'אתה ממשיך וזה הכי חשוב',
    'ההתמדה שלך מרשימה',
    // momentum (= persistence here)
    'כל ניסיון מקרב אותך הלאה',
    'תמשיך לפי הקצב שלך',
    'אתה עובר את זה צעד צעד',
    'תן לעצמך זמן ואתה תצליח',
    'התקדמת קצת ועוד תתקדם',
    // calming
    'נשום עמוק ותתקדם בקצב שלך',
    'קח רגע ותתחיל מחדש',
    'אין צורך למהר עכשיו',
    'שאף ונשוף עוד צעד אחד',
    'תן לעצמך רגע',
  ],
};

// ── Session-scoped recently-used cache ────────────────────────────────────────
// Avoid showing the same fallback twice in a row within one session. Cap is
// small because (a) most sessions have few adjustments and (b) we don't want
// this map to grow unboundedly.

const SESSION_RECENT_CAP   = 3;   // remember last N picks per session
const MAX_SESSIONS_TRACKED = 5;   // FIFO eviction of older sessions

const recentlyUsed = new Map<string, string[]>();

export function pickFallback(direction: Direction, sessionId: string): string {
  const bank   = COACHING_FALLBACKS_HE[direction];
  const recent = recentlyUsed.get(sessionId) ?? [];

  // Filter out recently-used. If the bank is exhausted by recent-use (3 of 15),
  // allow repeats — the spec says repeats are OK once the bank is "covered".
  const eligible = bank.filter(s => !recent.includes(s));
  const pool     = eligible.length > 0 ? eligible : bank;
  const pick     = pool[Math.floor(Math.random() * pool.length)];

  // Update recent (insertion order = age order)
  const newRecent = [...recent, pick].slice(-SESSION_RECENT_CAP);
  recentlyUsed.delete(sessionId);            // re-insert to bump LRU position
  recentlyUsed.set(sessionId, newRecent);

  // FIFO-evict the oldest session if over the cap
  if (recentlyUsed.size > MAX_SESSIONS_TRACKED) {
    const firstKey = recentlyUsed.keys().next().value;
    if (firstKey !== undefined) recentlyUsed.delete(firstKey);
  }

  return pick;
}
