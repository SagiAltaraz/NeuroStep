/**
 * Director Agent — advisory training guidance from the structured player model.
 *
 * Trigger : server.ts finalize pipeline, MILESTONE sessions only (same cadence
 *           as the report narrative — the LLM budget lives in one place).
 * Input   : the live behavioral fingerprint (live-model) + the full cognitive
 *           profile — i.e. the structured "prompt data", rendered to text HERE,
 *           on demand. Prose is never stored as the source of truth.
 * Output  : users/{userId}/directorAdvice/{sessionId}   (validated JSON advice)
 *           users/{userId}/promptSnapshots/{sessionId}  (observability: the
 *           EXACT rendered prompt + model version, so "why did it choose X?"
 *           is always answerable)
 *
 * Safety model: the output is ADVISORY. The deterministic controller clamps
 * every difficulty move; DirectorOutputSchema fails closed on malformed JSON;
 * userMessageHe passes the same forbidden-word rules as the coaching toast.
 */

import Anthropic                 from '@anthropic-ai/sdk';
import { getDb }                 from '../firebase.js';
import type { GameId }           from '../types/game.types.js';
import { GAME_DOMAINS }          from '../types/domains.js';
import type { AdaptiveState }    from './adaptive-agent.js';
import { currentFingerprint }    from './live-model.js';
import type { DomainSnapshot }   from './planner-agent.js';
import { DirectorOutputSchema }  from './schemas.js';
import type { DirectorOutput }   from './schemas.js';
import { recordTokenUsage }      from './token-usage.js';

export const DIRECTOR_SCHEMA_VERSION = 1;
const DIRECTOR_LLM_TIMEOUT_MS = 8000;
const MODEL = 'claude-haiku-4-5-20251001';

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM = `\
You are the Cognitive Training Director for NeuroStep, an adaptive brain-training
platform for older adults. You do not run the game. You read a player's structured
cognitive model and decide how to guide their training so difficulty stays in the
"flow zone" (challenging but achievable) and measurable gains accumulate over months.

OPTIMIZE FOR:
1. ~70% success rate — never bored, never defeated.
2. Grow the WEAKEST and DECLINING abilities first; protect the strong ones.
3. Cross-game transfer: an ability lives at the DOMAIN level, shared by every game
   that trains it.
4. On deterioration signals respond with GENTLER, confidence-building sessions —
   never a discouraging spike or a drop that feels like failure.

REASONING RULES:
- Anchor on accuracy as the success rate; speed only modifies around the personal baseline.
- Read playstyle: high impulsivityRate → train response-inhibition via distractors, not speed.
  High hesitationRate → build confidence, shorten time pressure GRADUALLY.
  Low errorRecovery → short sessions ending on success. Early fatigueOnsetIdx → shorter sessions.
- Trust nothing below 0.4 confidence. Judge improvement/decline from trend + plateauCount +
  deteriorationFlag, never one session.
- crossGame.nextGame: the game whose primary domain is the weakest/most-declining
  sufficiently-confident domain.

OUTPUT: return ONLY valid JSON matching the requested shape — no markdown, no preamble.
userMessageHe: <= 12 words, warm plain Hebrew, no numbers, no jargon, never the words
קושי/קל/קשה/שינוי/מערכת, no medical claims.`;

export interface DirectorInput {
  sessionId: string;
  userId:    string;
  gameId:    GameId;
  adaptive:  AdaptiveState;
  domains:   DomainSnapshot[];
  sessionsTotal?: number;
}

export function buildDirectorPrompt(input: DirectorInput): string {
  const { features, chosenPath, tags } = currentFingerprint(input.adaptive);
  const { primary, secondary } = GAME_DOMAINS[input.gameId];

  const payload = {
    player: { id: input.userId, sessionsTotal: input.sessionsTotal ?? null },
    game:   { id: input.gameId, primaryDomain: primary, secondaryDomains: secondary },
    liveModel: {
      D: Math.round(input.adaptive.D * 1000) / 1000,
      ...features,
      deterministicPath: chosenPath,   // what the local director already chose
      playstyleTags: tags,
    },
    cognitiveProfile: input.domains,
  };

  return `## Player model
${JSON.stringify(payload, null, 2)}

## Required JSON output
{
  "domainAssessment": [{ "domainId": "<domain>", "state": "improving|stable|plateaued|declining", "recommendedDelta": -2..2 }],
  "difficultyPath":   { "direction": "harder|easier|hold", "chosenPath": "speed|distractors|memory-load|hold|recover", "rationale": "<one short English sentence>" },
  "crossGame":        { "nextGame": "<gameId>", "reason": "<which shared domain and why now>" },
  "trainingPlan":     { "focusDomains": ["<domain>"], "weeklyGoal": "<concise>" },
  "userMessageHe":    "<warm Hebrew, <= 12 words>"
}`;
}

// ── Runner ───────────────────────────────────────────────────────────────────

// Minimal structural client type so tests can inject a stub (same pattern as
// report-agent).
interface ClaudeClient {
  messages: { create: (body: any, options?: { signal?: AbortSignal }) => Promise<any> };
}

/**
 * Run the Director on a milestone session. Fire-and-forget from the caller's
 * perspective: any failure (no key, timeout, bad JSON, schema reject) means
 * simply "no advice this session" — the deterministic pipeline already did its
 * job. Persists BOTH the advice and the rendered prompt snapshot.
 */
export async function runDirector(
  input: DirectorInput,
  deps: { client?: ClaudeClient } = {},
): Promise<DirectorOutput | null> {
  if (input.userId === 'anonymous') return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const client: ClaudeClient | null = deps.client ?? (apiKey ? new Anthropic({ apiKey }) : null);
  if (!client) return null;

  const prompt = buildDirectorPrompt(input);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECTOR_LLM_TIMEOUT_MS);
  try {
    const message = await client.messages.create(
      {
        model:      MODEL,
        max_tokens: 700,
        system:     SYSTEM,
        messages:   [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal },
    );

    const text      = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[Director] No JSON in response | session:${input.sessionId}`);
      return null;
    }

    let parsed: unknown;
    try { parsed = JSON.parse(jsonMatch[0]); }
    catch {
      console.warn(`[Director] JSON parse failed | session:${input.sessionId}`);
      return null;
    }

    const validation = DirectorOutputSchema.safeParse(parsed);
    if (!validation.success) {
      console.warn(`[Director] Schema rejected | session:${input.sessionId} | `
        + JSON.stringify(validation.error.issues).slice(0, 300));
      return null;
    }

    const advice = validation.data;
    const now    = Date.now();
    const db     = getDb();
    const userRef = db.collection('users').doc(input.userId);
    const batch   = db.batch();
    batch.set(userRef.collection('directorAdvice').doc(input.sessionId), {
      ...advice,
      sessionId:   input.sessionId,
      gameId:      input.gameId,
      generatedAt: now,
      v:           DIRECTOR_SCHEMA_VERSION,
    });
    // Observability: the EXACT prompt this advice came from. Debugging "why",
    // never logic — agents always re-render prompts from the structured model.
    batch.set(userRef.collection('promptSnapshots').doc(input.sessionId), {
      agent:          'director',
      modelVersion:   MODEL,
      renderedPrompt: prompt,
      sessionId:      input.sessionId,
      createdAt:      now,
      v:              DIRECTOR_SCHEMA_VERSION,
    });
    await batch.commit();

    if (message.usage) await recordTokenUsage('director', message.usage);
    console.log(`[Director] ${input.userId} path:${advice.difficultyPath.chosenPath} `
      + `next:${advice.crossGame.nextGame} focus:${advice.trainingPlan.focusDomains.join(',')}`);
    return advice;
  } catch (err) {
    if (controller.signal.aborted) {
      console.warn(`[Director] Timed out after ${DIRECTOR_LLM_TIMEOUT_MS}ms | session:${input.sessionId}`);
    } else {
      console.warn(`[Director] Call failed | session:${input.sessionId} | ${(err as Error).message}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Profile snapshot loader (shared shape with planner-agent) ────────────────

export async function loadDomainSnapshots(userId: string): Promise<DomainSnapshot[]> {
  try {
    const col = await getDb().collection('users').doc(userId).collection('cognitiveProfile').get();
    const num = (v: unknown, fb: number) => (typeof v === 'number' ? v : fb);
    return col.docs.flatMap(doc => {
      const d = doc.data() as Record<string, unknown>;
      if (typeof d.domainId !== 'string') return [];
      return [{
        domainId:          d.domainId as DomainSnapshot['domainId'],
        level:             num(d.level, 0),
        ability:           num(d._ema, num(d.level, 0)),
        confidence:        num(d.confidence, 0),
        trend:             d.trend === 'up' || d.trend === 'down' ? d.trend : 'stable',
        plateauCount:      num(d.plateauCount, 0),
        deteriorationFlag: d.deteriorationFlag === true,
      }];
    });
  } catch {
    return [];
  }
}
