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
import { CognitiveReportSchema }          from './schemas.js';
import type { CognitiveReportFromClaude } from './schemas.js';

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
export interface CognitiveReport extends CognitiveReportFromClaude {
  sessionId:    string;
  userId:       string;
  gameId:       GameId;
  generatedAt:  number;
  rawStats: {
    accuracy:          number | null;  // null when no scored events (e.g. tic-tac-toe with no completed game)
    avgReactionMs:     number;
    peakStreak:        number;
    durationMs:        number;
    adjustmentCount:   number;
    netDirection:      'harder' | 'easier' | 'stable';
  };
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

function buildUserPrompt(input: ReportInput): string {
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

## Required JSON Output
{
  "cognitiveScore": <integer 0-100>,
  "summaryHe": "<2-3 sentences in Hebrew — what went well, what the performance reveals cognitively>",
  "strengthsHe": ["<specific observed strength in Hebrew>", "<another strength in Hebrew>"],
  "recommendationsHe": ["<one actionable suggestion in Hebrew>", "<optional second suggestion>"]
}

Scoring: 70–100 = strong performance, 40–69 = average, 0–39 = needs practice.
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

// ── Main export ────────────────────────────────────────────────────────────────

export async function generateSessionReport(input: ReportInput): Promise<CognitiveReport | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[Report] ANTHROPIC_API_KEY not set — skipping');
    return null;
  }

  const { sessionId, snapshot, adjustments } = input;

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: buildUserPrompt(input) }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';

    // Extract JSON from response (Claude may wrap in ```json ... ```)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[Report] No JSON in Claude response | session:${sessionId} | raw:${text.slice(0, 500)}`);
      return null;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.warn(`[Report] JSON parse failed | session:${sessionId} | err:${(err as Error).message} | raw:${text.slice(0, 500)}`);
      return null;
    }

    const validation = CognitiveReportSchema.safeParse(parsedJson);
    if (!validation.success) {
      console.warn(`[Report] Schema validation failed | session:${sessionId} | issues:${JSON.stringify(validation.error.issues)} | raw:${text.slice(0, 500)}`);
      return null;
    }
    const validated = validation.data;

    const report: CognitiveReport = {
      sessionId,
      userId:              snapshot.userId,
      gameId:              snapshot.gameId as GameId,
      generatedAt:         Date.now(),
      cognitiveScore:      validated.cognitiveScore,    // schema guarantees integer 0–100
      summaryHe:           validated.summaryHe,
      strengthsHe:         validated.strengthsHe,
      recommendationsHe:   validated.recommendationsHe,
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
        summaryHe:      report.summaryHe,
        accuracy:       snapshot.accuracy,
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
