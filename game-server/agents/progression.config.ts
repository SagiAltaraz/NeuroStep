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

// ── LLM cadence (B1/B2) ─────────────────────────────────────────────────────
// Centralises *how often* we spend Claude tokens, so cost is tunable without
// touching agent logic (C2). report-agent asks Claude for a narrative only on
// "milestone" sessions; coaching-agent calls Claude at most once per session.

export const MILESTONE_TUNING = {
  INTERVAL: 5,   // every Nth session of a domain is a milestone (richer narrative)
} as const;

export const COACHING_TUNING = {
  // At most ONE live coaching Claude call per session; everything else is the
  // Hebrew fallback bank. The single call is spent on the first "meaningful"
  // adjustment (see isMeaningfulMoment in coaching-agent).
  MAX_LLM_PER_SESSION:  1,
  MEANINGFUL_MIN_EVENTS: 8,   // don't spend the call on the very first wobble
} as const;

// ── Cross-game transfer (A1) ────────────────────────────────────────────────
// When a player opens a game they have NOT played before, we warm-start its
// difficulty from the cognitive-profile levels of the domains it trains, instead
// of the cold-start default. The user's ability lives at the DOMAIN level, so a
// strong working-memory profile should make a new memory game start non-trivial.
export const CROSSGAME_TUNING = {
  WARMUP_FACTOR:  0.85,  // damp the transferred level a touch (game-specific skill ≠ ability)
  MIN_CONFIDENCE: 0.4,   // ignore domains we are not yet confident about
  W_PRIMARY:      1.0,   // weight of the new game's primary domain
  W_SECONDARY:    0.5,   // weight of each secondary domain
  // Every session — including a returning player's same-game resume — starts a
  // touch BELOW their stored level and lets the controller ramp back up to it.
  // This warms the player in for a smooth flow instead of snapping straight to
  // full difficulty (which felt like a jarring jump after the first session).
  RESUME_FACTOR:  0.9,
} as const;
