import { describe, it, expect } from 'vitest';
import {
  computeProfileUpdate,
  computeTrend,
  journeyCeiling,
  nextJourneyLevel,
} from '../profile-agent.js';
import type { ProfileState } from '../profile-agent.js';
import { JOURNEY_TUNING } from '../progression.config.js';

const PRIMARY = 1.0;
const SECONDARY = 0.5;

describe('computeProfileUpdate — cold start', () => {
  it('seeds the EMA to the score, confidence 0.2, sessionsCount 1, stable', () => {
    const s = computeProfileUpdate(null, 70, PRIMARY);
    expect(s._ema).toBe(70);
    expect(s.confidence).toBeCloseTo(0.2);
    expect(s.sessionsCount).toBe(1);
    expect(s.trend).toBe('stable');
    expect(s.lastDomainScores).toEqual([70]);
  });

  // The bug this pacing exists for: one strong 10-minute session used to land
  // the player on step 68 of 100 with nothing left to climb.
  it('starts the journey at the bottom of the map however strong the session', () => {
    expect(computeProfileUpdate(null, 68, PRIMARY).level)
      .toBe(JOURNEY_TUNING.FIRST_SESSION_CAP);
    expect(computeProfileUpdate(null, 100, PRIMARY).level)
      .toBe(JOURNEY_TUNING.FIRST_SESSION_CAP);
  });

  it('still lets a weak first session sit below the cap', () => {
    expect(computeProfileUpdate(null, 3, PRIMARY).level).toBe(3);
  });
});

describe('computeProfileUpdate — convergence', () => {
  it('moves toward a constant new input over repeated sessions', () => {
    let s = computeProfileUpdate(null, 50, PRIMARY); // cold start at 50
    const levels: number[] = [s.level];
    for (let i = 0; i < 30; i++) {
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

  it('never climbs more than the per-session cap, even at a perfect score', () => {
    let s = computeProfileUpdate(null, 100, PRIMARY);
    for (let i = 0; i < 25; i++) {
      const prev = s.level;
      s = computeProfileUpdate(s, 100, PRIMARY);
      expect(s.level - prev).toBeLessThanOrEqual(JOURNEY_TUNING.MAX_GAIN_PER_SESSION);
    }
  });

  it('takes ~20 sessions of perfect play to reach the end of the map', () => {
    let s = computeProfileUpdate(null, 100, PRIMARY);
    let sessions = 1;
    while (s.level < 100 && sessions < 100) {
      s = computeProfileUpdate(s, 100, PRIMARY);
      sessions += 1;
    }
    expect(sessions).toBe(20);
  });

  it('a mediocre player settles at their ability while a strong one keeps climbing', () => {
    let strong = computeProfileUpdate(null, 90, PRIMARY);
    let weak   = computeProfileUpdate(null, 35, PRIMARY);
    for (let i = 0; i < 12; i++) {
      strong = computeProfileUpdate(strong, 90, PRIMARY);
      weak   = computeProfileUpdate(weak, 35, PRIMARY);
    }
    expect(weak.level).toBeLessThanOrEqual(36);          // parked at their ability
    expect(strong.level).toBeGreaterThan(weak.level);    // still on the way up
  });

  it('confidence reaches 1.0 by the warm-up session count', () => {
    let s = computeProfileUpdate(null, 60, PRIMARY); // session 1 → conf 0.2
    for (let i = 0; i < 4; i++) s = computeProfileUpdate(s, 60, PRIMARY); // sessions 2..5
    expect(s.sessionsCount).toBe(5);
    expect(s.confidence).toBe(1);
  });
});

describe('journey pacing', () => {
  it('the experience ceiling grows one step block per session and stops at 100', () => {
    expect(journeyCeiling(1)).toBe(JOURNEY_TUNING.FIRST_SESSION_CAP);
    expect(journeyCeiling(2)).toBe(
      JOURNEY_TUNING.FIRST_SESSION_CAP + JOURNEY_TUNING.CEILING_PER_SESSION);
    expect(journeyCeiling(500)).toBe(100);
  });

  it('never runs ahead of the ability, the ceiling, or the step cap', () => {
    expect(nextJourneyLevel(0, 100, 1)).toBe(JOURNEY_TUNING.FIRST_SESSION_CAP);
    expect(nextJourneyLevel(40, 100, 50)).toBe(40 + JOURNEY_TUNING.MAX_GAIN_PER_SESSION);
    expect(nextJourneyLevel(40, 42, 50)).toBe(42);   // ability is the target, not the cap
    expect(nextJourneyLevel(6, 100, 2)).toBe(journeyCeiling(2));  // experience gates it
  });

  it('falls no faster than the drop cap', () => {
    expect(nextJourneyLevel(60, 10, 50)).toBe(60 - JOURNEY_TUNING.MAX_DROP_PER_SESSION);
    expect(nextJourneyLevel(60, 58, 50)).toBe(58);
  });

  // Profiles written before the pacing existed sit way above their ceiling.
  it('walks a legacy inflated profile back down without flagging deterioration', () => {
    const legacy: ProfileState = {
      _ema: 68, level: 68, confidence: 1, sessionsCount: 1, trend: 'stable',
      lastDomainScores: [68], volatility: 0, plateauCount: 0,
      deteriorationFlag: false, bestLevel: 68, bestAt: 0,
    };
    let s = computeProfileUpdate(legacy, 68, PRIMARY);
    expect(s.level).toBe(68 - JOURNEY_TUNING.MAX_DROP_PER_SESSION);
    expect(s.deteriorationFlag).toBe(false);

    // Keep playing at the same level all the way past the point where the walk
    // down meets the ceiling and turns back into a climb: an inflated peak must
    // not keep measuring the player against a summit they never climbed.
    for (let i = 0; i < 15; i++) {
      s = computeProfileUpdate(s, 68, PRIMARY);
      expect(s.deteriorationFlag).toBe(false);
      expect(s.bestLevel).toBeLessThanOrEqual(s.level);   // the inflated peak is gone
    }
    // They really are that good — they just have to earn the step this time.
    expect(s.level).toBeLessThanOrEqual(journeyCeiling(s.sessionsCount));
    expect(s.level).toBe(68);
  });
});

describe('computeProfileUpdate — primary vs secondary', () => {
  it('primary domain moves faster than secondary from the same prev state', () => {
    const prev: ProfileState = {
      _ema: 50, level: 50, confidence: 1, sessionsCount: 10, trend: 'stable', lastDomainScores: [50, 50, 50],
      volatility: 0, plateauCount: 0, deteriorationFlag: false, bestLevel: 50, bestAt: 0,
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
