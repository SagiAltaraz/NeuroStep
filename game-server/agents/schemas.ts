/**
 * Zod schemas for validating Claude responses.
 *
 * Each Claude-using agent (Report, Coach, Coaching) receives free-form text
 * from the model. These schemas enforce the structural contract before any
 * Firestore write happens — a malformed response fails closed (returns null,
 * logs the issue) instead of crashing downstream consumers.
 *
 * Single source of truth: the agent-side persistence interfaces extend the
 * z.infer types from this file rather than duplicating field definitions.
 */

import { z } from 'zod';

// ── Report Agent: per-session cognitive report ────────────────────────────────

export const CognitiveReportSchema = z.object({
  cognitiveScore:    z.number().int().min(0).max(100),
  summaryHe:         z.string().min(1).max(500),
  strengthsHe:       z.array(z.string().min(1).max(200)).min(1).max(5),
  recommendationsHe: z.array(z.string().min(1).max(200)).min(1).max(3),
});
export type CognitiveReportFromClaude = z.infer<typeof CognitiveReportSchema>;

// Phase 2/B1: the cognitive score is computed deterministically on the server,
// so the milestone Claude call asks ONLY for the Hebrew narrative (smaller
// prompt + response = fewer tokens). The score is still part of the persisted
// CognitiveReport — it just no longer comes from Claude.
export const ReportNarrativeSchema = CognitiveReportSchema.omit({ cognitiveScore: true });
export type ReportNarrativeFromClaude = z.infer<typeof ReportNarrativeSchema>;

// ── Coach Agent: longitudinal report (every 5 sessions) ───────────────────────
// Phase 4D migrated this to Hebrew. Historical docs in Firestore still have
// *En fields — the CoachReportsPage frontend reads `summaryHe ?? summaryEn`
// so old reports keep rendering without a backfill.

export const CoachReportSchema = z.object({
  overallProgress:    z.enum(['improving', 'stable', 'needs_attention']),
  summaryHe:          z.string().min(1).max(500),
  highlightsHe:       z.array(z.string().min(1).max(200)).min(1).max(5),
  recommendationsHe:  z.array(z.string().min(1).max(200)).min(1).max(3),
  cognitiveInsightHe: z.string().min(1).max(500),
});
export type CoachReportFromClaude = z.infer<typeof CoachReportSchema>;

// Phase 2/B3: overallProgress is computed deterministically from the score
// trend, so the Claude call asks ONLY for the Hebrew narrative.
export const CoachNarrativeSchema = CoachReportSchema.omit({ overallProgress: true });
export type CoachNarrativeFromClaude = z.infer<typeof CoachNarrativeSchema>;

// ── Coaching Agent: in-game encouragement toast ───────────────────────────────
// Plain string with strict content rules — enforced both via the system prompt
// AND here defensively. If Claude breaks the rules, we'd rather show no toast
// than show one that mentions "system" or "difficulty" to an elderly user.

const FORBIDDEN_WORDS = ['קושי', 'קל', 'קשה', 'שינוי', 'מערכת'];

// Permissive emoji ranges — covers most pictographic Unicode planes.
// Not perfect (e.g. zero-width-joined sequences), but good enough.
const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}]/u;

const FORBIDDEN_END_CHARS = ['.', '!', '?', '״', '"', "'"];

export const CoachingMessageSchema = z
  .string()
  .min(1)
  .max(50)
  .refine(s => s.trim().split(/\s+/).filter(Boolean).length <= 8, {
    message: 'Must be at most 8 whitespace-separated tokens',
  })
  .refine(s => !FORBIDDEN_WORDS.some(w => s.includes(w)), {
    message: `Must not contain any of: ${FORBIDDEN_WORDS.join(', ')}`,
  })
  .refine(s => !EMOJI_REGEX.test(s), {
    message: 'Must not contain emoji',
  })
  .refine(s => {
    const last = s.trim().slice(-1);
    return !FORBIDDEN_END_CHARS.includes(last);
  }, {
    message: `Must not end with: ${FORBIDDEN_END_CHARS.join(' ')}`,
  });
export type CoachingMessage = z.infer<typeof CoachingMessageSchema>;
