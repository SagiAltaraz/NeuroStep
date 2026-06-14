/**
 * Tunable constants for the cognitive-profile + progression system.
 *
 * Centralised so the numbers that shape a player's experience live in one place
 * and are easy to adjust without hunting through agent logic. PROFILE_TUNING is
 * consumed by profile-agent; PROGRESSION_TUNING (added in A4) by progression.
 */

export const PROFILE_TUNING = {
  ALPHA_PRIMARY:      0.25,   // EMA weight for the game's primary domain
  ALPHA_SECONDARY:    0.125,  // EMA weight for secondary domains (weaker signal)
  WARMUP_SESSIONS:    5,      // sessions until confidence reaches 1.0
  WARMUP_ALPHA_BOOST: 1.6,    // multiply alpha while confidence < 1 (faster early learning)
  ALPHA_MAX:          0.5,    // cap on the boosted alpha
  TREND_THRESHOLD:    3,      // level delta over the recent window to call up/down
  TREND_WINDOW:       5,      // number of recent domain scores kept for trend
} as const;

export const PROGRESSION_TUNING = {
  NODES_PER_REGION:         10,   // level 0..100 maps to node 1..10 (10 per region)
  PROMOTE_BUFFER:           0,    // promote as soon as level crosses a node boundary
  DEMOTE_BUFFER:            5,    // only demote when level falls 5 below the node floor
  DEMOTE_GRACE:             2,    // consecutive sub-threshold sessions required to demote
  MIN_CONFIDENCE_TO_DEMOTE: 0.6,  // never demote on a profile we aren't confident about
  FLOOR_BELOW_PEAK:         1,    // never drop more than 1 node below the peak reached
} as const;
