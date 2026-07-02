-- ============================================================================
-- NeuroStep — Cognitive Player Model schema map (v1, 2026-07-02)
--
-- Runtime store is Firestore (NoSQL). This file is the PRESENTATIONAL map of
-- that data model, written as Postgres DDL so relationships and roles are
-- explicit and reviewable. Each table notes its live Firestore path.
--
-- Layers (top = static, bottom = derived):
--   1. REFERENCE   — cognitive_domains, games, game_domains (the cross-game backbone)
--   2. SESSION     — sessions, session_domain_scores, reports (what happened)
--   3. PER-ABILITY — cognitive_profile, game_stats (the shared score — the heart)
--   4. ADAPT&PLAN  — live_model, training_plan, domain_timeline, progression
--   5. SUPPORT     — coach_reports, alerts, prompt_snapshots, director_advice
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1 · REFERENCE (static config — lives as code constants, not documents)
-- ────────────────────────────────────────────────────────────────────────────

-- The 8 trained abilities.            [code: game-server/types/domains.ts PROBLEM_IDS]
CREATE TABLE cognitive_domains (
  id             TEXT PRIMARY KEY,     -- 'working-memory' … 'visual-spatial'
  name_he        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  description_he TEXT
);

-- The 8 games.                        [code: game-server/types/game.types.ts GameId]
CREATE TABLE games (
  id             TEXT PRIMARY KEY,     -- 'shapes-click', 'memory', 'tictactoe', …
  name_he        TEXT NOT NULL,
  primary_domain TEXT NOT NULL REFERENCES cognitive_domains(id)
);

-- Which abilities each game trains — THE cross-game transfer backbone.
-- A score earned in one game flows through this mapping into every other game
-- that trains the same ability.       [code: game-server/types/domains.ts GAME_DOMAINS]
CREATE TABLE game_domains (
  game_id   TEXT    NOT NULL REFERENCES games(id),
  domain_id TEXT    NOT NULL REFERENCES cognitive_domains(id),
  role      TEXT    NOT NULL CHECK (role IN ('primary', 'secondary')),
  weight    NUMERIC NOT NULL,          -- 1.0 primary, 0.5 secondary
  PRIMARY KEY (game_id, domain_id)
);


-- ────────────────────────────────────────────────────────────────────────────
-- USERS
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  display_name TEXT,
  role         TEXT NOT NULL DEFAULT 'player',   -- 'player' | 'caregiver' | 'admin'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 3 · PER-ABILITY SCORE — the heart of the system
-- ────────────────────────────────────────────────────────────────────────────

-- One row per user per ability, SHARED across every game that trains it.
-- Improvement and deterioration over months are judged HERE, never per game.
--                                     [Firestore: users/{uid}/cognitiveProfile/{domain_id}, v2]
CREATE TABLE cognitive_profile (
  user_id            TEXT    NOT NULL REFERENCES users(id),
  domain_id          TEXT    NOT NULL REFERENCES cognitive_domains(id),
  ema                NUMERIC NOT NULL,          -- smoothed internal signal (the raw EMA)
  level              INT     NOT NULL,          -- 0..100 ability score, used everywhere
  confidence         NUMERIC NOT NULL,          -- 0..1, ramps over the first 5 sessions
  sessions_count     INT     NOT NULL DEFAULT 0,
  trend              TEXT    NOT NULL,          -- 'up' | 'stable' | 'down' (recent window)
  volatility         NUMERIC NOT NULL DEFAULT 0,     -- score noise = cognitive stability
  plateau_count      INT     NOT NULL DEFAULT 0,     -- consecutive sessions w/o real gain
  deterioration_flag BOOLEAN NOT NULL DEFAULT false, -- confident + far below peak + not recovering
  best_level         INT,                             -- personal peak (never decays)
  best_at            TIMESTAMPTZ,                     -- when the peak was reached
  playstyle_tags     TEXT[],                          -- 'impulsive','hesitant','cautious',
                                                      -- 'fatigues-fast','consistent','resilient'
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  v                  INT     NOT NULL DEFAULT 2,
  PRIMARY KEY (user_id, domain_id)
);

-- Per-user per-game cache: reaction-time baseline + last converged difficulty
-- (same-game session resume).         [Firestore: users/{uid}/stats/{game_id}]
CREATE TABLE game_stats (
  user_id               TEXT NOT NULL REFERENCES users(id),
  game_id               TEXT NOT NULL REFERENCES games(id),
  avg_reaction_ms       NUMERIC,
  std_reaction_ms       NUMERIC,
  difficulty_level      NUMERIC,       -- 0..1 smoothed D, resumed next session
  difficulty_updated_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, game_id)
);


-- ────────────────────────────────────────────────────────────────────────────
-- 2 · SESSION (what happened)
-- ────────────────────────────────────────────────────────────────────────────

-- One finished play session.          [Firestore: sessions/{session_id}]
CREATE TABLE sessions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  game_id          TEXT NOT NULL REFERENCES games(id),
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  duration_ms      INT,
  accuracy         NUMERIC,            -- 0..1 (NULL when no scored events)
  avg_reaction_ms  NUMERIC,
  peak_streak      INT,
  adjustment_count INT,                -- DDA moves this session
  net_direction    TEXT,               -- 'harder' | 'easier' | 'stable'
  final_difficulty NUMERIC             -- 0..1 D at session end
);

-- The scores this session earned on each ability the game trains.
-- primary domain = full cognitiveScore, secondary = ×0.85. Feeds cognitive_profile.
--                                     [Firestore: embedded as reports.domainScores map]
CREATE TABLE session_domain_scores (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  domain_id  TEXT NOT NULL REFERENCES cognitive_domains(id),
  score      INT  NOT NULL,            -- 0..100
  PRIMARY KEY (session_id, domain_id)
);

-- Human-readable per-session report. Score is ALWAYS deterministic; the Hebrew
-- narrative is Claude-written on milestone sessions only, templated otherwise.
--                                     [Firestore: users/{uid}/reports/{session_id}]
CREATE TABLE reports (
  session_id         TEXT PRIMARY KEY REFERENCES sessions(id),
  user_id            TEXT NOT NULL REFERENCES users(id),
  cognitive_score    INT  NOT NULL,    -- 0..100, deterministic
  summary_he         TEXT,
  strengths_he       TEXT[],
  recommendations_he TEXT[],
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 4 · ADAPT & PLAN (the player-model layer)
-- ────────────────────────────────────────────────────────────────────────────

-- Live behavioral fingerprint, refreshed DURING play (throttled ≥15s, never
-- per-event). The structured "prompt data" every agent reads; LLM prompts are
-- rendered from it on demand.         [Firestore: users/{uid}/liveModel/{game_id}, v1]
CREATE TABLE live_model (
  user_id             TEXT NOT NULL REFERENCES users(id),
  game_id             TEXT NOT NULL REFERENCES games(id),
  session_id          TEXT REFERENCES sessions(id),
  d                   NUMERIC,         -- current difficulty 0..1
  events              INT,             -- scored events seen
  accuracy            NUMERIC,         -- 0..1
  accuracy_slope      NUMERIC,         -- per-event hit-rate trend
  reaction_mean       NUMERIC,         -- ms (hits only)
  reaction_std        NUMERIC,         -- ms — consistency
  reaction_slope      NUMERIC,         -- ms/event — within-session fatigue/warm-up
  impulsivity_rate    NUMERIC,         -- commission errors / scored (acted too fast)
  hesitation_rate     NUMERIC,         -- (timeouts + over-slow hits) / scored
  error_recovery      NUMERIC,         -- P(hit right after an error) — resilience
  speed_accuracy_bias NUMERIC,         -- -1 caution … +1 recklessness (vs baseline)
  fatigue_onset_idx   INT,             -- hit-index where RTs started climbing
  chosen_path         TEXT,            -- 'speed'|'distractors'|'memory-load'|'hold'|'recover'
  playstyle_tags      TEXT[],
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  v                   INT NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, game_id)
);

-- The personalised prescription, rebuilt deterministically after EVERY session:
-- deteriorating → declining → weakest (confidence-gated), the games that train
-- those abilities, and a warm-start difficulty per game from the same
-- cross-game blend the live controller uses.
--                                     [Firestore: users/{uid}/trainingPlan/current, v1]
CREATE TABLE training_plan (
  user_id           TEXT PRIMARY KEY REFERENCES users(id),
  focus_domains     TEXT[],            -- abilities to work on now
  recommended_games TEXT[],            -- primary trainers first
  target_difficulty JSONB,             -- { game_id: 0..1 } warm-start targets
  weekly_goal       TEXT,              -- Hebrew, user-facing
  rationale_he      TEXT,              -- Hebrew, caregiver-facing "why"
  next_review_at    TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  v                 INT NOT NULL DEFAULT 1
);

-- Longitudinal time series per ability — the months-long improvement/decline
-- graph. One point per touched domain per session, capped at 120 points.
--                                     [Firestore: users/{uid}/timeline/{domain_id}.points[]]
CREATE TABLE domain_timeline (
  user_id    TEXT NOT NULL REFERENCES users(id),
  domain_id  TEXT NOT NULL REFERENCES cognitive_domains(id),
  ts         TIMESTAMPTZ NOT NULL,
  level      INT NOT NULL,             -- profile level after this session
  score      INT,                      -- the raw session domain score
  confidence NUMERIC,
  PRIMARY KEY (user_id, domain_id, ts)
);

-- Gamified journey map: 8 regions × 10 nodes. Promotion eager, demotion
-- reluctant (grace + floor-below-peak).
--                                     [Firestore: users/{uid}/progression/current, v1]
CREATE TABLE progression (
  user_id       TEXT PRIMARY KEY REFERENCES users(id),
  overall_level INT  NOT NULL,         -- Σ region nodes (8..80)
  rank          TEXT NOT NULL,         -- beginner|explorer|advanced|expert|champion
  avatar_state  TEXT,                  -- idle|climb|drop|celebrate
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  v             INT NOT NULL DEFAULT 1
);
CREATE TABLE progression_regions (
  user_id    TEXT NOT NULL REFERENCES users(id),
  domain_id  TEXT NOT NULL REFERENCES cognitive_domains(id),
  node       INT  NOT NULL,            -- 1..10
  peak_node  INT  NOT NULL,
  grace_left INT,                      -- demotion grace remaining
  last_delta INT,                      -- +1 climbed | -1 dropped | 0 held
  PRIMARY KEY (user_id, domain_id)
);


-- ────────────────────────────────────────────────────────────────────────────
-- 5 · SUPPORT (reports, alerts, observability)
-- ────────────────────────────────────────────────────────────────────────────

-- Longitudinal coach report, every 5 sessions. Verdict deterministic; Claude
-- writes only the surrounding Hebrew.
--                                     [Firestore: users/{uid}/coachReports/{id}]
CREATE TABLE coach_reports (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id),
  overall_progress     TEXT,           -- improving|stable|needs_attention
  summary_he           TEXT,
  highlights_he        TEXT[],
  recommendations_he   TEXT[],
  cognitive_insight_he TEXT,
  generated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Caregiver decline alerts.           [Firestore: users/{uid}/alerts/{id}]
CREATE TABLE alerts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  session_id TEXT REFERENCES sessions(id),
  type       TEXT,
  severity   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved   BOOLEAN DEFAULT false
);

-- Director advice — advisory JSON from the milestone-gated LLM Director,
-- validated by Zod before persisting. The deterministic controller clamps
-- anything it suggests.               [Firestore: users/{uid}/directorAdvice/{session_id}, v1]
CREATE TABLE director_advice (
  session_id       TEXT PRIMARY KEY REFERENCES sessions(id),
  user_id          TEXT NOT NULL REFERENCES users(id),
  game_id          TEXT REFERENCES games(id),
  domain_assessment JSONB,             -- [{domainId, state, recommendedDelta}]
  difficulty_path   JSONB,             -- {direction, chosenPath, rationale}
  cross_game        JSONB,             -- {nextGame, reason}
  training_plan     JSONB,             -- {focusDomains[], weeklyGoal}
  user_message_he   TEXT,              -- warm Hebrew, content-safety validated
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  v                 INT NOT NULL DEFAULT 1
);

-- Prompt observability — the EXACT rendered prompt an LLM agent used, so
-- "why did it choose X?" is always answerable. Debugging, never logic.
--                                     [Firestore: users/{uid}/promptSnapshots/{session_id}]
CREATE TABLE prompt_snapshots (
  session_id      TEXT PRIMARY KEY REFERENCES sessions(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  agent           TEXT,                -- 'director' | 'report' | 'coaching' | …
  model_version   TEXT,                -- e.g. 'claude-haiku-4-5-20251001'
  rendered_prompt TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  v               INT NOT NULL DEFAULT 1
);


-- ============================================================================
-- HOW IT CONNECTS — the cross-game scoring flow
--
--   session ──▶ session_domain_scores ──▶ cognitive_profile (EMA per ability)
--                                              │
--                     ┌────────────────────────┼─────────────────────┐
--                     ▼                        ▼                     ▼
--            game_stats/live_model      training_plan          domain_timeline
--            (resume + warm-start        (what to train         (the trend
--             via game_domains)           next, per week)        graph)
--                     │                        │
--                     ▼                        ▼
--               progression              director_advice + prompt_snapshots
--               (journey map)            (milestone LLM guidance, advisory)
--
-- The ability, not the game, carries the player's level everywhere:
-- game_domains is the backbone that routes every score to the right abilities
-- and every ability level back into every game that trains it.
-- ============================================================================
