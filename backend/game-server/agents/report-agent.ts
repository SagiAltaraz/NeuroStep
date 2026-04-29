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
import type { GameId }         from '../types/game.types.js';
import type { AdaptiveState }             from './adaptive-agent.js';
import type { SessionSnapshot }           from './analytics-agent.js';

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

export interface CognitiveReport {
  sessionId:           string;
  userId:              string;
  gameId:              GameId;
  generatedAt:         number;
  cognitiveScore:      number;       // 0–100
  summaryHe:           string;       // one paragraph in Hebrew
  strengthsHe:         string[];     // 2–3 bullet points
  recommendationsHe:   string[];     // 1–2 action items
  rawStats: {
    accuracy:          number;
    avgReactionMs:     number;
    peakStreak:        number;
    durationMs:        number;
    adjustmentCount:   number;
    netDirection:      'harder' | 'easier' | 'stable';
  };
}

// ── Prompt builder ─────────────────────────────────────────────────────────────

const GAME_NAMES: Record<GameId, string> = {
  'shapes-click': 'זיהוי צורות (Shapes Click)',
  'color-trains': 'רכבות צבעוניות (Color Trains)',
  'tictactoe':    'איקס עיגול (Tic-Tac-Toe)',
  'memory':       'זיכרון (Memory)',
};

function buildPrompt(input: ReportInput): string {
  const { snapshot, adaptive, adjustments } = input;
  const gameName = GAME_NAMES[snapshot.gameId as GameId] ?? snapshot.gameId;
  const durationSec = Math.round(snapshot.durationMs / 1000);
  const harder = adjustments.filter(a => a.direction === 'harder').length;
  const easier = adjustments.filter(a => a.direction === 'easier').length;
  const netDir = harder > easier ? 'harder' : easier > harder ? 'easier' : 'stable';
  const trend  = adaptive.reactionWindow.length >= 4
    ? describeReactionWindow(adaptive.reactionWindow)
    : 'אין מספיק נתוני תגובה לניתוח מגמה';

  return `
אתה פסיכולוג קוגניטיבי שמנתח ביצועים של משחק קוגניטיבי לאוכלוסייה המבוגרת.
המטרה היא לתת משוב אנושי, מעודד ומקצועי — לא מספרים יבשים.

## נתוני הסשן
- משחק: ${gameName}
- משך: ${durationSec} שניות
- לחיצות מוצלחות: ${snapshot.hits}
- שגיאות: ${snapshot.misses}
- פסקי זמן: ${snapshot.timeouts}
- דיוק: ${Math.round(snapshot.accuracy * 100)}%
- זמן תגובה ממוצע: ${snapshot.avgReactionMs}ms
- רצף שיא: ${snapshot.peakStreak}

## ניתוח מגמת תגובה
${trend}

## התאמות קושי שבוצעו (${adjustments.length} סה"כ)
- הקשה: ${harder} פעמים
- הורדה: ${easier} פעמים
- כיוון נטו: ${netDir === 'harder' ? 'התקדמות (קושי עלה)' : netDir === 'easier' ? 'הורדת קושי (המשחק התאים)' : 'יציב'}
${adjustments.slice(-3).map(a => `  • ${a.reason} → ${a.direction}`).join('\n')}

${adaptive.baselineMean ? `## השוואה לבסיס אישי
- בסיס אישי: ${adaptive.baselineMean}ms
- ביצוע הסשן: ${adaptive.emaReactionMs?.toFixed(0) ?? '—'}ms
- ${adaptive.emaReactionMs && adaptive.baselineMean
    ? adaptive.emaReactionMs < adaptive.baselineMean
      ? 'ביצוע מהיר מהממוצע האישי ✓'
      : 'ביצוע איטי מהממוצע האישי'
    : ''}` : '(אין היסטוריה אישית — סשן ראשון)'}

## הוראות
החזר JSON בלבד, ללא הסבר, בפורמט הבא:
{
  "cognitiveScore": <מספר 0-100 שמשקף את ביצועי הסשן>,
  "summaryHe": "<פסקה של 2-3 משפטים בעברית — מה הצליח, מה עלה, מה מעיד על הקוגניציה>",
  "strengthsHe": ["<חוזקה 1>", "<חוזקה 2>"],
  "recommendationsHe": ["<המלצה 1>", "<המלצה 2>"]
}

כללים:
- כתוב בעברית מדוברת ומעודדת
- cognitiveScore: 70-100 = ביצוע טוב, 40-69 = ממוצע, 0-39 = דורש תרגול
- הימנע ממינוח קליני מפחיד
- התמקד בחוזקות ובהתקדמות
`.trim();
}

function describeReactionWindow(times: number[]): string {
  const first = times.slice(0, Math.ceil(times.length / 2));
  const last  = times.slice(Math.floor(times.length / 2));
  const avgFirst = Math.round(first.reduce((a, b) => a + b, 0) / first.length);
  const avgLast  = Math.round(last.reduce((a, b) => a + b, 0) / last.length);
  const delta    = avgLast - avgFirst;
  if (Math.abs(delta) < 30) return 'זמני התגובה היו יציבים לאורך הסשן';
  return delta > 0
    ? `זמני התגובה עלו בממוצע ב-${delta}ms לקראת סוף הסשן (סימן לעייפות)`
    : `זמני התגובה ירדו ב-${Math.abs(delta)}ms לקראת סוף הסשן (שיפור)`;
}

// ── Net direction helper ───────────────────────────────────────────────────────

function computeNetDir(adjustments: AdjustmentRecord[]): 'harder' | 'easier' | 'stable' {
  const harder = adjustments.filter(a => a.direction === 'harder').length;
  const easier = adjustments.filter(a => a.direction === 'easier').length;
  return harder > easier ? 'harder' : easier > harder ? 'easier' : 'stable';
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function generateSessionReport(input: ReportInput): Promise<CognitiveReport | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.Claude_API_KEY;
  if (!apiKey) {
    console.warn('[Report] Claude API key not set (ANTHROPIC_API_KEY or Claude_API_KEY) — skipping');
    return null;
  }

  const { sessionId, snapshot, adjustments } = input;

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',  // fast + cheap for structured reports
      max_tokens: 600,
      messages:   [{ role: 'user', content: buildPrompt(input) }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';

    // Extract JSON from response (Claude may wrap in ```json ... ```)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Claude response');

    const parsed = JSON.parse(jsonMatch[0]) as {
      cognitiveScore: number;
      summaryHe: string;
      strengthsHe: string[];
      recommendationsHe: string[];
    };

    const report: CognitiveReport = {
      sessionId,
      userId:              snapshot.userId,
      gameId:              snapshot.gameId as GameId,
      generatedAt:         Date.now(),
      cognitiveScore:      Math.max(0, Math.min(100, Math.round(parsed.cognitiveScore))),
      summaryHe:           parsed.summaryHe,
      strengthsHe:         parsed.strengthsHe ?? [],
      recommendationsHe:   parsed.recommendationsHe ?? [],
      rawStats: {
        accuracy:        snapshot.accuracy,
        avgReactionMs:   snapshot.avgReactionMs,
        peakStreak:      snapshot.peakStreak,
        durationMs:      snapshot.durationMs,
        adjustmentCount: adjustments.length,
        netDirection:    computeNetDir(adjustments),
      },
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

    // Lightweight index under the user's profile
    batch.set(
      firestore.collection('users').doc(snapshot.userId)
               .collection('reports').doc(sessionId),
      {
        sessionId,
        gameId:         snapshot.gameId,
        generatedAt:    report.generatedAt,
        cognitiveScore: report.cognitiveScore,
        summaryHe:      report.summaryHe,
      },
    );

    await batch.commit();

    // Increment token counters — FieldValue.increment is atomic, no race conditions
    await firestore.collection('meta').doc('tokenUsage').set({
      totalInputTokens:  FieldValue.increment(message.usage.input_tokens),
      totalOutputTokens: FieldValue.increment(message.usage.output_tokens),
      totalReports:      FieldValue.increment(1),
      lastUpdated:       Date.now(),
    }, { merge: true });

    console.log(`[Report] session:${sessionId} score:${report.cognitiveScore} tokens:${message.usage.input_tokens}in/${message.usage.output_tokens}out`);
    return report;

  } catch (err) {
    console.error('[Report] Error generating report:', (err as Error).message);
    return null;
  }
}
