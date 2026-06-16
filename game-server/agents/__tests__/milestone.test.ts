import { describe, it, expect } from 'vitest';
import { isMilestone } from '../milestone.js';
import type { MilestoneInput } from '../milestone.js';
import type { ProfileUpdateResult } from '../profile-agent.js';
import type { LevelChange } from '../progression.js';

// memory → primary domain is 'working-memory' (see GAME_DOMAINS).
function primary(partial: Partial<ProfileUpdateResult> = {}): ProfileUpdateResult {
  return {
    domainId:      'working-memory',
    prevLevel:     50,
    newLevel:      52,
    confidence:    1,
    sessionsCount: 3,
    isNew:         false,
    ...partial,
  };
}

function input(partial: Partial<MilestoneInput> = {}): MilestoneInput {
  return {
    gameId:         'memory',
    profileUpdates: [primary()],
    levelChanges:   [],
    alertTriggered: false,
    ...partial,
  };
}

describe('isMilestone', () => {
  it('is false on an ordinary session (no triggers)', () => {
    expect(isMilestone(input())).toBe(false);
  });

  it('is true on the first ever session for the primary domain', () => {
    expect(isMilestone(input({ profileUpdates: [primary({ isNew: true, sessionsCount: 1 })] }))).toBe(true);
  });

  it('is true every 5th session of the primary domain', () => {
    expect(isMilestone(input({ profileUpdates: [primary({ sessionsCount: 5 })] }))).toBe(true);
    expect(isMilestone(input({ profileUpdates: [primary({ sessionsCount: 10 })] }))).toBe(true);
    expect(isMilestone(input({ profileUpdates: [primary({ sessionsCount: 6 })] }))).toBe(false);
  });

  it('is true when any node level changed this session', () => {
    const levelChanges: LevelChange[] = [{ domainId: 'working-memory', prevNode: 5, newNode: 6, delta: 1 }];
    expect(isMilestone(input({ levelChanges }))).toBe(true);
  });

  it('is true when a decline alert fired', () => {
    expect(isMilestone(input({ alertTriggered: true }))).toBe(true);
  });

  it('uses the GAME primary domain, ignoring other domains hitting the interval', () => {
    // A secondary domain at sessionsCount 5 should NOT trigger the everyN rule.
    const secondary = primary({ domainId: 'visual-spatial', sessionsCount: 5 });
    expect(isMilestone(input({ profileUpdates: [primary({ sessionsCount: 3 }), secondary] }))).toBe(false);
  });
});
