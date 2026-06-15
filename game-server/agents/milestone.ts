/**
 * Milestone detection — decides whether a finished session is "special" enough
 * to spend a Claude narrative on (report-agent), instead of the templated text.
 *
 * A session is a milestone when ANY of these hold:
 *   • first ever session for the game's primary domain  (isNew)
 *   • the player's session count for that domain hits a MILESTONE_INTERVAL mark
 *   • a node level changed this session (promotion/demotion on the journey map)
 *   • a decline alert fired (caregivers should get a richer write-up)
 *
 * Pure + unit-tested. The interval lives in MILESTONE_TUNING so the LLM cadence
 * is tunable in one place without redeploying logic (C1/C2).
 */

import type { GameId } from '../types/game.types.js';
import { GAME_DOMAINS } from '../types/domains.js';
import type { ProfileUpdateResult } from './profile-agent.js';
import type { LevelChange }         from './progression.js';
import { MILESTONE_TUNING }         from './progression.config.js';

export interface MilestoneInput {
  gameId:         GameId;
  profileUpdates: ProfileUpdateResult[];
  levelChanges:   LevelChange[];
  alertTriggered: boolean;
}

export function isMilestone(input: MilestoneInput): boolean {
  const { gameId, profileUpdates, levelChanges, alertTriggered } = input;
  const primary    = GAME_DOMAINS[gameId].primary;
  const primaryRes = profileUpdates.find(p => p.domainId === primary);

  const firstEver     = primaryRes?.isNew ?? false;
  const everyN        = primaryRes != null
    && primaryRes.sessionsCount > 0
    && primaryRes.sessionsCount % MILESTONE_TUNING.INTERVAL === 0;
  const levelChanged  = levelChanges.some(c => c.delta !== 0);

  return firstEver || everyN || levelChanged || alertTriggered;
}
