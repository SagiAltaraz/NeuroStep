import { describe, it, expect } from 'vitest';
import { computeProfileUpdate, computeTrend } from '../profile-agent.js';
import type { ProfileState } from '../profile-agent.js';

const PRIMARY = 1.0;
const SECONDARY = 0.5;

describe('computeProfileUpdate — cold start', () => {
  it('ramps gently from the neutral prior (not straight to the score), confidence 0.2', () => {
    const s = computeProfileUpdate(null, 70, PRIMARY);
    // 25*(1-0.25) + 70*0.25 = 36.25  → gradual climb, not an instant jump to 70
    expect(s._ema).toBeCloseTo(36.25);
    expect(s.level).toBe(36);
    expect(s.confidence).toBeCloseTo(0.2);
    expect(s.sessionsCount).toBe(1);
    expect(s.trend).toBe('stable');
    expect(s.lastDomainScores).toEqual([70]);
  });
});

describe('computeProfileUpdate — convergence', () => {
  it('moves toward a constant new input over repeated sessions', () => {
    let s = computeProfileUpdate(null, 50, PRIMARY); // cold start at 50
    const levels: number[] = [s.level];
    for (let i = 0; i < 10; i++) {
      s = computeProfileUpdate(s, 80, PRIMARY);
      levels.push(s.level);
    }
    // monotonically non-decreasing and approaching 80
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
    expect(s.level).toBeGreaterThan(75);
    expect(s.level).toBeLessThanOrEqual(80);
  });

  it('confidence reaches 1.0 by the warm-up session count', () => {
    let s = computeProfileUpdate(null, 60, PRIMARY); // session 1 → conf 0.2
    for (let i = 0; i < 4; i++) s = computeProfileUpdate(s, 60, PRIMARY); // sessions 2..5
    expect(s.sessionsCount).toBe(5);
    expect(s.confidence).toBe(1);
  });
});

describe('computeProfileUpdate — primary vs secondary', () => {
  it('primary domain moves faster than secondary from the same prev state', () => {
    const prev: ProfileState = {
      _ema: 50, level: 50, confidence: 1, sessionsCount: 10, trend: 'stable', lastDomainScores: [50, 50, 50],
    };
    const asPrimary   = computeProfileUpdate(prev, 90, PRIMARY);
    const asSecondary = computeProfileUpdate(prev, 90, SECONDARY);
    expect(asPrimary._ema).toBeGreaterThan(asSecondary._ema);
  });
});

describe('computeTrend', () => {
  it('is stable with fewer than 3 samples', () => {
    expect(computeTrend([])).toBe('stable');
    expect(computeTrend([10, 20])).toBe('stable');
  });
  it('reports up when the window rises past the threshold', () => {
    expect(computeTrend([50, 55, 60])).toBe('up');
  });
  it('reports down when the window falls past the threshold', () => {
    expect(computeTrend([60, 55, 50])).toBe('down');
  });
  it('reports stable for small movement', () => {
    expect(computeTrend([50, 51, 51])).toBe('stable');
  });
});

describe('computeProfileUpdate — trend propagation', () => {
  it('flags an upward trend after rising sessions', () => {
    let s = computeProfileUpdate(null, 40, PRIMARY);
    s = computeProfileUpdate(s, 60, PRIMARY);
    s = computeProfileUpdate(s, 80, PRIMARY);
    expect(s.trend).toBe('up');
  });
});
