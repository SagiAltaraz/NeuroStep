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

// ── Coach Agent: longitudinal report (every 5 sessions) ───────────────────────
// NOTE: fields use *En suffix today; Phase 4D will migrate to *He. When that
// happens, rename keys here and the Coach Agent prompt language; the future
// CoachReportsPage should already use a `report.summaryHe ?? report.summaryEn`
// fallback so historical *En docs keep rendering.

export const CoachReportSchema = z.object({
  overallProgress:    z.enum(['improving', 'stable', 'needs_attention']),
  summaryEn:          z.string().min(1).max(500),
  highlightsEn:       z.array(z.string().min(1).max(200)).min(1).max(5),
  recommendationsEn:  z.array(z.string().min(1).max(200)).min(1).max(3),
  cognitiveInsightEn: z.string().min(1).max(500),
});
export type CoachReportFromClaude = z.infer<typeof CoachReportSchema>;

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
