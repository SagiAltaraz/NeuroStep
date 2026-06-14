import { describe, it, expect } from 'vitest';
import { deterministicCognitiveScore } from '../report-agent.js';
import type { SessionSnapshot } from '../analytics-agent.js';

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
