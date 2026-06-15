import { describe, it, expect, vi } from 'vitest';

// Stub Firestore so generateSessionReport's persistence path runs without a real
// Firebase app. getDb() is only called inside generateSessionReport; the pure
// deterministicCognitiveScore tests below don't touch it.
vi.mock('../../firebase.js', () => {
  // Chainable stub: doc() also exposes collection() so nested paths like
  // users/{uid}/reports/{id} resolve.
  const docRef: any = { set: async () => {} };
  const colRef: any = { doc: () => docRef };
  docRef.collection = () => colRef;
  return {
    getDb: () => ({
      batch: () => ({ set: () => {}, commit: async () => {} }),
      collection: () => colRef,
    }),
  };
});

import { deterministicCognitiveScore, generateSessionReport } from '../report-agent.js';
import type { ReportInput } from '../report-agent.js';
import type { SessionSnapshot } from '../analytics-agent.js';
import type { AdaptiveState } from '../adaptive-agent.js';

function snap(partial: Partial<SessionSnapshot>): SessionSnapshot {
  return {
    userId:        'u1',
    gameId:        'memory',
    durationMs:    60_000,
    hits:          0,
    misses:        0,
    timeouts:      0,
    accuracy:      null,
    avgReactionMs: 800,
    peakStreak:    0,
    reactionTimes: [],
    ...partial,
  };
}

describe('deterministicCognitiveScore', () => {
  it('returns a neutral 50 when accuracy is null (no scored events)', () => {
    expect(deterministicCognitiveScore(snap({ accuracy: null }))).toBe(50);
  });

  it('perfect accuracy + strong streak caps at 100', () => {
    expect(deterministicCognitiveScore(snap({ accuracy: 1, peakStreak: 5 }))).toBe(100);
    expect(deterministicCognitiveScore(snap({ accuracy: 1, peakStreak: 20 }))).toBe(100);
  });

  it('perfect accuracy with no streak is 85', () => {
    expect(deterministicCognitiveScore(snap({ accuracy: 1, peakStreak: 0 }))).toBe(85);
  });

  it('zero accuracy is 0', () => {
    expect(deterministicCognitiveScore(snap({ accuracy: 0, peakStreak: 0 }))).toBe(0);
  });

  it('blends accuracy and streak components', () => {
    // 0.8*85 = 68 ; streak 3/5*15 = 9 ; total 77
    expect(deterministicCognitiveScore(snap({ accuracy: 0.8, peakStreak: 3 }))).toBe(77);
  });

  it('always returns an integer within 0..100', () => {
    for (const acc of [0, 0.13, 0.37, 0.5, 0.66, 0.91, 1]) {
      for (const streak of [0, 1, 4, 9]) {
        const s = deterministicCognitiveScore(snap({ accuracy: acc, peakStreak: streak }));
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('generateSessionReport — Claude timeout', () => {
  function reportInput(snapshot: SessionSnapshot): ReportInput {
    return {
      sessionId: 's1',
      snapshot,
      // Only a few fields are read by buildUserPrompt; cast a partial.
      adaptive: {
        reactionWindow: [800, 820, 810, 790],
        baselineMean:   850,
        baselineStdDev: 100,
        emaReactionMs:  805,
      } as unknown as AdaptiveState,
      adjustments: [],
    };
  }

  // A stub whose messages.create never resolves on its own — it rejects only
  // when the AbortController fires, mimicking the real SDK's abort behaviour.
  const hangingClient = {
    messages: {
      create: (_body: any, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          const signal = options?.signal;
          if (!signal) return; // never resolves (shouldn't happen — we always pass one)
          if (signal.aborted) return reject(new Error('aborted'));
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    },
  };

  it('falls back to the deterministic score when the Claude call hangs past the budget', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy  = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const snapshot = snap({ accuracy: 0.8, peakStreak: 3 });
      const promise  = generateSessionReport(reportInput(snapshot), { client: hangingClient });

      // Advance past the 8s budget; *Async flushes the abort rejection's microtasks.
      await vi.advanceTimersByTimeAsync(8000);
      const report = await promise;

      expect(report).not.toBeNull();
      // cognitiveScore came from the deterministic path, not Claude.
      expect(report!.cognitiveScore).toBe(deterministicCognitiveScore(snapshot));
      // domainScores still produced (derived from the deterministic score).
      expect(report!.domainScores['working-memory']).toBe(report!.cognitiveScore);
      // The timeout branch logged (proves we hit the timeout, not another fallback).
      const warned = warnSpy.mock.calls.flat().some(a => String(a).includes('timed out'));
      expect(warned).toBe(true);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
