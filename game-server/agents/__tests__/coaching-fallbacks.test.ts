import { describe, it, expect } from 'vitest';
import { COACHING_FALLBACKS_HE } from '../coaching-fallbacks.js';
import { CoachingMessageSchema } from '../schemas.js';

// The fallback bank carries MOST coaching toasts now that Claude is gated to one
// call per session (B2). Every line must satisfy the same content contract the
// schema enforces on Claude output — otherwise a fallback could ship a toast we
// would have rejected from the model.
describe('coaching fallback bank', () => {
  for (const direction of ['harder', 'easier'] as const) {
    describe(direction, () => {
      const bank = COACHING_FALLBACKS_HE[direction];

      it('has at least 30 varied messages', () => {
        expect(bank.length).toBeGreaterThanOrEqual(30);
        expect(new Set(bank).size).toBe(bank.length); // no duplicates
      });

      it('every message passes CoachingMessageSchema', () => {
        for (const msg of bank) {
          const result = CoachingMessageSchema.safeParse(msg);
          expect(result.success, `"${msg}" failed: ${result.success ? '' : JSON.stringify(result.error.issues)}`).toBe(true);
        }
      });
    });
  }
});
