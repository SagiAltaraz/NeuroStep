// services/personalizationFocus.js
// Turns the onboarding questionnaire (PersonalFormModal) into a MACHINE-READABLE
// cognitive focus — the questionnaire's "purpose". Before this, the answers were
// stored as free text and never read by any logic; here we map them to the same
// eight cognitive-domain ids the rest of the app uses, so a brand-new user (who
// has not played a single game yet) can still be pointed at the game that best
// fits what they told us.
//
// It deliberately does NOT touch DDA difficulty — only recommendation/ordering —
// so it can never make a game start too hard.

import { DOMAIN_GAME } from './trainingPlan.js';

// The eight canonical domains (order = stable tie-break only).
export const ALL_DOMAINS = [
   'working-memory',
   'selective-attention',
   'divided-attention',
   'processing-speed',
   'reaction-time',
   'response-inhibition',
   'strategic-thinking',
   'visual-spatial',
];

// Self-assessment questions (Q4–Q13) → the domain each one probes and a weakness
// score per answer id (0 = strong, 1 = weakest → most to gain). Questions are
// ordered best→worst in the form, so the scores rise with the option index.
const SELF_ASSESSMENT = {
   4: { domain: 'working-memory', scores: { 'almost-never': 0, sometimes: 0.4, often: 0.7, daily: 1 } },
   5: { domain: 'working-memory', scores: { 'very-easy-names': 0, 'remember-most': 0.35, 'faces-not-names': 0.7, 'forget-immediately': 1 } },
   6: { domain: 'working-memory', scores: { 'no-lists': 0.1, 'sometimes-lists': 0.45, 'always-lists': 0.85 } },
   7: { domain: 'selective-attention', scores: { 'ignore-noise': 0, 'effort-focus': 0.4, 'noise-hard': 0.75, 'lose-focus': 1 } },
   8: { domain: 'selective-attention', scores: { 'over-hour': 0, '30-60': 0.35, '15-30': 0.7, 'under-15': 1 } },
   9: { domain: 'divided-attention', scores: { 'multitask-easy': 0, 'multitask-possible': 0.4, 'multitask-stress': 0.75, 'avoid-multitask': 1 } },
   10: { domain: 'processing-speed', scores: { 'time-helps': 0, 'no-effect': 0.3, 'time-stress': 0.7, freeze: 1 } },
   11: { domain: 'strategic-thinking', scores: { 'adapt-fast': 0, 'few-moments': 0.35, 'need-time-help': 0.75, 'struggle-change': 1 } },
   12: { domain: 'reaction-time', scores: { 'very-high': 0, reasonable: 0.35, 'low-slower': 0.75, 'no-chance': 1 } },
   13: { domain: 'visual-spatial', scores: { 'very-confident-nav': 0, 'usually-manage-nav': 0.35, 'need-constant-gps': 0.75, 'lost-easily': 1 } },
};

// Weakness when we have no self-assessment signal for a domain (e.g.
// response-inhibition, which only appears in the goals question).
const NEUTRAL_WEAKNESS = 0.45;
// A goal the user explicitly picked in Q14 counts as a strong pull toward that
// domain, on top of any self-assessed weakness.
const GOAL_BOOST = 0.6;

// Read the array of raw option-ids for a question, tolerating string/number keys
// (JSON turns numeric keys into strings) and single-string values.
function idsFor(answersRaw, qid) {
   const v = answersRaw?.[qid] ?? answersRaw?.[String(qid)];
   if (Array.isArray(v)) return v;
   if (typeof v === 'string' && v) return [v];
   return [];
}

// derivePersonalizationFocus(answersRaw) → the structured focus we persist.
//   answersRaw: { [questionId]: string[] }  (raw option ids from the form)
// Returns null when there is not enough to go on (no answers at all).
export function derivePersonalizationFocus(answersRaw) {
   if (!answersRaw || typeof answersRaw !== 'object') return null;

   // 1. Average self-assessed weakness per domain.
   const sum = {};
   const count = {};
   for (const [qid, spec] of Object.entries(SELF_ASSESSMENT)) {
      const id = idsFor(answersRaw, qid)[0];
      const score = spec.scores[id];
      if (typeof score !== 'number') continue;
      sum[spec.domain] = (sum[spec.domain] ?? 0) + score;
      count[spec.domain] = (count[spec.domain] ?? 0) + 1;
   }

   // 2. Goals (Q14) — already domain ids by design of the form.
   const goals = idsFor(answersRaw, 14).filter((id) => ALL_DOMAINS.includes(id));
   const goalSet = new Set(goals);

   // Nothing usable → let the caller keep the cold-start default.
   if (goals.length === 0 && Object.keys(count).length === 0) return null;

   // 3. Combined score per domain = self-assessed weakness (+ neutral baseline for
   //    unprobed domains) + an explicit-goal boost. Higher = more worth training.
   const weakness = {};
   const score = {};
   for (const d of ALL_DOMAINS) {
      const w = count[d] ? sum[d] / count[d] : NEUTRAL_WEAKNESS;
      weakness[d] = Math.round(w * 100) / 100;
      score[d] = w + (goalSet.has(d) ? GOAL_BOOST : 0);
   }

   // 4. Rank. Keep only domains that are a stated goal OR are meaningfully weak,
   //    so a new user gets a focused shortlist rather than all eight.
   const order = ALL_DOMAINS.filter((d) => goalSet.has(d) || weakness[d] >= 0.55)
      .sort((a, b) => score[b] - score[a] || ALL_DOMAINS.indexOf(a) - ALL_DOMAINS.indexOf(b));

   // Fallback: if the shortlist came out empty (e.g. only mild answers, no goals),
   // still surface the single weakest domain so there is always a recommendation.
   const ranked = order.length
      ? order
      : [ALL_DOMAINS.slice().sort((a, b) => score[b] - score[a])[0]];

   const primaryDomain = ranked[0];

   return {
      ageGroup: idsFor(answersRaw, 1)[0] ?? null,
      gender: idsFor(answersRaw, 2)[0] ?? null,
      goals,
      weakness,
      order: ranked,
      primaryDomain,
      primaryGameId: DOMAIN_GAME[primaryDomain] ?? 'memory',
      derivedAt: Date.now(),
      version: 'focus-v1',
   };
}

// syntheticDomainsFromFocus(focus) → a cognitiveProfile-SHAPED array
// ({ id, level, trend }) built from the questionnaire, so a brand-new user can
// flow through the exact same buildTrainingPlan / companion pipeline as a player
// with real play history. `level` is inverted weakness (weaker → lower level →
// higher training priority); stated goals get an extra push toward the top.
export function syntheticDomainsFromFocus(focus) {
   if (!focus || !Array.isArray(focus.order) || focus.order.length === 0) return [];
   const goalSet = new Set(focus.goals ?? []);
   return focus.order.map((id) => {
      const w = typeof focus.weakness?.[id] === 'number' ? focus.weakness[id] : NEUTRAL_WEAKNESS;
      const goalPush = goalSet.has(id) ? 15 : 0;
      const level = Math.max(5, Math.min(95, Math.round((1 - w) * 100) - goalPush));
      return { id, level, trend: 'stable', source: 'questionnaire' };
   });
}
