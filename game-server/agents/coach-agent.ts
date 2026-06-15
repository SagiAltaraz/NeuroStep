/**
 * Coach Agent — multi-session longitudinal progress report
 *
 * Trigger : updateBaseline() calls checkAndRunCoach() every time sessionsCount
 *           reaches a multiple of 5 for a given (userId, gameId) pair.
 *
 * Input   : last 5 sessions from Firestore  (accuracy, reaction time, streak, cognitive score)
 * Output  : CoachReport saved to users/{userId}/coachReports/{docId}
 *
 * Why Haiku, not Sonnet?
 *   Five sessions of structured data is not a complex reasoning task.
 *   Haiku is 10× cheaper and fast enough for an async background job.
 *   Switch to Sonnet if you want richer narrative in the future.
 */

import Anthropic      from '@anthropic-ai/sdk';
import { getDb }      from '../firebase.js';
import type { GameId } from '../types/game.types.js';
import { GAME_DOMAINS } from '../types/domains.js';
import { CoachNarrativeSchema } from './schemas.js';
import type { CoachReportFromClaude } from './schemas.js';
import { recordTokenUsage } from './token-usage.js';

type OverallProgress = CoachReportFromClaude['overallProgress'];

// ── Types ──────────────────────────────────────────────────────────────────────

// Persistence type = Claude-validated payload + agent-supplied metadata.
// Claude-side fields (overallProgress, summaryEn, ...) come from CoachReportSchema.
export interface CoachReport extends CoachReportFromClaude {
  gameId:        GameId;
  generatedAt:   number;
  sessionCount:  number;
}

// ── Prompt ─────────────────────────────────────────────────────────────────────

const SYSTEM = `\
You are a cognitive health specialist reviewing a senior patient's brain training history.
Your reports are read by caregivers, family members of elderly users, and clinicians.

Tone: warm, encouraging, clinically grounded — never alarmist.

Output language: write summaryHe / highlightsHe / recommendationsHe / cognitiveInsightHe in
natural, conversational Hebrew. The audience is Hebrew-speaking adults.

Return ONLY valid JSON, no markdown fences, no preamble.`;

// ── Helpers ────────────────────────────────────────────────────────────────────

function trend(values: number[]): string {
  if (values.length < 2) return 'insufficient data';
  const newest = values[0];
  const oldest = values[values.length - 1];
  const delta  = newest - oldest;
  if (Math.abs(delta) < 5) return 'stable';
  return delta > 0
    ? `improving (+${Math.abs(delta).toFixed(0)}% over the period)`
    : `declining (−${Math.abs(delta).toFixed(0)}% over the period)`;
}

// ── Deterministic overallProgress (B3) ───────────────────────────────────────
// The verdict is maths, not Claude: take the score series (most-recent-first)
// and compare newest vs oldest. Cognitive scores are preferred; accuracy is the
// fallback when too few sessions carry a score.
const PROGRESS_DELTA = 5;   // points of movement that count as a real change

export function deterministicProgress(cogScores: number[], accuracies: number[]): OverallProgress {
  const series = cogScores.length >= 2 ? cogScores : accuracies;
  if (series.length < 2) return 'stable';
  const delta = series[0] - series[series.length - 1];   // newest − oldest
  if (delta >= PROGRESS_DELTA)  return 'improving';
  if (delta <= -PROGRESS_DELTA) return 'needs_attention';
  return 'stable';
}

// Hebrew short label for the game's primary domain — anchors the templated copy.
const DOMAIN_LABEL_HE: Record<string, string> = {
  'working-memory':      'הזיכרון',
  'selective-attention': 'הקשב הממוקד',
  'divided-attention':   'הקשב המחולק',
  'processing-speed':    'מהירות העיבוד',
  'reaction-time':       'זמן התגובה',
  'response-inhibition': 'השליטה העצמית',
  'strategic-thinking':  'החשיבה האסטרטגית',
  'visual-spatial':      'התפיסה המרחבית',
};

// Claude-free narrative used when Claude is unavailable or fails. Keeps the
// 5-session coach report flowing (never silently produces nothing).
function templateCoachNarrative(
  progress: OverallProgress, gameId: GameId,
): Omit<CoachReportFromClaude, 'overallProgress'> {
  const d = DOMAIN_LABEL_HE[GAME_DOMAINS[gameId].primary] ?? 'היכולת';
  if (progress === 'improving') {
    return {
      summaryHe:          `נראית מגמת שיפור יפה לאורך התרגולים האחרונים, ${d} שלך מתחזק`,
      highlightsHe:       ['התמדה קבועה לאורך זמן', 'שיפור הדרגתי ויציב'],
      recommendationsHe:  ['המשך באותו קצב, זה עובד'],
      cognitiveInsightHe: `התרגול הקבוע תורם לחיזוק ${d} בצורה מורגשת`,
    };
  }
  if (progress === 'needs_attention') {
    return {
      summaryHe:          `התרגולים האחרונים היו מאתגרים מעט יותר, וזה טבעי לחלוטין`,
      highlightsHe:       ['ההגעה הקבועה לתרגול ראויה לציון'],
      recommendationsHe:  ['כדאי לתרגל בזמנים רגועים של היום', 'מנוחה טובה לפני התרגול עוזרת'],
      cognitiveInsightHe: `תנודות בביצוע הן חלק נורמלי מהתהליך ואינן סיבה לדאגה`,
    };
  }
  return {
    summaryHe:          `הביצוע שלך נשמר יציב לאורך התרגולים, וזו התמדה יפה`,
    highlightsHe:       ['יציבות ועקביות לאורך זמן'],
    recommendationsHe:  ['המשך לתרגל בקצב נוח וקבוע'],
    cognitiveInsightHe: `שמירה על ${d} ברמה יציבה היא הישג בפני עצמו`,
  };
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function checkAndRunCoach(
  userId: string,
  gameId: GameId,
): Promise<void> {
  if (userId === 'anonymous') return;

  const db        = getDb();
  const statsSnap = await db.collection('users').doc(userId)
                             .collection('stats').doc(gameId).get();

  if (!statsSnap.exists) return;
  const count = (statsSnap.data()!.sessionsCount ?? 0) as number;
  if (count === 0 || count % 5 !== 0) return;

  // Fetch the last 5 sessions
  let sessionsSnap;
  try {
    sessionsSnap = await db.collection('sessions')
      .where('userId', '==', userId)
      .where('gameId', '==', gameId)
      .orderBy('startedAt', 'desc')
      .limit(5)
      .get();
  } catch (err) {
    // Likely a missing Firestore composite index — log and bail gracefully
    console.warn('[Coach] Firestore query failed (check composite index for sessions userId+gameId+startedAt):', (err as Error).message);
    return;
  }

  if (sessionsSnap.size < 3) return;

  const sessions = sessionsSnap.docs.map(d => {
    const s = d.data();
    const rawAccuracy = (s.accuracy ?? null) as number | null;
    return {
      date:       new Date(s.startedAt as number).toLocaleDateString('en-US'),
      accuracy:   rawAccuracy === null ? null : Math.round(rawAccuracy * 100),
      avgRtMs:    s.avgReactionMs  as number,
      peakStreak: s.peakStreak     as number,
      cogScore:   (s.report?.cognitiveScore ?? null) as number | null,
    };
  });

  // Trends ignore null-accuracy sessions (incomplete games)
  const definedAccuracies = sessions.map(s => s.accuracy).filter((v): v is number => v !== null);
  const accuracyTrend     = definedAccuracies.length >= 2 ? trend(definedAccuracies) : 'no completed games yet';
  const cogScores         = sessions.map(s => s.cogScore).filter((v): v is number => v !== null);
  const cogTrend          = cogScores.length >= 2 ? trend(cogScores) : 'no cognitive scores yet';

  // overallProgress is deterministic (B3). Claude is asked only for the narrative.
  const overallProgress = deterministicProgress(cogScores, definedAccuracies);
  let narrative = templateCoachNarrative(overallProgress, gameId);
  let usage: { input_tokens: number; output_tokens: number } | null = null;
  let source: 'claude' | 'template' = 'template';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const userPrompt = `
Game: ${gameId}
Sessions reviewed: ${sessions.length}
Overall progress (already determined): ${overallProgress}
Accuracy trend: ${accuracyTrend}
Cognitive score trend: ${cogTrend}

Session data (index 0 = most recent):
${sessions.map((s, i) =>
  `[${i}] ${s.date}: accuracy=${s.accuracy === null ? 'n/a' : s.accuracy + '%'}  avg_rt=${s.avgRtMs}ms  streak=${s.peakStreak}${s.cogScore != null ? `  cognitive_score=${s.cogScore}` : ''}`
).join('\n')}

The overall progress verdict is already decided — write a narrative consistent with it.
Return JSON exactly matching this schema (DO NOT include overallProgress). Hebrew fields in natural Hebrew:
{
  "summaryHe": "<2-3 sentences in Hebrew describing the patient's trajectory>",
  "highlightsHe": ["<one specific observed strength in Hebrew>", "<another strength in Hebrew>"],
  "recommendationsHe": ["<one specific, actionable practice suggestion in Hebrew>"],
  "cognitiveInsightHe": "<one non-alarming clinical observation in Hebrew about attention, processing speed, or memory>"
}`.trim();

    try {
      const client = new Anthropic({ apiKey });

      const msg = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system:     SYSTEM,
        messages:   [{ role: 'user', content: userPrompt }],
      });

      const text      = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed    = jsonMatch ? safeJsonParse(jsonMatch[0]) : undefined;
      const validation = parsed === undefined ? null : CoachNarrativeSchema.safeParse(parsed);

      if (!jsonMatch) {
        console.warn(`[Coach] No JSON in Claude response | user:${userId} game:${gameId} | raw:${text.slice(0, 500)}`);
      } else if (validation && !validation.success) {
        console.warn(`[Coach] Schema validation failed | user:${userId} game:${gameId} | issues:${JSON.stringify(validation.error.issues)} | raw:${text.slice(0, 500)}`);
      } else if (validation && validation.success) {
        narrative = validation.data;
        usage     = msg.usage;
        source    = 'claude';
      }
    } catch (err) {
      console.warn(`[Coach] Claude call failed | user:${userId} game:${gameId} | err:${(err as Error).message} — using templated narrative`);
    }
  }

  try {
    const report: CoachReport = {
      gameId,
      generatedAt:        Date.now(),
      sessionCount:       count,
      overallProgress,
      summaryHe:          narrative.summaryHe,
      highlightsHe:       narrative.highlightsHe,
      recommendationsHe:  narrative.recommendationsHe,
      cognitiveInsightHe: narrative.cognitiveInsightHe,
    };

    await db.collection('users').doc(userId).collection('coachReports').add(report);
    if (usage) await recordTokenUsage('coach', usage);

    console.log(`[Coach] Report for ${userId}/${gameId} session#${count}: ${overallProgress} (narrative:${source})`);
  } catch (err) {
    console.error('[Coach]', (err as Error).message);
  }
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return undefined; }
}
