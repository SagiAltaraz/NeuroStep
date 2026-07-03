# NeuroStep — Cognitive Player Model & Adaptive Schema

> **Purpose.** Give every player a per‑ability cognitive score, let each game feed the
> abilities it trains, and use those shared scores to adapt difficulty **across games**
> and to build an ongoing, personalised training plan that tracks improvement and
> deterioration over weeks and months.
>
> Runtime store is **Firestore** (NoSQL). The schema below is written as **SQL DDL** for
> a clear, presentable data map; each table notes its live Firestore path. Schema
> version: **v1** (may evolve — this documents what exists / is planned now).
>
> **Implementation status:** live in `game-server` — `live_model`
> (agents/live-model.ts), enriched `cognitive_profile` + `domain_timeline`
> (agents/profile-agent.ts, v2), `training_plan` (agents/planner-agent.ts),
> Director + `prompt_snapshots` (agents/director-agent.ts, gated to milestone
> sessions), all wired through server.ts. Fields marked [new] below are now real.

---

## 1. The core idea in one paragraph

A cognitive **ability lives at the domain level, not the game level.** When a player plays
*Memory*, the session produces scores for the abilities that game trains — `working-memory`
(primary), `selective-attention` and `visual-spatial` (secondary). Those scores update a
**per‑ability profile** (`cognitive_profile`) that is **shared by every game touching the
same ability**. So a strong `working-memory` built in *Memory* automatically raises the
starting difficulty of *Where‑Was‑It* (which also trains `working-memory`). The
`game_domains` mapping is the backbone that makes this cross‑game transfer possible.

---

## 2. The 8 cognitive domains

| id | Hebrew | trains |
|---|---|---|
| `working-memory` | זיכרון עבודה | holding & manipulating info |
| `selective-attention` | קשב סלקטיבי | focus amid distractors |
| `divided-attention` | קשב מחולק | tracking parallel streams |
| `processing-speed` | מהירות עיבוד | fast visual processing |
| `reaction-time` | זמן תגובה | raw speed of response |
| `response-inhibition` | עיכוב תגובה | withholding wrong impulses |
| `strategic-thinking` | חשיבה אסטרטגית | planning ahead |
| `visual-spatial` | תפיסה חזותית‑מרחבית | spatial memory & layout |

## 3. Game → domain mapping (the cross‑game backbone)

| Game | Primary (weight 1.0) | Secondary (weight 0.5) |
|---|---|---|
| `shapes-click` | response-inhibition | selective-attention, reaction-time |
| `color-trains` | divided-attention | processing-speed, reaction-time |
| `tictactoe` | strategic-thinking | working-memory, visual-spatial |
| `memory` | working-memory | selective-attention, visual-spatial |
| `green-light` | reaction-time | response-inhibition |
| `spot-difference` | processing-speed | selective-attention, visual-spatial |
| `where-was-it` | visual-spatial | working-memory |
| `find-letter` | selective-attention | processing-speed |

---

## 4. Layered architecture

```
REFERENCE     cognitive_domains · games · game_domains        (static config)
   │
SESSION       sessions · session_domain_scores · reports      (what happened)
   │
PER‑ABILITY   cognitive_profile · game_stats                  (the shared score — the heart)
   │
ADAPT & PLAN  live_model · training_plan · domain_timeline · progression
```

- **Real‑time loop** stays in memory (fast); Firestore gets compact snapshots at round
  boundaries — never one write per event.
- **Deterministic first, LLM second.** Difficulty & path are chosen deterministically from
  features; the LLM (Director / coaching / report) only adds narrative + plan, gated for cost.

---

## 5. SQL schema (presentational DDL)

```sql
-- ============================================================
-- NeuroStep — Cognitive Player Model (v1). Postgres dialect.
-- Runtime = Firestore; each table notes its live path.
-- ============================================================

-- ---------- REFERENCE (static config) ----------

-- The 8 trained abilities.  Firestore: (code constant PROBLEM_IDS)
CREATE TABLE cognitive_domains (
  id             TEXT PRIMARY KEY,          -- 'working-memory', 'reaction-time', ...
  name_he        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  description_he TEXT
);

-- The 8 games.  Firestore: (code constant GAME_DOMAINS)
CREATE TABLE games (
  id             TEXT PRIMARY KEY,          -- 'shapes-click', 'memory', 'tictactoe', ...
  name_he        TEXT NOT NULL,
  primary_domain TEXT NOT NULL REFERENCES cognitive_domains(id)
);

-- Which abilities each game trains, and how strongly.  THE cross-game backbone.
CREATE TABLE game_domains (
  game_id   TEXT NOT NULL REFERENCES games(id),
  domain_id TEXT NOT NULL REFERENCES cognitive_domains(id),
  role      TEXT NOT NULL CHECK (role IN ('primary','secondary')),
  weight    NUMERIC NOT NULL,               -- 1.0 primary, 0.5 secondary
  PRIMARY KEY (game_id, domain_id)
);

-- ---------- USERS ----------
CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  display_name TEXT,
  role         TEXT NOT NULL DEFAULT 'player',   -- 'player' | 'caregiver'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- PER-ABILITY SCORE (the heart) ----------
-- One row per user per ability. SHARED across every game that trains it.
-- Firestore: users/{uid}/cognitiveProfile/{domain_id}
CREATE TABLE cognitive_profile (
  user_id            TEXT NOT NULL REFERENCES users(id),
  domain_id          TEXT NOT NULL REFERENCES cognitive_domains(id),
  ema                NUMERIC NOT NULL,        -- smoothed internal signal
  level              INT NOT NULL,            -- 0..100 ability score (used everywhere)
  confidence         NUMERIC NOT NULL,        -- 0..1, ramps over first 5 sessions
  sessions_count     INT NOT NULL DEFAULT 0,
  trend              TEXT NOT NULL,           -- 'up' | 'stable' | 'down'
  volatility         NUMERIC,                 -- score noise = cognitive stability   [new]
  plateau_count      INT DEFAULT 0,           -- consecutive no-improvement sessions [new]
  deterioration_flag BOOLEAN DEFAULT false,   -- sustained decline (clinical watch)  [new]
  best_level         INT,                     -- peak reached                        [new]
  best_at            TIMESTAMPTZ,             --                                      [new]
  playstyle_tags     TEXT[],                  -- 'impulsive','cautious','fatigues-fast' [new]
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  v                  INT NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, domain_id)
);

-- Per-user per-game baseline + last converged difficulty (session resume).
-- Firestore: users/{uid}/stats/{game_id}
CREATE TABLE game_stats (
  user_id             TEXT NOT NULL REFERENCES users(id),
  game_id             TEXT NOT NULL REFERENCES games(id),
  avg_reaction_ms     NUMERIC,
  std_reaction_ms     NUMERIC,
  difficulty_level    NUMERIC,               -- 0..1 smoothed D, resumed next session
  difficulty_updated_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, game_id)
);

-- ---------- SESSION (what happened) ----------
-- One finished play session.  Firestore: sessions/{session_id}
CREATE TABLE sessions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  game_id          TEXT NOT NULL REFERENCES games(id),
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  duration_ms      INT,
  accuracy         NUMERIC,                  -- 0..1
  avg_reaction_ms  NUMERIC,
  peak_streak      INT,
  adjustment_count INT,                      -- DDA moves this session
  net_direction    TEXT,                     -- 'harder' | 'easier' | 'stable'
  final_difficulty NUMERIC                   -- 0..1 D at session end
);

-- The scores this session earned on each ability the game trains.
-- Feeds cognitive_profile.  Firestore: embedded in the report's domainScores map.
CREATE TABLE session_domain_scores (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  domain_id  TEXT NOT NULL REFERENCES cognitive_domains(id),
  score      INT NOT NULL,                   -- 0..100, weighted by primary/secondary
  PRIMARY KEY (session_id, domain_id)
);

-- Human-readable per-session report (LLM narrative on milestone sessions).
-- Firestore: users/{uid}/reports/{session_id}
CREATE TABLE reports (
  session_id        TEXT PRIMARY KEY REFERENCES sessions(id),
  user_id           TEXT NOT NULL REFERENCES users(id),
  cognitive_score   INT NOT NULL,            -- 0..100 (deterministic)
  summary_he        TEXT,
  strengths_he      TEXT[],
  recommendations_he TEXT[],
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- ADAPT & PLAN ----------
-- Live behavioral fingerprint, refreshed DURING play (round boundaries).
-- Firestore: users/{uid}/liveModel/{game_id}
CREATE TABLE live_model (
  user_id            TEXT NOT NULL REFERENCES users(id),
  game_id            TEXT NOT NULL REFERENCES games(id),
  session_id         TEXT REFERENCES sessions(id),
  d                  NUMERIC,                -- current difficulty 0..1
  accuracy           NUMERIC,
  accuracy_slope     NUMERIC,
  reaction_mean      NUMERIC,
  reaction_std       NUMERIC,                -- consistency
  reaction_slope     NUMERIC,               -- within-session fatigue/warmup
  impulsivity_rate   NUMERIC,               -- errors from acting too fast
  hesitation_rate    NUMERIC,               -- timeouts / over-slow correct
  error_recovery     NUMERIC,               -- accuracy right after a mistake
  speed_accuracy_bias NUMERIC,              -- -1 caution .. +1 recklessness
  fatigue_onset_idx  INT,
  chosen_path        TEXT,                   -- 'speed'|'distractors'|'memory-load'|'hold'|'recover'
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  v                  INT NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, game_id)
);

-- The personalised prescription, rewritten after each session by planner-agent.
-- Firestore: users/{uid}/trainingPlan/current
CREATE TABLE training_plan (
  user_id           TEXT PRIMARY KEY REFERENCES users(id),
  focus_domains     TEXT[],                  -- weakest / declining abilities
  recommended_games TEXT[],                  -- games that train focus_domains
  target_difficulty JSONB,                   -- { game_id: 0..1 } warm-start targets
  weekly_goal       TEXT,
  rationale_he      TEXT,
  next_review_at    TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  v                 INT NOT NULL DEFAULT 1
);

-- Longitudinal time series per ability — draws the improvement/decline graph.
-- Firestore: users/{uid}/timeline/{domain_id}/points/{ts}  (or rollup of reports)
CREATE TABLE domain_timeline (
  user_id    TEXT NOT NULL REFERENCES users(id),
  domain_id  TEXT NOT NULL REFERENCES cognitive_domains(id),
  ts         TIMESTAMPTZ NOT NULL,
  level      INT NOT NULL,
  score      INT,
  confidence NUMERIC,
  PRIMARY KEY (user_id, domain_id, ts)
);

-- Gamified journey map (nodes climbed per ability).
-- Firestore: users/{uid}/progression/current  (regions[] embedded)
CREATE TABLE progression (
  user_id       TEXT PRIMARY KEY REFERENCES users(id),
  overall_level INT NOT NULL,
  rank          TEXT NOT NULL,               -- beginner..champion
  avatar_state  TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  v             INT NOT NULL DEFAULT 1
);
CREATE TABLE progression_regions (
  user_id    TEXT NOT NULL REFERENCES users(id),
  domain_id  TEXT NOT NULL REFERENCES cognitive_domains(id),
  node       INT NOT NULL,                   -- 1..10
  peak_node  INT NOT NULL,
  grace_left INT,
  last_delta INT,
  PRIMARY KEY (user_id, domain_id)
);

-- ---------- SUPPORT ----------
-- Longitudinal coach report (every 5 sessions).  Firestore: users/{uid}/coachReports/{id}
CREATE TABLE coach_reports (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id),
  overall_progress   TEXT,                   -- improving|stable|needs_attention
  summary_he         TEXT,
  highlights_he      TEXT[],
  recommendations_he TEXT[],
  cognitive_insight_he TEXT,
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Caregiver alerts.  Firestore: users/{uid}/alerts/{id}
CREATE TABLE alerts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  session_id TEXT REFERENCES sessions(id),
  type       TEXT,
  severity   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved   BOOLEAN DEFAULT false
);

-- Prompt observability — the RENDERED prompt an agent used, for debugging "why".
-- Firestore: users/{uid}/promptSnapshots/{session_id}
CREATE TABLE prompt_snapshots (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  session_id      TEXT REFERENCES sessions(id),
  agent           TEXT,                      -- 'director'|'coaching'|'report'
  model_version   TEXT,
  rendered_prompt TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 6. Role of each table (תפקיד)

| Table | תפקיד |
|---|---|
| `cognitive_domains` | 8 היכולות — טבלת רפרנס סטטית |
| `games` / `game_domains` | המשחקים והמיפוי שלהם ליכולות — **מאפשר העברת ציון בין משחקים** |
| `cognitive_profile` | **הלב** — ציון פר‑יכולת, משותף בין כל המשחקים. שיפור/הידרדרות נמדדים כאן |
| `game_stats` | baseline אישי + הקושי שהמשחק התכנס אליו (resume) |
| `sessions` | תקציר סשן שהסתיים |
| `session_domain_scores` | הציונים שהסשן ייצר על היכולות שהמשחק אימן → מזין את `cognitive_profile` |
| `reports` | דוח קריא פר‑סשן (נרטיב LLM ב‑milestones) |
| `live_model` | **טביעת אצבע התנהגותית חיה** — מתעדכן תוך כדי משחק, מזין את בחירת המסלול |
| `training_plan` | המרשם האישי — במה להתמקד, איזה משחקים, יעד שבועי |
| `domain_timeline` | סדרת‑זמן פר‑יכולת → גרף השיפור לאורך חודשים |
| `progression` / `progression_regions` | מפת המסע הגיימיפיקטיבית (nodes) |
| `coach_reports` | דוח אורך כל 5 סשנים |
| `alerts` | התראות למטפל |
| `prompt_snapshots` | הפרומפט המרונדר בפועל — observability, לא לוגיקה |

---

## 7. The cross‑game scoring flow (the core mechanic)

```
1. Player finishes Memory.
2. session_domain_scores:  working-memory=78, selective-attention=71, visual-spatial=69
3. cognitive_profile (per ability, EMA):  working-memory.level 62 → 66  (confidence 0.8)
4. Player opens Where-Was-It (also trains working-memory).
5. seedLevelFromProfile reads cognitive_profile via game_domains
   → warm-starts Where-Was-It ABOVE cold start, weighted by confidence.
6. Result: the ability, not the game, carries the player's level everywhere.
```

Over weeks: `domain_timeline` + `trend` / `plateau_count` / `deterioration_flag` reveal
whether each ability is **improving, plateaued, or declining**, and `training_plan` steers
the next sessions toward what needs work.

---

## 8. Real‑time data flow

```
DURING PLAY (per event, in memory):
  event → features (impulsivity, hesitation, recovery, fatigue…)
        → deterministic DDA picks D + chosen_path   (reads features directly)
        → every round / ~15s: async snapshot → live_model   (never blocks)

END OF SESSION:
  analytics → session_domain_scores → cognitive_profile (enriched)
            → progression → planner-agent → training_plan → domain_timeline
  LLM (gated): prompt-builder(model) → Director/coaching/report → reports
```

**Guardrails.** No Firestore write per event. DDA deterministic; LLM advisory only and
clamped by max‑step / dead‑zone / reluctant‑demotion. `v` on every mutable doc. Zod
validates every LLM output before any write (fail closed).

---

## 9. The Director agent prompt (English)

See the system prompt in `docs/prompts/director.md` (or the chat where it was authored).
It receives the player model (`live_model` + `cognitive_profile` + `game_domains` context)
and returns a strict JSON of domain assessment, difficulty path, cross‑game recommendation,
training plan, and a short Hebrew user message — all advisory, clamped by the deterministic
controller.
