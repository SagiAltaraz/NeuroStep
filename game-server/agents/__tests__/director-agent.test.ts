import { describe, it, expect } from 'vitest';
import { buildDirectorPrompt } from '../director-agent.js';
import { DirectorOutputSchema } from '../schemas.js';
import { createAdaptiveState } from '../adaptive-agent.js';

// ── Schema (fail-closed contract) ────────────────────────────────────────────

const VALID_OUTPUT = {
  domainAssessment: [
    { domainId: 'working-memory', state: 'improving', recommendedDelta: 1 },
  ],
  difficultyPath: { direction: 'harder', chosenPath: 'memory-load', rationale: 'Player is above the flow band.' },
  crossGame: { nextGame: 'where-was-it', reason: 'Shares working-memory, currently the strongest transfer target.' },
  trainingPlan: { focusDomains: ['working-memory'], weeklyGoal: '3 sessions on working-memory' },
  userMessageHe: 'איזה יופי של התקדמות היום',
};

describe('DirectorOutputSchema', () => {
  it('accepts a well-formed advisory', () => {
    expect(DirectorOutputSchema.safeParse(VALID_OUTPUT).success).toBe(true);
  });

  it('rejects unknown domains, games and out-of-range deltas', () => {
    expect(DirectorOutputSchema.safeParse({
      ...VALID_OUTPUT,
      domainAssessment: [{ domainId: 'telepathy', state: 'improving', recommendedDelta: 1 }],
    }).success).toBe(false);
    expect(DirectorOutputSchema.safeParse({
      ...VALID_OUTPUT,
      crossGame: { nextGame: 'chess', reason: 'x' },
    }).success).toBe(false);
    expect(DirectorOutputSchema.safeParse({
      ...VALID_OUTPUT,
      domainAssessment: [{ domainId: 'working-memory', state: 'improving', recommendedDelta: 5 }],
    }).success).toBe(false);
  });

  it('rejects a user message that talks about difficulty/system (same rules as coaching)', () => {
    expect(DirectorOutputSchema.safeParse({
      ...VALID_OUTPUT,
      userMessageHe: 'המערכת העלתה לך את הקושי',
    }).success).toBe(false);
  });
});

// ── Prompt rendering ─────────────────────────────────────────────────────────

describe('buildDirectorPrompt', () => {
  it('renders the structured player model + the game domain mapping', () => {
    const adaptive = createAdaptiveState('s1', 'memory', 'user-1');
    adaptive.featureEvents.push(
      { kind: 'hit', rt: 800 }, { kind: 'miss', rt: null }, { kind: 'hit', rt: 750 },
    );
    adaptive.D = 0.55;

    const prompt = buildDirectorPrompt({
      sessionId: 's1', userId: 'user-1', gameId: 'memory',
      adaptive,
      domains: [{
        domainId: 'working-memory', level: 62, confidence: 0.8,
        trend: 'up', plateauCount: 0, deteriorationFlag: false,
      }],
      sessionsTotal: 7,
    });

    // The model payload is real JSON with the fields the Director reasons over.
    expect(prompt).toContain('"primaryDomain": "working-memory"');
    expect(prompt).toContain('"D": 0.55');
    expect(prompt).toContain('"deterministicPath"');
    expect(prompt).toContain('"level": 62');
    // And it demands the strict output contract.
    expect(prompt).toContain('"userMessageHe"');
    expect(prompt).toContain('Required JSON output');
  });
});
