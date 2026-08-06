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
  // ── Longitudinal health signals (player-model phase) ──────────────────────
  PLATEAU_EPSILON:        1,    // level gain ≤ this counts as "no improvement"
  DETERIORATION_DROP:     8,    // level points below bestLevel to consider decline
  MIN_CONFIDENCE_TO_FLAG: 0.6,  // never flag deterioration on a shaky profile
  TIMELINE_MAX_POINTS:    120,  // per-domain time-series cap (~2 years at 5/month)
} as const;

// ── Journey pacing ──────────────────────────────────────────────────────────
// The journey step (cognitiveProfile.level, 0..100 — the number the map draws a
// walking character on) is EARNED progress, not a snapshot of one session.
//
// It used to be seeded straight from the session score, so a single strong
// 10-minute first game landed the player on step 68 of 100 and the map had
// almost nothing left to climb. Now the measured ability (the score EMA) is the
// TARGET the step walks toward, gated by two rules:
//
//   1. a per-session step cap  — no session can move the journey more than a few
//      steps, up or down, however well (or badly) it went;
//   2. an experience ceiling   — the step can never exceed what the number of
//      sessions actually trained in that domain justifies.
//
// Ability itself (`_ema`) stays uncapped, so difficulty adaptation still meets
// the player exactly where they are — only the journey pacing is deliberate.
// With these numbers a domain needs ~20 sessions to reach step 100.
export const JOURNEY_TUNING = {
  FIRST_SESSION_CAP:    5,   // highest step a domain's very first session can reach
  CEILING_PER_SESSION:  5,   // the experience ceiling grows this much per session
  MAX_GAIN_PER_SESSION: 5,   // never climb more than this in one session
  MAX_DROP_PER_SESSION: 4,   // ...and never fall more than this either
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
// ── Live player model (behavioral fingerprint) ─────────────────────────────
// The in-session feature extractor + deterministic path director. Firestore
// gets a throttled snapshot (never one write per event) at users/{uid}/
// liveModel/{gameId}; the numbers here shape both the features and the paths.
export const LIVEMODEL_TUNING = {
  FLUSH_MIN_INTERVAL_MS: 15_000, // min gap between Firestore snapshots
  MAX_EVENTS:            300,    // per-session feature-event cap (memory bound)
  SLOW_HIT_SIGMA:        1.0,    // hit slower than mean + σ·this counts as hesitant
  MIN_RT_SAMPLES:        5,      // RT-derived features need at least this many hits
  FATIGUE_WINDOW:        8,      // rolling regression window for fatigue onset
  FATIGUE_SLOPE_MS:      12,     // ms/event slope that marks fatigue onset
  // Deterministic path thresholds (chooseTrainingPath)
  PATH_RECOVER_ACC:      0.45,   // below this accuracy → confidence-building mode
  PATH_IMPULSIVE_RATE:   0.25,   // commission-error share → train inhibition
  PATH_HESITANT_RATE:    0.30,   // hesitation share → gentle time pressure
  PATH_MASTERY_ACC:      0.85,   // above this and stable → raise the load
} as const;

// ── Training plan (planner-agent) ───────────────────────────────────────────
// Deterministic prescription rebuilt after every finalized session: which
// abilities to focus, which games train them, and where to warm-start each.
export const PLANNER_TUNING = {
  MIN_CONFIDENCE:    0.4,        // ignore domains we barely know
  FOCUS_COUNT:       2,          // abilities per plan
  GAMES_MAX:         3,          // recommended games cap
  SESSIONS_PER_WEEK: 3,          // weekly goal target
  REVIEW_DAYS:       7,          // nextReviewAt horizon
} as const;

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
