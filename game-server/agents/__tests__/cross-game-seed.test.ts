import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable doc store the firebase mock reads from (one cognitiveProfile doc per
// domain id). vi.hoisted so it exists before the mock factory runs.
const store = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>() }));

vi.mock('../../firebase.js', () => ({
  getDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: (id: string) => ({
            get: async () => {
              const data = store.docs.get(id);
              return { exists: !!data, id, data: () => data };
            },
          }),
        }),
      }),
    }),
  }),
}));

import { seedLevelFromProfile } from '../adaptive-agent.js';

beforeEach(() => store.docs.clear());

// memory → primary 'working-memory' (w=1.0), secondary 'selective-attention' +
// 'visual-spatial' (w=0.5 each). MIN_CONFIDENCE = 0.4.
describe('seedLevelFromProfile', () => {
  it('returns null for anonymous users', async () => {
    expect(await seedLevelFromProfile('anonymous', 'memory')).toBeNull();
  });

  it('returns null when the user has no profile for the relevant domains', async () => {
    expect(await seedLevelFromProfile('u1', 'memory')).toBeNull();
  });

  it('blends primary + secondary domains by weight·confidence', async () => {
    store.docs.set('working-memory',      { domainId: 'working-memory',      level: 80, confidence: 1 });
    store.docs.set('selective-attention', { domainId: 'selective-attention', level: 60, confidence: 0.5 });
    store.docs.set('visual-spatial',      { domainId: 'visual-spatial',      level: 30, confidence: 0.3 }); // < MIN_CONFIDENCE → ignored
    // num = 80·1·1 + 60·0.5·0.5 = 95 ; den = 1·1 + 0.5·0.5 = 1.25 ; → 76
    expect(await seedLevelFromProfile('u1', 'memory')).toBeCloseTo(76, 0);
  });

  it('ignores low-confidence domains entirely (→ null when none qualify)', async () => {
    store.docs.set('working-memory', { domainId: 'working-memory', level: 80, confidence: 0.1 });
    expect(await seedLevelFromProfile('u1', 'memory')).toBeNull();
  });

  it('a single confident primary domain seeds at its own level', async () => {
    store.docs.set('working-memory', { domainId: 'working-memory', level: 70, confidence: 1 });
    expect(await seedLevelFromProfile('u1', 'memory')).toBeCloseTo(70, 0);
  });
});
