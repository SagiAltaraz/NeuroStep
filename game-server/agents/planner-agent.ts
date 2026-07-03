/**
 * Planner Agent — the personalised training prescription.
 *
 * Trigger : server.ts finalize pipeline, after profile + progression complete.
 * Input   : the user's full cognitive profile (all domains ever touched).
 * Output  : users/{userId}/trainingPlan/current — ONE doc, rebuilt every session.
 *
 * Deterministic by design: which abilities need work is a ranking problem, not
 * a language problem, so no tokens are spent here. Priority order:
 *   1. deteriorating domains (the caregiver-facing flag) — protect first
 *   2. trending-down domains
 *   3. lowest-level domains
 * … all gated on MIN_CONFIDENCE so we never prescribe from noise. Games are
 * chosen through GAME_DOMAINS (primary trainers first), and each recommended
 * game gets a warm-start difficulty from the SAME cross-game blend the live
 * controller uses (seedLevelFromProfile's formula) so plan and play agree.
 *
 * The pure core (computeTrainingPlan) is unit-tested; the async wrapper only
 * adds the Firestore read/write.
 */

import { getDb }                       from '../firebase.js';
import type { GameId }                 from '../types/game.types.js';
import { GAME_DOMAINS }                from '../types/domains.js';
import type { ProblemId }              from '../types/domains.js';
import { PLANNER_TUNING, CROSSGAME_TUNING } from './progression.config.js';
import type { Trend }                  from './profile-agent.js';

export const PLAN_SCHEMA_VERSION = 1;

// The slice of a domain profile the planner needs (subset of ProfileState + id).
export interface DomainSnapshot {
  domainId:          ProblemId;
  level:             number;      // 0..100
  confidence:        number;      // 0..1
  trend:             Trend;
  plateauCount:      number;
  deteriorationFlag: boolean;
}

export interface TrainingPlan {
  focusDomains:      ProblemId[];
  recommendedGames:  GameId[];
  targetDifficulty:  Partial<Record<GameId, number>>;  // 0..1 warm-start per game
  weeklyGoal:        string;                           // Hebrew, user-facing
  rationaleHe:       string;                           // Hebrew, caregiver-facing
  nextReviewAt:      number;
  updatedAt:         number;
  v:                 number;
}

// Hebrew labels for the plan text (kept local — the report agent owns its own copy).
const DOMAIN_HE: Record<ProblemId, string> = {
  'working-memory':      'זיכרון עבודה',
  'selective-attention': 'קשב ממוקד',
  'divided-attention':   'קשב מחולק',
  'processing-speed':    'מהירות עיבוד',
  'reaction-time':       'זמן תגובה',
  'response-inhibition': 'שליטה עצמית',
  'strategic-thinking':  'חשיבה אסטרטגית',
  'visual-spatial':      'תפיסה מרחבית',
};

// ── Pure core ────────────────────────────────────────────────────────────────

// Rank value for the focus ordering — smaller = more urgent.
function urgency(d: DomainSnapshot): number {
  if (d.deteriorationFlag)  return 0;                     // protect first
  if (d.trend === 'down')   return 1;
  return 2;                                               // then weakest by level
}

/**
 * Build the plan from the domain snapshots. Deterministic; `now` injectable
 * for tests. Domains below MIN_CONFIDENCE are excluded from focus ranking but
 * still count as "untouched" candidates when nothing else qualifies.
 */
export function computeTrainingPlan(
  domains: DomainSnapshot[],
  now: number = Date.now(),
  tuning = PLANNER_TUNING,
): TrainingPlan {
  const eligible = domains.filter(d => d.confidence >= tuning.MIN_CONFIDENCE);

  // Sort: deteriorating → declining → lowest level. Ties break on level.
  const ranked = [...eligible].sort((a, b) =>
    urgency(a) - urgency(b) || a.level - b.level);

  const focusDomains = ranked.slice(0, tuning.FOCUS_COUNT).map(d => d.domainId);

  // Games whose PRIMARY domain is in focus come first (they train it hardest),
  // then games touching a focus domain as secondary. Dedup, cap at GAMES_MAX.
  const games: GameId[] = [];
  const allGames = Object.keys(GAME_DOMAINS) as GameId[];
  for (const focus of focusDomains) {
    for (const g of allGames) {
      if (GAME_DOMAINS[g].primary === focus && !games.includes(g)) games.push(g);
    }
  }
  for (const focus of focusDomains) {
    for (const g of allGames) {
      if (GAME_DOMAINS[g].secondary.includes(focus) && !games.includes(g)) games.push(g);
    }
  }
  const recommendedGames = games.slice(0, tuning.GAMES_MAX);

  // Warm-start difficulty per recommended game — the same confidence-weighted
  // primary+secondary blend as seedLevelFromProfile, damped by WARMUP_FACTOR,
  // so the plan's number is exactly where the controller would open the game.
  const byId = new Map(domains.map(d => [d.domainId, d]));
  const targetDifficulty: Partial<Record<GameId, number>> = {};
  for (const g of recommendedGames) {
    const { primary, secondary } = GAME_DOMAINS[g];
    let num = 0, den = 0;
    const parts: [ProblemId, number][] = [
      [primary, CROSSGAME_TUNING.W_PRIMARY],
      ...secondary.map(s => [s, CROSSGAME_TUNING.W_SECONDARY] as [ProblemId, number]),
    ];
    for (const [dom, w] of parts) {
      const p = byId.get(dom);
      if (!p || p.confidence < CROSSGAME_TUNING.MIN_CONFIDENCE) continue;
      num += p.level * w * p.confidence;
      den += w * p.confidence;
    }
    if (den > 0) {
      const seeded = (num / den / 100) * CROSSGAME_TUNING.WARMUP_FACTOR;
      targetDifficulty[g] = Math.round(Math.min(1, Math.max(0, seeded)) * 1000) / 1000;
    }
  }

  // Hebrew narrative — templated, zero tokens, honest about WHY.
  const focusHe = focusDomains.map(d => DOMAIN_HE[d]).join(' ו');
  const declining = ranked.filter(d => urgency(d) <= 1).length > 0;
  const weeklyGoal = focusDomains.length
    ? `${tuning.SESSIONS_PER_WEEK} תרגולים השבוע עם דגש על ${focusHe}`
    : `${tuning.SESSIONS_PER_WEEK} תרגולים השבוע להיכרות עם המשחקים`;
  const rationaleHe = focusDomains.length
    ? declining
      ? `זיהינו ירידה קלה ב${focusHe}, לכן השבוע נחזק בעדינות את התחומים האלה עם תרגולים קצרים וקבועים`
      : `${focusHe} הם התחומים עם הכי הרבה מקום לצמיחה כרגע, ותרגול מכוון בהם ישפיע גם על שאר המשחקים`
    : 'עוד אין מספיק נתונים לתוכנית מדויקת — כמה תרגולים ראשונים יבנו את הפרופיל';

  return {
    focusDomains, recommendedGames, targetDifficulty,
    weeklyGoal, rationaleHe,
    nextReviewAt: now + tuning.REVIEW_DAYS * 24 * 60 * 60 * 1000,
    updatedAt:    now,
    v:            PLAN_SCHEMA_VERSION,
  };
}

// ── Firestore wrapper ────────────────────────────────────────────────────────

function readSnapshot(d: Record<string, unknown>): DomainSnapshot | null {
  const num = (v: unknown, fb: number) => (typeof v === 'number' ? v : fb);
  if (typeof d.domainId !== 'string') return null;
  return {
    domainId:          d.domainId as ProblemId,
    level:             num(d.level, 0),
    confidence:        num(d.confidence, 0),
    trend:             d.trend === 'up' || d.trend === 'down' ? d.trend : 'stable',
    plateauCount:      num(d.plateauCount, 0),
    deteriorationFlag: d.deteriorationFlag === true,
  };
}

/** Rebuild users/{uid}/trainingPlan/current from the full cognitive profile. */
export async function updateTrainingPlan(userId: string): Promise<TrainingPlan | null> {
  if (userId === 'anonymous') return null;
  try {
    const db   = getDb();
    const col  = await db.collection('users').doc(userId).collection('cognitiveProfile').get();
    const domains = col.docs
      .map(doc => readSnapshot(doc.data() as Record<string, unknown>))
      .filter((d): d is DomainSnapshot => d !== null);

    const plan = computeTrainingPlan(domains);
    await db.collection('users').doc(userId).collection('trainingPlan').doc('current').set(plan);

    console.log(`[Planner] ${userId} focus:${plan.focusDomains.join(',') || '—'} `
      + `games:${plan.recommendedGames.join(',')}`);
    return plan;
  } catch (err) {
    console.error('[Planner]', (err as Error).message);
    return null;
  }
}
