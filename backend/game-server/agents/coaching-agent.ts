/**
 * Coaching Agent — real-time encouragement message on difficulty adjustment
 *
 * Trigger : server.ts fires this async whenever adaptive-agent adjusts difficulty.
 * Latency : ~300-600ms (Claude Haiku) — delivered as a SEPARATE WebSocket message
 *           after the adjustment params have already been sent. Game continues
 *           immediately; the message appears as a toast a moment later.
 *
 * Design choices:
 *   - max_tokens: 30  — one short sentence, no fluff
 *   - system prompt in English for best Claude instruction-following
 *   - output in Hebrew — user-facing, elderly audience
 *   - no JSON parsing needed — raw text is the output
 */

import Anthropic   from '@anthropic-ai/sdk';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb }   from '../firebase.js';
import type { GameId } from '../types/game.types.js';

const SYSTEM = `\
You are a warm, encouraging cognitive fitness coach for elderly adults playing brain training games.
When the game difficulty changes, you deliver a short, positive Hebrew message to motivate the player.

Rules (strictly enforced):
- Exactly ONE sentence, maximum 8 Hebrew words
- Never use the words "קושי", "קשה", "קל", "שינוי", "מערכת" (never reference the system or difficulty)
- Focus on the player's achievement, effort, or momentum — not the adjustment
- Use simple, clear Hebrew — appropriate for adults 65+
- Plain text only: no quotes, no punctuation at the end, no emoji`;

const GAME_NAMES: Record<GameId, string> = {
  'shapes-click': 'shape recognition',
  'color-trains': 'color trains switching',
  'tictactoe':    'strategic tic-tac-toe',
  'memory':       'memory card matching',
};

export async function getCoachingMessage(
  gameId:      GameId,
  direction:   'harder' | 'easier',
  accuracy:    number,   // 0–1, current sliding window
  durationSec: number,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.Claude_API_KEY;
  if (!apiKey) return null;

  const game   = GAME_NAMES[gameId] ?? gameId;
  const accPct = Math.round(accuracy * 100);

  // Concise context — Claude generates better short text with less input
  const userPrompt = direction === 'harder'
    ? `The player is excelling at ${game}. Accuracy: ${accPct}% after ${durationSec}s. Write one short Hebrew encouragement.`
    : `The player is working hard at ${game}. Accuracy: ${accPct}% after ${durationSec}s. Write one short Hebrew encouragement.`;

  try {
    const client = new Anthropic({ apiKey });

    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 30,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: userPrompt }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : null;

    // Track tokens (fire-and-forget — don't await so we never delay the message)
    getDb().collection('meta').doc('tokenUsage').set({
      totalInputTokens:  FieldValue.increment(msg.usage.input_tokens),
      totalOutputTokens: FieldValue.increment(msg.usage.output_tokens),
    }, { merge: true }).catch(() => {});

    if (text) console.log(`[Coaching] "${text}"`);
    return text;
  } catch (err) {
    console.error('[Coaching]', (err as Error).message);
    return null;
  }
}
