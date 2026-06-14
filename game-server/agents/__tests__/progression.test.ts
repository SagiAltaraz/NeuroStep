import { describe, it, expect } from 'vitest';
import { computeProgression, computeRank } from '../progression.js';
import type { RegionState, Regions } from '../progression.js';
import type { ProfileUpdateResult } from '../profile-agent.js';
import { PROGRESSION_TUNING } from '../progression.config.js';
import type { ProblemId } from '../../types/domains.js';

const WM: ProblemId = 'working-memory';

function upd(domainId: ProblemId, newLevel: number, confidence = 1): ProfileUpdateResult {
  return { domainId, prevLevel: 0, newLevel, confidence };
}
function region(node: number, peakNode = node, graceLeft = PROGRESSION_TUNING.DEMOTE_GRACE): RegionState {
  return { node, peakNode, graceLeft, lastDelta: 0 };
}

describe('computeRank', () => {
  it('maps overall level to rank bands', () => {
    expect(computeRank(8)).toBe('beginner');
    expect(computeRank(15)).toBe('beginner');
    expect(computeRank(16)).toBe('explorer');
    expect(computeRank(36)).toBe('advanced');
    expect(computeRank(56)).toBe('expert');
    expect(computeRank(71)).toBe('champion');
    expect(computeRank(80)).toBe('champion');
  });
});

describe('node mapping (level → node)', () => {
  const cases: [number, number][] = [[0, 1], [9, 1], [10, 2], [25, 3], [99, 10], [100, 10]];
  for (const [level, node] of cases) {
    it(`level ${level} → node ${node}`, () => {
      const r = computeProgression({ [WM]: region(1) }, [upd(WM, level)]);
      expect(r.regions[WM].node).toBe(node);
    });
  }
});

describe('promotion', () => {
  it('promotes eagerly and raises peakNode + resets grace', () => {
    const r = computeProgression({ [WM]: region(1) }, [upd(WM, 25)]);
    expect(r.regions[WM].node).toBe(3);
    expect(r.regions[WM].peakNode).toBe(3);
    expect(r.regions[WM].graceLeft).toBe(PROGRESSION_TUNING.DEMOTE_GRACE);
    expect(r.levelChanges[0]).toMatchObject({ prevNode: 1, newNode: 3, delta: 2 });
    expect(r.avatarState).toBe('climb');
  });
});

describe('demotion needs grace (2 consecutive sub-threshold sessions)', () => {
  it('holds the node on the first sub-threshold session, demotes on the second', () => {
    const start: Partial<Regions> = { [WM]: region(5, 5, 2) };
    const first  = computeProgression(start, [upd(WM, 20, 0.8)]);
    expect(first.regions[WM].node).toBe(5);          // held
    expect(first.regions[WM].graceLeft).toBe(1);
    expect(first.levelChanges[0].delta).toBe(0);

    const second = computeProgression(first.regions, [upd(WM, 20, 0.8)]);
    expect(second.regions[WM].node).toBe(4);         // demoted
    expect(second.levelChanges[0].delta).toBe(-1);
    expect(second.avatarState).toBe('drop');
  });
});

describe('floor below peak', () => {
  it('never drops more than FLOOR_BELOW_PEAK below the peak', () => {
    // Already one below peak (peak 5, node 4). Repeated bad sessions must hold at 4.
    let regions: Partial<Regions> = { [WM]: region(4, 5, 1) };
    for (let i = 0; i < 4; i++) {
      const res = computeProgression(regions, [upd(WM, 5, 0.9)]);
      regions = res.regions;
      expect(res.regions[WM].node).toBe(4);          // peak(5) - FLOOR_BELOW_PEAK(1)
    }
  });
});

describe('confidence gate', () => {
  it('does not demote when confidence is below the threshold', () => {
    const r = computeProgression({ [WM]: region(5, 5, 1) }, [upd(WM, 5, 0.5)]);
    expect(r.regions[WM].node).toBe(5);
    expect(r.regions[WM].graceLeft).toBe(PROGRESSION_TUNING.DEMOTE_GRACE); // grace reset
  });
});

describe('yo-yo buffer', () => {
  it('a small dip within the buffer does not demote', () => {
    // node 3 floor is level 20; buffer 5 means demote only below 15.
    const r = computeProgression({ [WM]: region(3, 3, 2) }, [upd(WM, 21, 1)]);
    expect(r.regions[WM].node).toBe(3);
    expect(r.avatarState).toBe('idle');
  });
});

describe('overall + isolation', () => {
  it('overallLevel sums all 8 region nodes; untouched domains stay at default', () => {
    const r = computeProgression({}, [upd(WM, 25)]); // promote WM to node 3, others default 1
    expect(r.regions[WM].node).toBe(3);
    expect(r.overallLevel).toBe(3 + 7 * 1);          // 10
    expect(r.rank).toBe('beginner');
    // a different domain in prev is untouched when not in the updates
    const r2 = computeProgression({ 'reaction-time': region(6, 6) }, [upd(WM, 25)]);
    expect(r2.regions['reaction-time'].node).toBe(6);
  });
});
