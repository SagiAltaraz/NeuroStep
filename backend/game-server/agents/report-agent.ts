/**
 * Report Agent
 *
 * Trigger : called on session end OR on a scheduled daily job
 * Input   : aggregated session data from PostgreSQL (via analytics-agent)
 * Output  : CognitiveProfile per userId, stored to PostgreSQL
 *
 * TODO:
 *   1. Define CognitiveProfile type:
 *        { userId, gameId, period: '7d'|'30d', avgAccuracy, avgReactionMs,
 *          accuracyTrend: number, reactionTrend: number, sessionsCount }
 *   2. Read session_summaries WHERE userId = ? AND createdAt > NOW() - interval
 *   3. Compute trends (simple linear regression on accuracy/reactionMs over time)
 *   4. Upsert into cognitive_profiles(userId, gameId, period, …)
 *   5. Expose via REST endpoint GET /api/users/:userId/profile
 *      (for the admin dashboard AdminStats.tsx)
 */

// import { Pool } from 'pg';
// import type { GameId } from '../types/game.types.js';
