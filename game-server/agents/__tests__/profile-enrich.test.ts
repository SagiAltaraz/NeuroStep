import { describe, it, expect } from 'vitest';
import { computeProfileUpdate, computeVolatility } from '../profile-agent.js';
import type { ProfileState } from '../profile-agent.js';
import { PROFILE_TUNING } from '../progression.config.js';

const PRIMARY = 1.0;
const NOW = 1_750_000_000_000;

function prevState(over: Partial<ProfileState> = {}): ProfileState {
  return {
    _ema: 60, level: 60, confidence: 1, sessionsCount: 10, trend: 'stable',
    lastDomainScores: [60, 60, 60],
    volatility: 0, plateauCount: 0, deteriorationFlag: false,
    bestLevel: 60, bestAt: NOW - 1000,
    ...over,
  };
}

describe('computeVolatility', () => {
  it('is 0 with fewer than 3 samples and for a flat window', () => {
    expect(computeVolatility([50])).toBe(0);
    expect(computeVolatility([50, 50, 50])).toBe(0);
  });
  it('grows with score noise', () => {
    expect(computeVolatility([40, 70, 40, 70])).toBeGreaterThan(10);
  });
});

describe('plateau counting', () => {
  it('increments when the level does not truly climb, resets on a real gain', () => {
    let s = prevState();
    s = computeProfileUpdate(s, 60, PRIMARY, PROFILE_TUNING, NOW);   // flat → plateau 1
    expect(s.plateauCount).toBe(1);
    s = computeProfileUpdate(s, 60, PRIMARY, PROFILE_TUNING, NOW);   // still flat → 2
    expect(s.plateauCount).toBe(2);
    s = computeProfileUpdate(s, 95, PRIMARY, PROFILE_TUNING, NOW);   // real climb → reset
    expect(s.plateauCount).toBe(0);
  });
});

describe('peak tracking', () => {
  it('bestLevel never decays and bestAt marks the climb', () => {
    let s = computeProfileUpdate(null, 70, PRIMARY, PROFILE_TUNING, NOW);
    expect(s.bestLevel).toBe(70);
    expect(s.bestAt).toBe(NOW);
    // Scores collapse — level EMAs down but the peak stays.
    for (let i = 0; i < 5; i++) s = computeProfileUpdate(s, 30, PRIMARY, PROFILE_TUNING, NOW + 1);
    expect(s.level).toBeLessThan(70);
    expect(s.bestLevel).toBe(70);
    expect(s.bestAt).toBe(NOW);
  });
});

describe('deterioration flag', () => {
  it('fires on a sustained drop below the peak with no recovery in sight', () => {
    // Start high, then sustained low scores — the player falls AND stays low.
    let s = computeProfileUpdate(null, 80, PRIMARY, PROFILE_TUNING, NOW);
    for (let i = 0; i < 5; i++) s = computeProfileUpdate(s, 40, PRIMARY, PROFILE_TUNING, NOW);
    expect(s.confidence).toBe(1);
    expect(s.bestLevel - s.level).toBeGreaterThanOrEqual(PROFILE_TUNING.DETERIORATION_DROP);
    expect(s.deteriorationFlag).toBe(true);
  });

  it('clears as soon as the player starts recovering', () => {
    let s = computeProfileUpdate(null, 80, PRIMARY, PROFILE_TUNING, NOW);
    for (let i = 0; i < 5; i++) s = computeProfileUpdate(s, 40, PRIMARY, PROFILE_TUNING, NOW);
    expect(s.deteriorationFlag).toBe(true);
    // Two strongly rising sessions flip the trend window upward.
    s = computeProfileUpdate(s, 60, PRIMARY, PROFILE_TUNING, NOW);
    s = computeProfileUpdate(s, 75, PRIMARY, PROFILE_TUNING, NOW);
    expect(s.trend).toBe('up');
    expect(s.deteriorationFlag).toBe(false);
  });

  it('never fires on a low-confidence profile', () => {
    // Only 2 sessions — confidence 0.4 < MIN_CONFIDENCE_TO_FLAG.
    let s = computeProfileUpdate(null, 80, PRIMARY, PROFILE_TUNING, NOW);
    s = computeProfileUpdate(s, 30, PRIMARY, PROFILE_TUNING, NOW);
    expect(s.confidence).toBeLessThan(PROFILE_TUNING.MIN_CONFIDENCE_TO_FLAG);
    expect(s.deteriorationFlag).toBe(false);
  });

  it('does not fire when the player is simply still near their peak', () => {
    const s = computeProfileUpdate(prevState(), 55, PRIMARY, PROFILE_TUNING, NOW);
    expect(s.deteriorationFlag).toBe(false);
  });
});
