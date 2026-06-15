import { describe, it, expect } from 'vitest';
import { GAME_DOMAINS, PROBLEM_IDS } from '../../types/domains.js';
import { computeDomainScores } from '../report-agent.js';
import type { GameId } from '../../types/game.types.js';

const ALL_GAMES: GameId[] = [
  'shapes-click', 'color-trains', 'tictactoe', 'memory',
  'green-light', 'spot-difference', 'where-was-it', 'find-letter',
];

describe('GAME_DOMAINS', () => {
  it('has an entry for every game', () => {
    for (const g of ALL_GAMES) {
      expect(GAME_DOMAINS[g], `missing mapping for ${g}`).toBeDefined();
    }
  });

  it('every game has a valid primary domain', () => {
    for (const g of ALL_GAMES) {
      expect(PROBLEM_IDS).toContain(GAME_DOMAINS[g].primary);
    }
  });

  it('all secondary domains are valid and distinct from primary', () => {
    for (const g of ALL_GAMES) {
      const { primary, secondary } = GAME_DOMAINS[g];
      for (const s of secondary) {
        expect(PROBLEM_IDS).toContain(s);
        expect(s).not.toBe(primary);
      }
    }
  });

  it('every cognitive domain is the primary of at least one game (full coverage)', () => {
    const primaries = new Set(ALL_GAMES.map(g => GAME_DOMAINS[g].primary));
    for (const d of PROBLEM_IDS) {
      expect(primaries.has(d), `no game trains ${d} as primary`).toBe(true);
    }
  });
});

describe('computeDomainScores', () => {
  it('gives the primary domain the full cognitiveScore', () => {
    const scores = computeDomainScores(80, 'memory');
    expect(scores['working-memory']).toBe(80);
  });

  it('damps secondary domains by 0.85 (rounded)', () => {
    const scores = computeDomainScores(80, 'memory');
    // secondary of memory: selective-attention, visual-spatial → round(80*0.85)=68
    expect(scores['selective-attention']).toBe(68);
    expect(scores['visual-spatial']).toBe(68);
  });

  it('returns exactly the game\'s mapped domains', () => {
    const scores = computeDomainScores(50, 'green-light');
    // green-light: primary reaction-time, secondary response-inhibition
    expect(Object.keys(scores).sort()).toEqual(['reaction-time', 'response-inhibition'].sort());
  });

  it('handles a zero score', () => {
    const scores = computeDomainScores(0, 'tictactoe');
    expect(scores['strategic-thinking']).toBe(0);
    expect(scores['working-memory']).toBe(0);
  });
});
