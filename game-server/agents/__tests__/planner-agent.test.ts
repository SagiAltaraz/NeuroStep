import { describe, it, expect } from 'vitest';
import { computeTrainingPlan } from '../planner-agent.js';
import type { DomainSnapshot } from '../planner-agent.js';
import type { ProblemId } from '../../types/domains.js';
import { PLANNER_TUNING } from '../progression.config.js';

const NOW = 1_750_000_000_000;

function dom(
  domainId: ProblemId, level: number,
  over: Partial<DomainSnapshot> = {},
): DomainSnapshot {
  return {
    domainId, level, confidence: 1, trend: 'stable',
    plateauCount: 0, deteriorationFlag: false, ...over,
  };
}

describe('computeTrainingPlan — focus ranking', () => {
  it('deteriorating domains outrank merely weak ones', () => {
    const plan = computeTrainingPlan([
      dom('working-memory', 20),                                        // weakest
      dom('reaction-time', 80, { deteriorationFlag: true, trend: 'down' }), // declining
      dom('visual-spatial', 60),
    ], NOW);
    expect(plan.focusDomains[0]).toBe('reaction-time');   // protect first
    expect(plan.focusDomains[1]).toBe('working-memory');  // then weakest
  });

  it('trending-down beats a lower stable level', () => {
    const plan = computeTrainingPlan([
      dom('working-memory', 30),
      dom('processing-speed', 70, { trend: 'down' }),
    ], NOW);
    expect(plan.focusDomains[0]).toBe('processing-speed');
  });

  it('ignores domains below the confidence gate', () => {
    const plan = computeTrainingPlan([
      dom('working-memory', 10, { confidence: 0.2 }),   // too shaky to prescribe
      dom('visual-spatial', 55),
    ], NOW);
    expect(plan.focusDomains).toEqual(['visual-spatial']);
  });
});

describe('computeTrainingPlan — game selection', () => {
  it('recommends primary trainers of the focus domains first', () => {
    const plan = computeTrainingPlan([dom('working-memory', 30)], NOW);
    // memory is THE primary working-memory trainer.
    expect(plan.recommendedGames[0]).toBe('memory');
    // where-was-it touches working-memory as secondary.
    expect(plan.recommendedGames).toContain('where-was-it');
    expect(plan.recommendedGames.length).toBeLessThanOrEqual(PLANNER_TUNING.GAMES_MAX);
  });

  it('warm-start difficulty comes from the cross-game blend (0..1)', () => {
    const plan = computeTrainingPlan([
      dom('working-memory', 60),
      dom('selective-attention', 40),
      dom('visual-spatial', 50),
    ], NOW);
    // Weakest domains are selective-attention + visual-spatial, so their
    // primary trainers lead the recommendations.
    expect(plan.recommendedGames[0]).toBe('find-letter');
    // find-letter blend: selective-attention 40 (processing-speed unknown)
    // → 0.40 · WARMUP_FACTOR(0.85) = 0.34
    const d = plan.targetDifficulty['find-letter'];
    expect(d).toBeGreaterThan(0.25);
    expect(d).toBeLessThan(0.45);
    // Every recommended game got a warm-start target from the known domains.
    for (const g of plan.recommendedGames) {
      expect(plan.targetDifficulty[g]).toBeGreaterThan(0);
      expect(plan.targetDifficulty[g]).toBeLessThanOrEqual(1);
    }
  });
});

describe('computeTrainingPlan — empty profile', () => {
  it('produces a gentle onboarding plan instead of failing', () => {
    const plan = computeTrainingPlan([], NOW);
    expect(plan.focusDomains).toEqual([]);
    expect(plan.weeklyGoal).toContain('להיכרות');
    expect(plan.rationaleHe).toContain('אין מספיק נתונים');
    expect(plan.nextReviewAt).toBe(NOW + PLANNER_TUNING.REVIEW_DAYS * 24 * 60 * 60 * 1000);
  });
});

describe('computeTrainingPlan — narrative', () => {
  it('says "strengthen gently" when a focus domain is declining', () => {
    const plan = computeTrainingPlan([
      dom('reaction-time', 50, { trend: 'down', deteriorationFlag: true }),
    ], NOW);
    expect(plan.rationaleHe).toContain('ירידה');
    expect(plan.weeklyGoal).toContain('זמן תגובה');
  });
});
