/**
 * Token usage accounting — single writer for `meta/tokenUsage`.
 *
 * Every Claude-using agent (Report / Coach / Coaching / chat) routes its usage
 * through here so the numbers live in one shape and stay consistent:
 *
 *   meta/tokenUsage
 *     totalInputTokens   ← grand total across all agents (kept for back-compat)
 *     totalOutputTokens
 *     byAgent.{agent}.input   ← per-agent split (added in B4) so a regression
 *     byAgent.{agent}.output    in one agent's cost is attributable & alertable
 *     lastUpdated
 *
 * Nested `byAgent` maps are written as objects with `{ merge: true }` so each
 * leaf is incremented independently without clobbering sibling agents.
 *
 * Fire-and-forget: token accounting must never delay a user-facing message or
 * block the end-of-session pipeline, so failures are swallowed.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getDb }      from '../firebase.js';

export type LlmAgent = 'report' | 'coach' | 'coaching' | 'chat';

export interface ClaudeUsage {
  input_tokens:  number;
  output_tokens: number;
}

export function recordTokenUsage(agent: LlmAgent, usage: ClaudeUsage): Promise<void> {
  return getDb().collection('meta').doc('tokenUsage').set({
    totalInputTokens:  FieldValue.increment(usage.input_tokens),
    totalOutputTokens: FieldValue.increment(usage.output_tokens),
    byAgent: {
      [agent]: {
        input:  FieldValue.increment(usage.input_tokens),
        output: FieldValue.increment(usage.output_tokens),
      },
    },
    lastUpdated: Date.now(),
  }, { merge: true }).then(() => {}).catch(() => {});
}
