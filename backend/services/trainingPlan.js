// services/trainingPlan.js
// A deterministic weekly training plan DERIVED from a user's cognitive profile
// — no LLM. Each domain is ranked by weakness (low level) and risk (downward
// trend / deterioration); weaker, declining domains get higher priority and
// more weekly sessions. The plan feeds both the admin Player-File endpoint and
// the self-service companion, so the domain→game/Hebrew maps live here once.

// Domain → the game whose PRIMARY domain it is (inverse of the game-server's
// GAME_DOMAINS).
export const DOMAIN_GAME = {
  'working-memory':      'memory',
  'selective-attention': 'find-letter',
  'divided-attention':   'color-trains',
  'processing-speed':    'spot-difference',
  'reaction-time':       'green-light',
  'response-inhibition': 'shapes-click',
  'strategic-thinking':  'tictactoe',
  'visual-spatial':      'where-was-it',
};

export const DOMAIN_HE = {
  'working-memory':      'זיכרון עבודה',
  'selective-attention': 'קשב סלקטיבי',
  'divided-attention':   'קשב מחולק',
  'processing-speed':    'מהירות עיבוד',
  'reaction-time':       'זמן תגובה',
  'response-inhibition': 'עיכוב תגובה',
  'strategic-thinking':  'חשיבה אסטרטגית',
  'visual-spatial':      'חשיבה חזותית-מרחבית',
};

export const GAME_HE = {
  memory:            'זיכרון',
  'find-letter':     'מצא את האותיות',
  'color-trains':    'רכבות צבעוניות',
  'spot-difference': 'מצא את ההבדל',
  'green-light':     'אור ירוק',
  'shapes-click':    'צורות קופצות',
  tictactoe:         'איקס עיגול',
  'where-was-it':    'איפה זה היה',
};

// Priority score: lower ability + worse trend → higher urgency. Kept as a plain
// weighted sum so the ranking is transparent and testable.
//   base       = 100 − level        (weaker domains score higher)
//   trend      = down +15 · stable 0 · up −10  (improving → less urgent)
//   decline    = deteriorationFlag ? +25 : 0   (a flagged drop dominates)
function priorityScore(domain) {
  const level = clamp(num(domain.level, 0), 0, 100);
  const trendBonus =
    domain.trend === 'down' ? 15 : domain.trend === 'up' ? -10 : 0;
  const declineBonus = domain.deteriorationFlag ? 25 : 0;
  return 100 - level + trendBonus + declineBonus;
}

function priorityBucket(score) {
  if (score >= 70) return { key: 'high',   he: 'גבוהה',  sessionsPerWeek: 4 };
  if (score >= 45) return { key: 'medium', he: 'בינונית', sessionsPerWeek: 3 };
  return { key: 'low', he: 'תחזוקה', sessionsPerWeek: 2 };
}

function reasonHe(domain, gameHe) {
  const dHe = DOMAIN_HE[domain.id] ?? domain.id;
  const level = num(domain.level, 0);
  if (domain.deteriorationFlag) return `זוהתה ירידה ב${dHe} — חיזוק ממוקד ב"${gameHe}".`;
  if (domain.trend === 'down')  return `${dHe} במגמת ירידה — כדאי לתרגל ב"${gameHe}".`;
  if (level < 40)               return `${dHe} עדיין חלש — התמקדות ב"${gameHe}".`;
  if (level < 70)               return `${dHe} ברמה בינונית — תרגול קבוע ב"${gameHe}".`;
  return `${dHe} חזק — תחזוקה קלה ב"${gameHe}".`;
}

// buildTrainingPlan(domains) → a ranked weekly plan.
// `domains` is the raw cognitiveProfile array ({ id, level, trend, … }).
// Returns { items[], weeklySessions, focusDomainHe, isColdStart }.
export function buildTrainingPlan(domains) {
  const list = Array.isArray(domains) ? domains.filter((d) => d && d.id) : [];

  if (list.length === 0) {
    return { items: [], weeklySessions: 0, focusDomainHe: null, isColdStart: true };
  }

  const items = list
    .map((d) => {
      const score  = priorityScore(d);
      const bucket = priorityBucket(score);
      const gameId = DOMAIN_GAME[d.id] ?? 'memory';
      const gameHe = GAME_HE[gameId] ?? gameId;
      return {
        domainId:        d.id,
        domainHe:        DOMAIN_HE[d.id] ?? d.id,
        gameId,
        gameHe,
        level:           clamp(Math.round(num(d.level, 0)), 0, 100),
        trend:           d.trend ?? 'stable',
        deterioration:   !!d.deteriorationFlag,
        priority:        bucket.key,
        priorityHe:      bucket.he,
        sessionsPerWeek: bucket.sessionsPerWeek,
        reasonHe:        reasonHe(d, gameHe),
        _score:          score,
      };
    })
    // Highest urgency first; ties broken by lower level so the weakest surfaces.
    .sort((a, b) => b._score - a._score || a.level - b.level)
    .map(({ _score, ...item }) => item);

  const weeklySessions = items.reduce((sum, it) => sum + it.sessionsPerWeek, 0);

  return {
    items,
    weeklySessions,
    focusDomainHe: items[0]?.domainHe ?? null,
    isColdStart:   false,
  };
}

// GAME_DOMAIN — inverse of DOMAIN_GAME: a game → the cognitive domain it is the
// primary trainer of. Used to look up the player's ability in the domain that a
// given game exercises.
export const GAME_DOMAIN = Object.fromEntries(
  Object.entries(DOMAIN_GAME).map(([domain, game]) => [game, domain])
);

// Session-length target bounds (minutes). BASE is a healthy default stint; the
// weakness/risk bonuses stretch it toward MAX for players who need more work.
const TIME = { BASE: 6, MIN: 5, MAX: 15, NEUTRAL: 8 };

// targetMinutesForGame(domains, gameId) → the recommended minutes for ONE
// session of `gameId`, DERIVED from the caller's real cognitive profile and the
// same ranked training plan the rest of the app uses (the "need"):
//   • weaker domain (low level)      → longer session (up to +7 min)
//   • declining / deteriorating      → longer session (+2 / +3 min)
//   • the plan's own priority bucket → keeps it consistent (high ≥ 8, low ≤ 10)
// Neutral, non-committal target when we have no signal for this game's domain
// (brand-new user, or that domain never played) — never a fake-precise number.
// `domains` is the raw cognitiveProfile array ({ id, level, trend, … }).
export function targetMinutesForGame(domains, gameId) {
  const domainId = GAME_DOMAIN[gameId] ?? null;
  const list = Array.isArray(domains) ? domains.filter((d) => d && d.id) : [];

  if (!domainId || list.length === 0) {
    return { gameId, domainId, minutes: TIME.NEUTRAL, basis: 'neutral' };
  }

  const item = buildTrainingPlan(list).items.find((it) => it.gameId === gameId);
  if (!item) {
    return { gameId, domainId, minutes: TIME.NEUTRAL, basis: 'neutral' };
  }

  //   weakness: 0 (level 100) … +7 (level 0)
  //   risk:     deterioration +3 · down-trend +2 · else 0
  const weaknessBonus = Math.round(((100 - item.level) / 100) * 7);
  const riskBonus = item.deterioration ? 3 : item.trend === 'down' ? 2 : 0;
  let minutes = TIME.BASE + weaknessBonus + riskBonus;

  // Anchor to the plan's priority so the number never contradicts the ranking.
  if (item.priority === 'high') minutes = Math.max(minutes, 8);
  if (item.priority === 'low')  minutes = Math.min(minutes, 10);

  return {
    gameId,
    domainId,
    minutes: clamp(minutes, TIME.MIN, TIME.MAX),
    basis: 'profile',
    level: item.level,
    priority: item.priority,
  };
}

// ── tiny helpers ──────────────────────────────────────────────────
function num(v, d) { return typeof v === 'number' && !Number.isNaN(v) ? v : d; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
