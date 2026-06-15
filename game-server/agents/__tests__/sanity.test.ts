import { describe, it, expect } from 'vitest';

// Sanity check that the vitest runner is wired up. Real agent tests live in
// the sibling files (domains, report-agent, profile-agent, progression).
describe('test infra', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
