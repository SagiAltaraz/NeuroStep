/**
 * Analytics Agent
 *
 * Trigger : Kafka consumer on topic 'game-events'
 * Input   : stream of GameEvents
 * Output  : writes session summaries to PostgreSQL
 *
 * TODO:
 *   1. Set up KafkaJS consumer (fromBeginning: false for live, true for backfill)
 *   2. Connect PostgreSQL client (pg or drizzle-orm)
 *   3. Aggregate per-session:
 *        - total events, accuracy (correct/total), avg reactionMs
 *        - streak high-water mark
 *   4. Upsert into table: session_summaries(sessionId, userId, gameId, …)
 *   5. On session_end event: finalize the summary row
 */

// import { Kafka } from 'kafkajs';
// import { Pool } from 'pg';
// import type { GameEvent } from '../types/game.types.js';
// import { TOPICS } from '../kafka/topics.js';
