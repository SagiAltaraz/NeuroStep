import { describe, it, expect } from 'vitest';
import { deterministicProgress } from '../coach-agent.js';

// Series are most-recent-first (index 0 = newest), matching the Firestore query
// order. deterministicProgress compares newest − oldest against ±5.
describe('deterministicProgress', () => {
  it('is stable with fewer than two usable points', () => {
    expect(deterministicProgress([], [])).toBe('stable');
    expect(deterministicProgress([70], [])).toBe('stable');
  });

  it('reports improving when newest is well above oldest', () => {
    expect(deterministicProgress([80, 70, 60], [])).toBe('improving');
  });

  it('reports needs_attention when newest is well below oldest', () => {
    expect(deterministicProgress([55, 65, 75], [])).toBe('needs_attention');
  });

  it('reports stable for small movement', () => {
    expect(deterministicProgress([72, 70, 71], [])).toBe('stable');
  });

  it('falls back to accuracy when too few cognitive scores exist', () => {
    expect(deterministicProgress([], [90, 80, 70])).toBe('improving');
  });
});
