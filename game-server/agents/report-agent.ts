/**
 * Report Agent — end-of-session cognitive analysis via Claude SDK
 *
 * Trigger : ws.on('close') in server.ts → generateSessionReport()
 * Input   : session stats (hits, misses, RT, trend) + adaptive history
 * Output  : CognitiveReport saved to Firestore at:
 *             sessions/{sessionId}/report  (full report)
 *             users/{userId}/reports/{sessionId} (summary index)
 *
 * Why Claude here (not in adaptive-agent)?
 *   - Adaptive agent must respond in <5ms → pure maths only
 *   - Report runs once, async, after the session → latency is fine
 *   - Claude gives a human-readable Hebrew narrative, not just numbers
 */

import Anthropic               from '@anthropic-ai/sdk';
import { FieldValue }          from 'firebase-admin/firestore';
import { getDb }               from '../firebase.js';
import type { GameId, DifficultyParams } from '../types/game.types.js';
import { GAME_DOMAINS }        from '../types/domains.js';
import type { ProblemId }      from '../types/domains.js';
import type { AdaptiveState }             from './adaptive-agent.js';
import { paramsFromD, speedVsBaseline, fatiguePenalty } from './adaptive-agent.js';
import type { SessionSnapshot }           from './analytics-agent.js';
import { ReportNarrativeSchema }          from './schemas.js';
import type { CognitiveReportFromClaude } from './schemas.js';
import { recordTokenUsage }    from './token-usage.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReportInput {
  sessionId:    string;
  snapshot:     SessionSnapshot;
  adaptive:     AdaptiveState;
  adjustments:  AdjustmentRecord[];
}

export interface AdjustmentRecord {
  reason:    string;
  direction: 'harder' | 'easier';
  at:        number; // timestamp
}

// Persistence type = Claude-validated payload + agent-supplied metadata.
// The Claude-side fields (cognitiveScore, summaryHe, ...) are sourced from
// CognitiveReportSchema in schemas.ts — single source of truth.
// Schema version for the persisted documents this agent writes (sessions/*.report
// and users/*/reports/*). Bumped when the shape changes so a future migration can
// detect and upgrade older docs. See D4 in WORK_PROMPT_PHASE2.
export const SCHEMA_VERSION = 1;

export interface CognitiveReport extends CognitiveReportFromClaude {
  sessionId:    string;
  userId:       string;
  gameId:       GameId;
  generatedAt:  number;
  v:            number;   // schemaVersion (SCHEMA_VERSION)
  // Deterministic per-domain scores (NOT from Claude) — feed the cognitive
  // profile EMA and the progression math. See computeDomainScores below.
  domainScores: Record<ProblemId, number>;
  rawStats: {
    accuracy:          number | null;  // null when no scored events (e.g. tic-tac-toe with no completed game)
    avgReactionMs:     number;
    peakStreak:        number;
    durationMs:        number;
    adjustmentCount:   number;
    netDirection:      'harder' | 'easier' | 'stable';
  };
  // Phase E2 — the difficulty the session converged to. `difficulty` (0..1) is
  // the smoothed level; `currentConfig` is the matching per-game params. Both
  // feed same-game resume and are surfaced on the results screen.
  difficulty:    number;
  currentConfig: DifficultyParams;
}

// ── Prompt ─────────────────────────────────────────────────────────────────────

const SYSTEM = `\
You are a cognitive neuropsychologist specialising in elderly brain health.
You analyse data from digital cognitive training sessions and produce structured reports.

Audience: the report is read by caregivers, family members, and occasionally the patient.
Tone: warm, encouraging, clinically grounded — avoid alarmist or overly clinical language.

Output format: return ONLY valid JSON, no markdown fences, no preamble.
The "summaryHe", "strengthsHe", and "recommendationsHe" fields must be written in natural,
conversational Hebrew — the target reader is an elderly Hebrew-speaking adult.`;

const GAME_NAMES: Record<GameId, string> = {
  'shapes-click':    'Shape Recognition (Shapes Click)',
  'color-trains':    'Color Trains (attention switching)',
  'tictactoe':       'Tic-Tac-Toe (strategic planning)',
  'memory':          'Memory Card Matching',
  'green-light':     'Green Light (reaction time + go/no-go)',
  'spot-difference': 'Spot the Difference (processing speed + selective attention)',
  'where-was-it':    'Where Was It? (Corsi-style visual-spatial memory)',
  'find-letter':     'Find the Letter (selective attention + visual search)',
};

function buildUserPrompt(input: ReportInput, cognitiveScore: number): string {
  const { snapshot, adaptive, adjustments } = input;
  const durationSec = Math.round(snapshot.durationMs / 1000);
  const harder  = adjustments.filter(a => a.direction === 'harder').length;
  const easier  = adjustments.filter(a => a.direction === 'easier').length;
  const netDir  = harder > easier ? 'harder' : easier > harder ? 'easier' : 'stable';
  const rtTrend = describeReactionTrend(adaptive.reactionWindow);

  const baselineSection = adaptive.baselineMean
    ? `Personal baseline: ${adaptive.baselineMean}ms avg  |  This session EMA: ${adaptive.emaReactionMs?.toFixed(0) ?? '—'}ms  |  ${
        adaptive.emaReactionMs && adaptive.baselineMean
          ? adaptive.emaReactionMs < adaptive.baselineMean ? 'Faster than personal average ✓' : 'Slower than personal average'
          : ''
      }`
    : 'No prior baseline — this is the first session.';

  const accuracyLine = snapshot.accuracy === null
    ? 'Accuracy: n/a (no scored events in session)'
    : `Accuracy: ${Math.round(snapshot.accuracy * 100)}%`;

  return `
## Session Data
Game: ${GAME_NAMES[snapshot.gameId as GameId] ?? snapshot.gameId}
Duration: ${durationSec}s
Successful responses: ${snapshot.hits}  |  Errors: ${snapshot.misses}  |  Timeouts: ${snapshot.timeouts}
${accuracyLine}
Average reaction time: ${snapshot.avgReactionMs}ms
Peak consecutive streak: ${snapshot.peakStreak}

## Reaction Time Trend
${rtTrend}

## Adaptive Difficulty (${adjustments.length} adjustments total)
Harder: ${harder}  |  Easier: ${easier}  |  Net: ${netDir}
${adjustments.slice(-3).map(a => `  - ${a.reason} → ${a.direction}`).join('\n')}

## Personal Baseline Comparison
${baselineSection}

## Cognitive Score (already computed — DO NOT return it)
This session scored ${cognitiveScore}/100 (70–100 = strong, 40–69 = average, 0–39 = needs practice).
Write the narrative so it is consistent with that score.

## Required JSON Output
{
  "summaryHe": "<2-3 sentences in Hebrew — what went well, what the performance reveals cognitively>",
  "strengthsHe": ["<specific observed strength in Hebrew>", "<another strength in Hebrew>"],
  "recommendationsHe": ["<one actionable suggestion in Hebrew>", "<optional second suggestion>"]
}

Keep Hebrew text warm, simple, and encouraging — never frightening.`.trim();
}

function describeReactionTrend(times: number[]): string {
  if (times.length < 4) return 'Not enough reaction time data to determine trend.';
  const half     = Math.floor(times.length / 2);
  const avgFirst = Math.round(times.slice(0, half).reduce((a, b) => a + b, 0) / half);
  const avgLast  = Math.round(times.slice(half).reduce((a, b) => a + b, 0) / (times.length - half));
  const delta    = avgLast - avgFirst;
  if (Math.abs(delta) < 30) return 'Reaction times were stable throughout the session.';
  return delta > 0
    ? `Reaction times increased by ~${delta}ms toward the end (possible fatigue signal).`
    : `Reaction times improved by ~${Math.abs(delta)}ms toward the end (warming up / flow state).`;
}

// ── Net direction helper ───────────────────────────────────────────────────────

function computeNetDir(adjustments: AdjustmentRecord[]): 'harder' | 'easier' | 'stable' {
  const harder = adjustments.filter(a => a.direction === 'harder').length;
  const easier = adjustments.filter(a => a.direction === 'easier').length;
  return harder > easier ? 'harder' : easier > harder ? 'easier' : 'stable';
}

// ── Deterministic per-domain scores ──────────────────────────────────────────
// We deliberately do NOT ask Claude for per-domain scores: they are noisy and
// they feed the progression math (levels/nodes), which needs stability. Instead
// we derive them from the single cognitiveScore and the game's domain mapping —
// the primary domain gets the full score, secondary domains a damped fraction.
const SECONDARY_FACTOR = 0.85;

export function computeDomainScores(cognitiveScore: number, gameId: GameId): Record<ProblemId, number> {
  const { primary, secondary } = GAME_DOMAINS[gameId];
  const scores = {} as Record<ProblemId, number>;
  scores[primary] = cognitiveScore;
  for (const d of secondary) {
    scores[d] = Math.round(cognitiveScore * SECONDARY_FACTOR);
  }
  return scores;
}

// ── Deterministic cognitive score (the ONLY source of the score) ─────────────
// Phase 2/B1: the score is authoritative maths — Claude is never asked for it.
// The profile EMA + progression nodes depend on EVERY completed session
// producing a stable, reproducible number, so we derive it from the session
// signals using the same model the live controller trusts:
//
//   accuracy (dominant) + peak streak (focus) + speed-vs-baseline − fatigue
//
// `accuracy === null` (no scored events, e.g. an abandoned tic-tac-toe) → 50.
// `adaptive` is optional: without a usable RT baseline the speed term is folded
// back into accuracy so the score still spans the full 0..100 range.
export function deterministicCognitiveScore(
  snapshot: SessionSnapshot,
  adaptive?: Pick<AdaptiveState, 'emaReactionMs' | 'baselineMean' | 'baselineStdDev' | 'reactionWindow'>,
): number {
  if (snapshot.accuracy === null) return 50;

  const streakComponent = Math.min(snapshot.peakStreak, 5) / 5 * 15; // 0..15
  const speed   = adaptive ? speedVsBaseline(adaptive.emaReactionMs, adaptive.baselineMean, adaptive.baselineStdDev) : null;
  const fatigue = adaptive ? fatiguePenalty(adaptive.reactionWindow) : 0;

  // With a baseline we split the weight: accuracy 0..70, speed 0..15, streak
  // 0..15. Without one, accuracy absorbs the speed weight (0..85) — identical to
  // the pre-Phase-2 behaviour, so cold-start sessions score the same as before.
  const raw = speed === null
    ? snapshot.accuracy * 85 + streakComponent
    : snapshot.accuracy * 70 + streakComponent + speed * 15;

  return Math.max(0, Math.min(100, Math.round(raw - fatigue * 5)));
}

// ── Templated Hebrew narrative (Claude-free) ─────────────────────────────────
// Most sessions are NOT milestones, so we don't spend a Claude call on them.
// Instead we assemble a warm, varied Hebrew narrative from a bank keyed by
// performance tier × the game's primary domain. Several phrasings per cell keep
// repeated sessions from feeling robotic. See isMilestone() for when Claude runs.

type Tier = 'strong' | 'average' | 'practice';

function tierOf(score: number): Tier {
  if (score >= 70) return 'strong';
  if (score >= 40) return 'average';
  return 'practice';
}

// Short Hebrew label for each cognitive domain — used to make the narrative
// feel specific to what the game just trained.
const DOMAIN_LABEL_HE: Record<ProblemId, string> = {
  'working-memory':      'הזיכרון',
  'selective-attention': 'הקשב הממוקד',
  'divided-attention':   'הקשב המחולק',
  'processing-speed':    'מהירות העיבוד',
  'reaction-time':       'זמן התגובה',
  'response-inhibition': 'השליטה העצמית',
  'strategic-thinking':  'החשיבה האסטרטגית',
  'visual-spatial':      'התפיסה המרחבית',
};

const SUMMARY_TEMPLATES: Record<Tier, (domain: string) => string[]> = {
  strong: d => [
    `ביצוע מצוין בתרגול הזה, ${d} שלך עבד נהדר`,
    `סיימת בהצלחה גדולה, רואים ש${d} שלך חד היום`,
    `תרגול חזק במיוחד, ${d} שלך בשיא`,
  ],
  average: d => [
    `תרגול טוב ויציב, ${d} שלך ממשיך להתחזק`,
    `עבודה יפה היום, ${d} שלך בכיוון הנכון`,
    `ביצוע סולידי, כל תרגול מחזק את ${d} שלך`,
  ],
  practice: d => [
    `סיימת עוד תרגול חשוב, ${d} שלך מתחזק עם כל ניסיון`,
    `כל הכבוד על ההתמדה, ${d} שלך ישתפר בהדרגה`,
    `התחלה טובה, נמשיך לתרגל את ${d} בקצב נוח`,
  ],
};

const STRENGTH_TEMPLATES: Record<Tier, string[]> = {
  strong:   ['ריכוז גבוה לאורך כל התרגול', 'דיוק ועקביות מרשימים'],
  average:  ['התמדה ורצף תרגול קבוע', 'שיפור הדרגתי ויציב'],
  practice: ['התמדה ורצף תרגול קבוע'],
};

const RECOMMENDATION_TEMPLATES: Record<Tier, string[]> = {
  strong:   ['המשך באתגר הנוכחי, אתה מוכן להתקדם'],
  average:  ['המשך לתרגל בקצב נוח וקבוע'],
  practice: ['תרגול קצר וקבוע עדיף על תרגול ארוך ונדיר'],
};

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

// Build a deterministic-but-varied narrative. The session timestamp seeds the
// choice so the same session always renders the same text, while consecutive
// sessions rotate through the variants.
function templateNarrative(
  score: number, gameId: GameId, seed: number,
): Pick<CognitiveReportFromClaude, 'summaryHe' | 'strengthsHe' | 'recommendationsHe'> {
  const tier   = tierOf(score);
  const domain = DOMAIN_LABEL_HE[GAME_DOMAINS[gameId].primary] ?? 'היכולת';
  return {
    summaryHe:         pick(SUMMARY_TEMPLATES[tier](domain), seed),
    strengthsHe:       [pick(STRENGTH_TEMPLATES[tier], seed)],
    recommendationsHe: [pick(RECOMMENDATION_TEMPLATES[tier], seed)],
  };
}

// ── Main export ────────────────────────────────────────────────────────────────

// Hard timeout for the Claude network call. A hung request — e.g. a zero-credit
// key that stalls instead of erroring ("Credit balance is too low") — must never
// block the end-session pipeline. When the budget elapses we abort the request
// (real cancellation via AbortController) and fall through to the deterministic
// fallback, exactly as if Claude had errored. 8s is comfortably above normal
// Haiku latency and well below any client-side WS timeout.
const REPORT_LLM_TIMEOUT_MS = 8000;

// Minimal structural type for the Claude client so tests can inject a stub that
// hangs on demand. The real `new Anthropic({ apiKey })` satisfies this shape.
interface ClaudeClient {
  messages: {
    create: (body: any, options?: { signal?: AbortSignal }) => Promise<any>;
  };
}

export async function generateSessionReport(
  input: ReportInput,
  deps: { client?: ClaudeClient; milestone?: boolean } = {},
): Promise<CognitiveReport | null> {
  const { sessionId, snapshot, adjustments } = input;
  const gameId = snapshot.gameId as GameId;

  // ── Score: ALWAYS deterministic. Claude is never asked for it (B1). ──────────
  const cognitiveScore = deterministicCognitiveScore(snapshot, input.adaptive);

  // ── Narrative: template by default; Claude only on milestone sessions. ───────
  // Non-milestone sessions (the vast majority) cost zero tokens.
  const seed = input.adaptive.totalScoredEvents + Math.round(snapshot.avgReactionMs);
  let narrative = templateNarrative(cognitiveScore, gameId, seed);
  let usage: { input_tokens: number; output_tokens: number } | null = null;
  let source: 'claude' | 'template' = 'template';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const client: ClaudeClient | null = deps.client ?? (apiKey ? new Anthropic({ apiKey }) : null);

  if (deps.milestone && client) {
    // Bound the network call with a hard deadline. If Claude hasn't responded
    // within REPORT_LLM_TIMEOUT_MS we abort and keep the templated narrative —
    // treated identically to any other Claude failure.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REPORT_LLM_TIMEOUT_MS);
    try {
      const message = await client.messages.create(
        {
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system:     SYSTEM,
          messages:   [{ role: 'user', content: buildUserPrompt(input, cognitiveScore) }],
        },
        { signal: controller.signal },
      );

      const text      = message.content[0].type === 'text' ? message.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);   // Claude may wrap in ```json ... ```

      if (!jsonMatch) {
        console.warn(`[Report] No JSON in Claude response | session:${sessionId} | raw:${text.slice(0, 500)}`);
      } else {
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(jsonMatch[0]);
        } catch (err) {
          console.warn(`[Report] JSON parse failed | session:${sessionId} | err:${(err as Error).message} | raw:${text.slice(0, 500)}`);
          parsedJson = undefined;
        }

        const validation = parsedJson === undefined ? null : ReportNarrativeSchema.safeParse(parsedJson);
        if (validation && !validation.success) {
          console.warn(`[Report] Schema validation failed | session:${sessionId} | issues:${JSON.stringify(validation.error.issues)} | raw:${text.slice(0, 500)}`);
        } else if (validation && validation.success) {
          // Claude succeeded — use its richer milestone narrative (score stays deterministic).
          narrative = {
            summaryHe:         validation.data.summaryHe,
            strengthsHe:       validation.data.strengthsHe,
            recommendationsHe: validation.data.recommendationsHe,
          };
          usage  = message.usage;
          source = 'claude';
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        console.warn(`[Report] Claude call timed out after ${REPORT_LLM_TIMEOUT_MS}ms — using templated narrative`);
      } else {
        console.warn(`[Report] Claude call failed | session:${sessionId} | err:${(err as Error).message} — using templated narrative`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    const report: CognitiveReport = {
      sessionId,
      userId:              snapshot.userId,
      gameId,
      generatedAt:         Date.now(),
      v:                   SCHEMA_VERSION,
      domainScores:        computeDomainScores(cognitiveScore, gameId),
      cognitiveScore,
      summaryHe:           narrative.summaryHe,
      strengthsHe:         narrative.strengthsHe,
      recommendationsHe:   narrative.recommendationsHe,
      rawStats: {
        accuracy:        snapshot.accuracy,
        avgReactionMs:   snapshot.avgReactionMs,
        peakStreak:      snapshot.peakStreak,
        durationMs:      snapshot.durationMs,
        adjustmentCount: adjustments.length,
        netDirection:    computeNetDir(adjustments),
      },
      difficulty:          Math.round(Math.min(1, Math.max(0, input.adaptive.dSmoothed)) * 1000) / 1000,
      currentConfig:       paramsFromD(gameId, input.adaptive.dSmoothed),
    };

    // Save to Firestore
    const firestore = getDb();
    const batch = firestore.batch();

    // Full report under the session doc
    batch.set(
      firestore.collection('sessions').doc(sessionId),
      { report },
      { merge: true },
    );

    // Lightweight index under the user's profile (consumed by Cognitive Trend page).
    // accuracy is denormalised here so the trend endpoint avoids N+1 lookups
    // against sessions/{id}. May be null (per Phase 0 — see analytics-agent).
    batch.set(
      firestore.collection('users').doc(snapshot.userId)
               .collection('reports').doc(sessionId),
      {
        sessionId,
        gameId:         snapshot.gameId,
        generatedAt:    report.generatedAt,
        cognitiveScore: report.cognitiveScore,
        domainScores:   report.domainScores,
        summaryHe:      report.summaryHe,
        accuracy:       snapshot.accuracy,
      },
    );

    await batch.commit();

    // Report counter (always) + per-agent tokens (only when Claude ran).
    await firestore.collection('meta').doc('tokenUsage').set({
      totalReports: FieldValue.increment(1),
      lastUpdated:  Date.now(),
    }, { merge: true });
    if (usage) await recordTokenUsage('report', usage);

    console.log(
      `[Report] session:${sessionId} score:${report.cognitiveScore} narrative:${source}` +
      (usage ? ` tokens:${usage.input_tokens}in/${usage.output_tokens}out` : ''),
    );
    return report;

  } catch (err) {
    console.error('[Report] Error persisting report:', (err as Error).message);
    return null;
  }
}
