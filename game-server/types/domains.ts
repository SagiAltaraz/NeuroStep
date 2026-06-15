/**
 * Cognitive domains — shared backend definitions for the cognitive profile.
 *
 * These 8 domains mirror the frontend `ProblemId` list in
 * frontend/src/data/cognitiveProblems.ts. We deliberately duplicate the list
 * (and the game→domain mapping) here rather than import across packages —
 * game-server and frontend are separate builds. Keep the two in sync; if they
 * drift, the journey map and the profile math disagree.
 *
 * IMPORTANT: the keys of GAME_DOMAINS are the backend kebab-case `GameId`s
 * (e.g. 'color-trains'), NOT the frontend camelCase GAME_TRAINING keys
 * (e.g. 'colorTracking'). Do not copy keys between the two maps blindly.
 */

import type { GameId } from './game.types.js';

export const PROBLEM_IDS = [
  'working-memory',
  'selective-attention',
  'divided-attention',
  'processing-speed',
  'reaction-time',
  'response-inhibition',
  'strategic-thinking',
  'visual-spatial',
] as const;

export type ProblemId = (typeof PROBLEM_IDS)[number];

export interface GameDomains {
  primary:   ProblemId;
  secondary: ProblemId[];
}

// Which cognitive domains each game trains. Primary = the main faculty the game
// exercises (gets full weight in the profile EMA); secondary = supporting
// faculties (half weight). Sourced from the same intent as the frontend
// GAME_TRAINING table.
export const GAME_DOMAINS: Record<GameId, GameDomains> = {
  'shapes-click':    { primary: 'response-inhibition', secondary: ['selective-attention', 'reaction-time'] },
  'color-trains':    { primary: 'divided-attention',   secondary: ['processing-speed', 'reaction-time'] },
  'tictactoe':       { primary: 'strategic-thinking',  secondary: ['working-memory', 'visual-spatial'] },
  'memory':          { primary: 'working-memory',      secondary: ['selective-attention', 'visual-spatial'] },
  'green-light':     { primary: 'reaction-time',       secondary: ['response-inhibition'] },
  'spot-difference': { primary: 'processing-speed',    secondary: ['selective-attention', 'visual-spatial'] },
  'where-was-it':    { primary: 'visual-spatial',      secondary: ['working-memory'] },
  'find-letter':     { primary: 'selective-attention', secondary: ['processing-speed'] },
};
