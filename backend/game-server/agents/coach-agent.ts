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
import { FieldValue } from 'firebase-admin/firestore';
import { getDb }      from '../firebase.js';
import type { GameId } from '../types/game.types.js';
import { CoachReportSchema } from './schemas.js';
import type { CoachReportFromClaude } from './schemas.js';

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  const userPrompt = `
Game: ${gameId}
Sessions reviewed: ${sessions.length}
Accuracy trend: ${accuracyTrend}
Cognitive score trend: ${cogTrend}

Session data (index 0 = most recent):
${sessions.map((s, i) =>
  `[${i}] ${s.date}: accuracy=${s.accuracy === null ? 'n/a' : s.accuracy + '%'}  avg_rt=${s.avgRtMs}ms  streak=${s.peakStreak}${s.cogScore != null ? `  cognitive_score=${s.cogScore}` : ''}`
).join('\n')}

Return JSON exactly matching this schema. Hebrew text fields must be in natural Hebrew:
{
  "overallProgress": "improving" | "stable" | "needs_attention",
  "summaryHe": "<2-3 sentences in Hebrew describing the patient's trajectory>",
  "highlightsHe": ["<one specific observed strength in Hebrew>", "<another strength in Hebrew>"],
  "recommendationsHe": ["<one specific, actionable practice suggestion in Hebrew>"],
  "cognitiveInsightHe": "<one non-alarming clinical observation in Hebrew about attention, processing speed, or memory>"
}`.trim();

  try {
    const client = new Anthropic({ apiKey });

    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: userPrompt }],
    });

    const text      = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[Coach] No JSON in Claude response | user:${userId} game:${gameId} | raw:${text.slice(0, 500)}`);
      return;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.warn(`[Coach] JSON parse failed | user:${userId} game:${gameId} | err:${(err as Error).message} | raw:${text.slice(0, 500)}`);
      return;
    }

    const validation = CoachReportSchema.safeParse(parsedJson);
    if (!validation.success) {
      console.warn(`[Coach] Schema validation failed | user:${userId} game:${gameId} | issues:${JSON.stringify(validation.error.issues)} | raw:${text.slice(0, 500)}`);
      return;
    }
    const validated = validation.data;

    const report: CoachReport = {
      gameId,
      generatedAt:        Date.now(),
      sessionCount:       count,
      overallProgress:    validated.overallProgress,
      summaryHe:          validated.summaryHe,
      highlightsHe:       validated.highlightsHe,
      recommendationsHe:  validated.recommendationsHe,
      cognitiveInsightHe: validated.cognitiveInsightHe,
    };

    await db.collection('users').doc(userId).collection('coachReports').add(report);

    // Token tracking
    await db.collection('meta').doc('tokenUsage').set({
      totalInputTokens:  FieldValue.increment(msg.usage.input_tokens),
      totalOutputTokens: FieldValue.increment(msg.usage.output_tokens),
    }, { merge: true });

    console.log(`[Coach] Report for ${userId}/${gameId} session#${count}: ${report.overallProgress}`);
  } catch (err) {
    console.error('[Coach]', (err as Error).message);
  }
}
