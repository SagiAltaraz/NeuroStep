import { describe, it, expect } from 'vitest';
import { computeLiveFeatures, chooseTrainingPath, playstyleTags } from '../live-model.js';
import type { FeatureEvent, LiveFeatures } from '../live-model.js';

const hit  = (rt: number | null = 800): FeatureEvent => ({ kind: 'hit', rt });
const miss = (): FeatureEvent => ({ kind: 'miss', rt: null });
const tout = (): FeatureEvent => ({ kind: 'timeout', rt: null });

// A neutral feature object for path/tag tests — override what matters.
function features(over: Partial<LiveFeatures>): LiveFeatures {
  return {
    events: 20, accuracy: 0.7, accuracySlope: 0,
    reactionMean: 800, reactionStd: 120, reactionSlope: 0,
    impulsivityRate: 0.1, hesitationRate: 0.1, errorRecovery: 0.6,
    speedAccuracyBias: 0, fatigueOnsetIdx: null,
    ...over,
  };
}

describe('computeLiveFeatures — honesty with little signal', () => {
  it('returns all-null on an empty stream', () => {
    const f = computeLiveFeatures([]);
    expect(f.events).toBe(0);
    expect(f.accuracy).toBeNull();
    expect(f.impulsivityRate).toBeNull();
    expect(f.errorRecovery).toBeNull();
  });

  it('withholds rate features under 5 events, slopes under their windows', () => {
    const f = computeLiveFeatures([hit(), miss(), hit()]);
    expect(f.accuracy).not.toBeNull();          // simple ratio is always fair
    expect(f.impulsivityRate).toBeNull();       // rates need n ≥ 5
    expect(f.accuracySlope).toBeNull();         // regression needs n ≥ 8
    expect(f.reactionMean).toBeNull();          // RT stats need ≥ 5 samples
  });
});

describe('computeLiveFeatures — the fingerprint', () => {
  it('separates impulsivity (commission) from hesitation (omission)', () => {
    // 6 hits, 3 misses (acted wrongly), 1 timeout (did not act)
    const events = [...Array(6).fill(0).map(() => hit()), miss(), miss(), miss(), tout()];
    const f = computeLiveFeatures(events);
    expect(f.accuracy).toBeCloseTo(0.6);
    expect(f.impulsivityRate).toBeCloseTo(0.3);   // misses only
    expect(f.hesitationRate).toBeCloseTo(0.1);    // timeout only (RTs are uniform)
  });

  it('counts over-slow hits as hesitation once RT stats exist', () => {
    // 9 tight hits at ~600ms + one hit at 2000ms (way past mean + σ)
    const events = [...Array(9).fill(0).map((_, i) => hit(590 + i * 3)), hit(2000)];
    const f = computeLiveFeatures(events);
    expect(f.hesitationRate).toBeGreaterThan(0);  // the slow hit registered
    expect(f.impulsivityRate).toBe(0);            // no misses at all
  });

  it('errorRecovery = share of errors followed immediately by a hit', () => {
    // errors at idx 1 (recovered), 3 (recovered), 5 (not — next is miss@6)
    const events = [hit(), miss(), hit(), tout(), hit(), miss(), miss(), hit()];
    const f = computeLiveFeatures(events);
    // errors with a next event: idx1→hit ✓, idx3→hit ✓, idx5→miss ✗, idx6→hit ✓
    expect(f.errorRecovery).toBeCloseTo(3 / 4);
  });

  it('finds fatigue onset when reaction times climb late in the session', () => {
    // 10 flat RTs then 10 steeply climbing → onset somewhere in the climb
    const rts = [...Array(10).fill(700), ...Array(10).fill(0).map((_, i) => 750 + i * 60)];
    const f = computeLiveFeatures(rts.map(rt => hit(rt)));
    expect(f.fatigueOnsetIdx).not.toBeNull();
    expect(f.fatigueOnsetIdx!).toBeGreaterThanOrEqual(9);
  });

  it('speedAccuracyBias needs a baseline and flags fast-but-sloppy as positive', () => {
    const sloppy = [...Array(10).fill(0).map(() => hit(400)), ...Array(6).fill(0).map(() => miss())];
    const noBaseline = computeLiveFeatures(sloppy);
    expect(noBaseline.speedAccuracyBias).toBeNull();
    // Much faster than a personal baseline of 900±200 while accuracy is poor.
    const withBaseline = computeLiveFeatures(sloppy, 900, 200);
    expect(withBaseline.speedAccuracyBias).toBeGreaterThan(0);
  });
});

describe('chooseTrainingPath — deterministic director priorities', () => {
  it('recover trumps everything when accuracy collapses', () => {
    expect(chooseTrainingPath(features({ accuracy: 0.3, impulsivityRate: 0.5 }))).toBe('recover');
  });
  it('impulsive players get distractors, not speed', () => {
    expect(chooseTrainingPath(features({ impulsivityRate: 0.3 }))).toBe('distractors');
  });
  it('hesitant players get gentle time pressure', () => {
    expect(chooseTrainingPath(features({ hesitationRate: 0.4 }))).toBe('speed');
  });
  it('mastery raises the load', () => {
    expect(chooseTrainingPath(features({ accuracy: 0.9, accuracySlope: 0.01 }))).toBe('memory-load');
  });
  it('holds in the flow zone and on missing signal', () => {
    expect(chooseTrainingPath(features({}))).toBe('hold');
    expect(chooseTrainingPath(features({
      accuracy: null, impulsivityRate: null, hesitationRate: null,
    }))).toBe('hold');
  });
});

describe('playstyleTags', () => {
  it('derives tags from the fingerprint', () => {
    const tags = playstyleTags(features({
      impulsivityRate: 0.3, fatigueOnsetIdx: 10, errorRecovery: 0.8,
      reactionMean: 800, reactionStd: 100,
    }));
    expect(tags).toContain('impulsive');
    expect(tags).toContain('fatigues-fast');
    expect(tags).toContain('resilient');
    expect(tags).toContain('consistent');   // std 100 < 0.25 × 800
  });
  it('is empty when nothing stands out', () => {
    expect(playstyleTags(features({
      impulsivityRate: 0.05, hesitationRate: 0.05, errorRecovery: 0.5,
      reactionStd: 300, speedAccuracyBias: 0,
    }))).toEqual([]);
  });
});
