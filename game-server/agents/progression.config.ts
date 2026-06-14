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
