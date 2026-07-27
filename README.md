# 🧠 NeuroStep

**Adaptive cognitive-training platform for older adults.**
Players train eight cognitive domains through short games; the difficulty adapts
in real time to keep them in the "flow zone", and a pipeline of agents turns each
session into a longitudinal picture of cognitive health for the player, their
family, and clinicians.

```
        plays a game            adapts in real time            builds a profile
  ┌──────────────────┐   WS    ┌────────────────────┐         ┌────────────────────┐
  │   React  +  Phaser│ ◀────▶ │   Game Server (TS)  │ ──────▶ │  Firestore + agents │
  │   (the games)     │ events │  adaptive DDA loop  │  async  │  cognitive profile  │
  └──────────────────┘ adjust  └────────────────────┘         └────────────────────┘
```

---

## Table of contents

- [What it does](#what-it-does)
- [System architecture](#system-architecture)
- [The real-time adaptive loop](#the-real-time-adaptive-loop)
- [The agent system](#the-agent-system)
- [LLM strategy — deterministic first, Claude for narrative](#llm-strategy--deterministic-first-claude-for-narrative)
- [Cross-game transfer (warm-up)](#cross-game-transfer-warm-up)
- [The player model — behavioral fingerprint, plan & Director](#the-player-model--behavioral-fingerprint-plan--director)
- [Data model (Firestore, domain-centric)](#data-model-firestore-domain-centric)
- [WebSocket protocol](#websocket-protocol)
- [HTTP API](#http-api)
- [Repository layout](#repository-layout)
- [Running locally](#running-locally)
- [Testing](#testing)
- [Environment variables](#environment-variables)
- [Deployment](#deployment)

---

## What it does

- **Eight games**, each mapped to one *primary* + 1–2 *secondary* cognitive
  domains: `shapes-click`, `color-trains`, `green-light`, `spot-difference`,
  `find-letter`, `where-was-it`, `memory`, `tictactoe`.
- **Real-time adaptive difficulty** — a per-session controller keeps the player
  succeeding ~72% of the time, nudging the game harder/easier without ping-pong.
- **A cognitive profile per domain** (not per game) — ability is shared across
  every game that trains the same faculty.
- **A live player model** — a behavioral fingerprint (impulsivity, hesitation,
  error recovery, fatigue onset) computed *during* play, feeding a deterministic
  training-path director and a personalised weekly training plan.
- **Improvement & deterioration tracking** — per-ability volatility, plateau
  detection, a conservative deterioration flag, and a longitudinal timeline that
  draws the months-long trend graph.
- **A gamified journey map** — eight "regions", each with 10 nodes the player
  climbs; promotions are eager, demotions are deliberately reluctant.
- **Caregiver-facing reports** — a per-session report, a longitudinal coach
  report every five sessions, and decline alerts.
- **One LLM provider (Claude).** All numbers are computed deterministically;
  Claude is used only for Hebrew narrative, and only when it adds value.

---

## System architecture

Three independently-deployable runtimes plus Kafka and Firebase:

```mermaid
flowchart LR
  subgraph Client
    FE["React + Vite + Phaser<br/>(games, journey map, admin)"]
  end

  subgraph Backend["REST Backend (Bun + Express)"]
    API["api/auth · api/me<br/>api/admin · api/askAI"]
  end

  subgraph GS["Game Server (TypeScript)"]
    WS["WebSocket loop"]
    AG["Agents"]
  end

  KAFKA[("Kafka<br/>game-events · adjustments")]
  FS[("Firebase<br/>Auth + Firestore")]
  CLAUDE["Claude (Anthropic)"]

  FE -- "REST + Bearer JWT" --> API
  FE -- "live game events (WS)" --> WS
  WS -- "difficulty adjustments / coaching" --> FE
  WS -- "raw events (audit)" --> KAFKA
  KAFKA -- "consume" --> AG
  WS --> AG
  AG -- "read/write" --> FS
  API -- "read/write" --> FS
  AG -- "Hebrew narrative" --> CLAUDE
  API -- "chat widget" --> CLAUDE
```

| Runtime | Stack | Responsibility |
|---|---|---|
| **Frontend** | React, Vite, TypeScript, Phaser | Games, journey map, results screens, admin dashboard |
| **REST backend** | Bun, Express | Auth (JWT), `/api/me` player data, `/api/admin`, chat widget |
| **Game server** | Node/TS, `ws`, KafkaJS | Real-time adaptive loop + the full agent pipeline |
| **Kafka** | KafkaJS | Durable audit log of events + adjustments (analytics, crash recovery) |
| **Firebase** | firebase-admin | Auth token verification + Firestore persistence |

> The real-time adaptive loop runs **entirely in-process**. Kafka is used only
> for audit/analytics, so a Kafka outage never stops difficulty adaptation.

---

## The real-time adaptive loop

Every game action is one WebSocket message. For each one the game server:

```
 event ─▶ Kafka (audit) ─┐
         │               └─▶ analytics-agent ─▶ session buffer ─▶ Firestore
         ▼
   adaptive-agent  (pure maths, < 5 ms)
         │  performance score P ∈ [0,1]   →   difficulty D ∈ [0,1]
         ├─▶ "adjustment" + "telemetry"  ─────────────▶  game (applied next round)
         └─▶ coaching message (gated Claude OR fallback) ─▶ encouragement toast
```

- The controller models difficulty as a single normalised level `D ∈ [0,1]` and
  interpolates per-game parameters between an EASY and a HARD anchor.
- It keeps performance inside a target band (a dead-zone prevents oscillation)
  and nudges `D` proportionally with a clamped step.
- A **smoothed** `D` is persisted so the next session of the same game resumes
  where the player left off — a brief end-of-session dip never regresses it.

---

## The agent system

Thirteen focused agents live in [`game-server/agents/`](game-server/agents/).
They split cleanly into **real-time** (hot path) and **post-session** (async).

| Agent | When | Claude? | What it produces |
|---|---|---|---|
| [`adaptive-agent`](game-server/agents/adaptive-agent.ts) | every event | ❌ | live difficulty `D`, params, telemetry, cross-game warm-up seed |
| [`live-model`](game-server/agents/live-model.ts) | every evaluation (throttled) | ❌ | behavioral fingerprint + chosen training path → `liveModel/*` |
| [`analytics-agent`](game-server/agents/analytics-agent.ts) | Kafka stream | ❌ | session summaries → `sessions/*`, `users/*/stats/*` |
| [`coaching-agent`](game-server/agents/coaching-agent.ts) | on adjustment | ⚠️ gated | one-line Hebrew encouragement toast |
| [`report-agent`](game-server/agents/report-agent.ts) | session end | ⚠️ milestone | deterministic `cognitiveScore` + Hebrew narrative |
| [`profile-agent`](game-server/agents/profile-agent.ts) | session end | ❌ | per-domain EMA, confidence, trend, volatility, plateau, deterioration flag → `cognitiveProfile/*` + `timeline/*` |
| [`progression`](game-server/agents/progression.ts) | session end | ❌ | journey-map regions/nodes, rank → `progression/current` |
| [`planner-agent`](game-server/agents/planner-agent.ts) | session end | ❌ | personalised training plan (focus domains, games, warm-starts) → `trainingPlan/current` |
| [`director-agent`](game-server/agents/director-agent.ts) | milestone sessions | ⚠️ advisory | validated training guidance → `directorAdvice/*` + `promptSnapshots/*` |
| [`alert-agent`](game-server/agents/alert-agent.ts) | session end | ❌ | decline detection → `alerts/*`, admin badge |
| [`baseline-agent`](game-server/agents/baseline-agent.ts) | session end | ❌ | Welford reaction-time baseline → `stats/*` |
| [`coach-agent`](game-server/agents/coach-agent.ts) | every 5 sessions | ⚠️ narrative | longitudinal coach report → `coachReports/*` |
| [`token-watcher`](game-server/agents/token-watcher.ts) | every 15 min | ❌ | daily Claude-token cap alerts |

### Post-session pipeline

When a session ends ([`server.ts`](game-server/server.ts) `finalizeSession`), the
agents run in a deliberate order so the score that drives gamification is ready
*before* we decide whether the session deserves a richer narrative:

```mermaid
flowchart TD
  A["session ends"] --> B["deterministic cognitiveScore<br/>+ per-domain scores"]
  B --> C["profile-agent<br/>(domain EMA + confidence)"]
  C --> D["progression<br/>(node promote/demote)"]
  D --> E["alert-agent<br/>(decline?)"]
  E --> F{"milestone?<br/>first / every 5th /<br/>node change / alert"}
  F -- yes --> G["report-agent → Claude<br/>(Hebrew milestone narrative)"]
  F -- no --> H["report-agent → template<br/>(zero tokens)"]
  G --> I["persist report + push to client"]
  H --> I
  I --> J["persist difficulty · baseline → coach (every 5)"]
```

---

## LLM strategy — deterministic first, Claude for narrative

The product is single-provider: **Claude (Anthropic) Haiku** everywhere
(`claude-haiku-4-5`), including the website chat widget. The guiding rule is
**everything quantitative is maths; Claude only writes Hebrew prose, and only
when it earns the tokens.**

- **Scores are deterministic.** `cognitiveScore` =
  `accuracy + peak-streak + speed-vs-baseline − fatigue`, computed in
  [`report-agent.ts`](game-server/agents/report-agent.ts). Claude is never asked
  for a number, so the profile EMA and journey-map nodes are stable and
  reproducible.
- **Report narrative is milestone-gated.** Most sessions render a warm templated
  Hebrew narrative (tier × primary domain, several variants) at **zero token
  cost**. Claude writes the narrative only on milestones — first session, every
  5th, a node change, or a decline alert.
- **Coaching is gated to one Claude call per session.** The first *meaningful*
  adjustment gets a personalised toast; every other adjustment is served instantly
  from a 30+-message Hebrew [fallback bank](game-server/agents/coaching-fallbacks.ts).
- **Coach verdict is deterministic.** `overallProgress`
  (`improving`/`stable`/`needs_attention`) comes from the score trend; Claude only
  writes the surrounding text, with a template fallback if it's unavailable.
- **Director advice is advisory and milestone-gated.** The Director reads the
  structured player model (never prose), returns strict JSON validated by Zod
  (including the same Hebrew content-safety rules as the coaching toast), and
  the deterministic controller clamps anything it suggests.
- **Everything fails closed.** No API key, a timeout, malformed JSON, or a schema
  miss all fall back to deterministic output — the pipeline never stalls.
- **Tokens are tracked per agent.** Usage is written to `meta/tokenUsage` with a
  `byAgent.{report|coach|coaching|chat|director}` split, surfaced at
  `GET /api/admin/token-usage`, and watched against a daily cap by `token-watcher`.

Cadence and gating live in one place — [`progression.config.ts`](game-server/agents/progression.config.ts)
(`MILESTONE_TUNING`, `COACHING_TUNING`) — so cost is tunable without touching agent logic.

---

## Cross-game transfer (warm-up)

Ability lives at the **domain** level, so a player who is strong at working
memory shouldn't have to re-prove it on every new memory game.

When a player opens a game for the **first time**, the server warm-starts its
difficulty from the cognitive-profile levels of the domains that game trains
(`seedLevelFromProfile` → `applyWarmupSeed` in
[`adaptive-agent.ts`](game-server/agents/adaptive-agent.ts)):

```
seed = Σ(domain.level · weight · confidence) / Σ(weight · confidence)   // confident domains only
D_start = clamp01(WARMUP_FACTOR · seed / 100)
```

Priority at session start: **resume same-game difficulty → cross-game warm-up →
cold start (D = 0.40)**. Only the *starting* difficulty is transferred; reaction-
time baselines stay per-game. Tunables: `CROSSGAME_TUNING` in
[`progression.config.ts`](game-server/agents/progression.config.ts).

---

## The player model — behavioral fingerprint, plan & Director

Beyond *how well* the player scores, the system models *how they play* — and
prescribes what to train next. Full design + SQL schema map:
[`docs/cognitive-player-model.md`](docs/cognitive-player-model.md).

**During play** ([`live-model.ts`](game-server/agents/live-model.ts)) — every
scored event feeds an in-memory stream; a throttled snapshot (≥ 15 s apart,
never per-event) lands in `users/{uid}/liveModel/{gameId}`:

| Feature | Meaning |
|---|---|
| `impulsivityRate` | commission errors — acted too fast / wrongly |
| `hesitationRate` | omissions + hits far slower than the session's own pace |
| `errorRecovery` | P(hit immediately after an error) — resilience |
| `speedAccuracyBias` | −1 caution … +1 recklessness (vs personal baseline) |
| `fatigueOnsetIdx` | where in the session reaction times started climbing |
| `chosenPath` | deterministic director verdict: `speed` · `distractors` · `memory-load` · `hold` · `recover` |

The path director trains the *cause*, not the symptom — an impulsive player gets
distractors (inhibition work), not more speed; a collapsing player gets
`recover` before anything else. Playstyle tags (`impulsive`, `hesitant`,
`cautious`, `fatigues-fast`, `consistent`, `resilient`) are derived, never asked
from an LLM.

**After each session:**

- [`profile-agent`](game-server/agents/profile-agent.ts) (v2) adds longitudinal
  health signals per domain — `volatility`, `plateauCount`, `bestLevel`, and a
  conservative `deteriorationFlag` (confident profile + meaningfully below peak
  + no recovery in sight) — and appends a point to `timeline/{domainId}`, the
  series behind the months-long improvement/decline graph.
- [`planner-agent`](game-server/agents/planner-agent.ts) rebuilds
  `trainingPlan/current`: focus domains ranked **deteriorating → declining →
  weakest** (confidence-gated), the games that train them, and a warm-start
  difficulty per game from the same cross-game blend the live controller uses.
- [`director-agent`](game-server/agents/director-agent.ts) — milestone sessions
  only — renders the structured model into a prompt **on demand**, gets advisory
  JSON back (Zod-validated, fails closed), and stores the exact rendered prompt
  in `promptSnapshots/*` for observability. Advisory only: the deterministic
  controller clamps every move.

---

## Data model (Firestore, domain-centric)

Firestore is the **only** database. The cognitive profile is the source of truth
about ability; per-game `stats` is a thin cache (reaction-time baseline + resume).

```
users/{userId}
 ├─ cognitiveProfile/{domainId}   ← source of truth: level 0–100, ema, confidence,
 │                                   trend, volatility, plateauCount, bestLevel,
 │                                   deteriorationFlag, playstyleTags, sourceGames{}, v
 ├─ timeline/{domainId}           ← per-ability time series (capped points[]) —
 │                                   the improvement/decline graph
 ├─ liveModel/{gameId}            ← live behavioral fingerprint + chosenPath
 │                                   (refreshed during play, throttled)
 ├─ trainingPlan/current          ← focus domains, recommended games,
 │                                   per-game warm-start difficulty, weekly goal
 ├─ progression/current           ← journey map: overallLevel, rank, regions{8}, v
 ├─ stats/{gameId}                ← cache: RT baseline (Welford) + resume difficulty
 ├─ reports/{sessionId}           ← per-session report index (cognitiveScore, …)
 ├─ directorAdvice/{sessionId}    ← validated Director guidance (milestones only)
 ├─ promptSnapshots/{sessionId}   ← the exact rendered LLM prompt (observability)
 ├─ coachReports/{docId}          ← longitudinal coach reports
 └─ alerts/{docId}                ← decline alerts

sessions/{sessionId}              ← session summary + full report
meta/tokenUsage                   ← token accounting (totals + byAgent{})
meta/coachingFallbackUsage        ← fallback-bank usage counters
admin/*                           ← pending alerts, token alerts
```

A schema version (`v`) is stamped on every mutable doc (`cognitiveProfile` is at
`v: 2` since the player-model phase; `progression`, `reports`, `liveModel`,
`trainingPlan` at `v: 1`) so future migrations can detect older docs. The model
is backward-compatible — a fresh user simply cold-starts, and legacy v1 profile
docs are read with safe defaults. A presentational **SQL map of the full
schema** lives in [`docs/schema.sql`](docs/schema.sql).

---

## WebSocket protocol

Default endpoint: `ws://localhost:3001` (`VITE_WS_URL`).

**Client → server**

| Message | Meaning |
|---|---|
| game event `{ sessionId, userId, gameId, type, … }` | one player action |
| `{ type: 'end-session' }` | normal game-over (keeps socket open for results) |

**Server → client**

| Message | Meaning |
|---|---|
| `adjustment` | new difficulty params (`reason: resume \| warmup-transfer \| …`) |
| `telemetry` | live `P`/`D`/accuracy for the debug HUD |
| `coaching` | one-line Hebrew encouragement toast |
| `session-summary` | instant end-of-session stats |
| `session-report` | full report + journey-map level changes / rank |

Closing the socket without `end-session` is treated as an **abandon**: the report
and baseline are still persisted for caregivers, but no gamification is awarded.

---

## HTTP API

Base URL (dev): `http://localhost:3000`

```
Auth            POST /api/auth/{signup,login,logout,google}
Player (me)     GET  /api/me/profile · /progression · /reports/:sessionId · /stats/:gameId
Personalization POST /api/personalization/profile/save   GET /api/personalization/profile
Admin           GET  /api/admin/{users,sessions,activity,token-usage,alerts} (+ mutations)
Chat            POST /api/askAI               # Claude-backed website assistant
```

`/api/me/*` and `/api/admin/*` require a Bearer JWT; admin routes also require an
admin role.

---

## Repository layout

```text
NeuroStep/
├─ frontend/                 React + Vite + Phaser
│  └─ src/{games,pages,hooks,context,data,api}
├─ backend/                  Bun + Express REST API
│  ├─ controllers/  routes/  services/  middleware/
│  └─ config/firebase.js     Firestore / Auth admin init
├─ game-server/              WebSocket loop + agents (TypeScript)
│  ├─ server.ts              connection handling + post-session pipeline
│  ├─ agents/                the thirteen agents + progression.config.ts + tests
│  ├─ kafka/                 producer + consumers
│  └─ sessions/              per-connection session store
├─ docker-compose.yml        local stack (app + game-server + kafka + ui)
└─ Dockerfile                backend + built frontend
```

---

## Running locally

Prerequisites: **Bun**, **Node.js**, **Docker** (for Kafka).

```bash
# install
cd frontend && bun install
cd ../backend && bun install
cd ../game-server && npm install

# run (separate terminals)
docker compose up kafka zookeeper kafka-ui   # 1 — Kafka
cd backend     && bun run start              # 2 — REST API   (:3000)
cd game-server && npm run dev                # 3 — game server (:3001)
cd frontend    && bun run dev                # 4 — frontend    (:5173)
```

Open `http://localhost:5173`.

Or the whole stack in containers:

```bash
docker compose up --build
# app :3000 · game-server :3001 · kafka :9092 · kafka-ui :8080
```

---

## Testing

```bash
cd game-server
npm test                              # vitest — 92 tests over the pure agent logic
npx tsc --noEmit                      # type-check
npx tsx agents/adaptive-agent.sim.ts  # adaptive controller simulation (convergence)
```

The pure cores (scoring, profile EMA + health signals, progression, milestone
detection, cross-game seeding, live-model features, training-path director,
planner ranking, Director schema, fallback-bank compliance) are unit-tested;
agents only add Firestore I/O around them.

---

## Environment variables

`backend/.env` (shared with the game server):

```env
# Backend
PORT=3000
JWT_SECRET=change-me
# Comma-separated origins allowed by CORS. Defaults to localhost:3000 when unset.
CORS_ORIGINS=https://your-domain.com

# LLM (single provider — Claude)
ANTHROPIC_API_KEY=sk-ant-...

# Firebase Admin SDK
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=...

# Game server / infra (optional)
WS_PORT=3001
KAFKA_BROKER=localhost:9092
TOKEN_DAILY_WARNING_THRESHOLD=500000
TOKEN_DAILY_CRITICAL_THRESHOLD=1000000
```

Frontend (`frontend/.env`):

```env
VITE_WS_URL=ws://localhost:3001
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

---

## Deployment

The app is containerised and runs from `docker-compose.prod.yml` (app =
REST + built frontend, the game server, Redpanda for Kafka, and a Caddy reverse
proxy that handles HTTPS). See [`DEPLOY.md`](DEPLOY.md) for the full
DigitalOcean walkthrough — Droplet, DNS, secrets, and push-to-main auto-deploy.

If you connect to a managed Kafka instead of the bundled Redpanda, auth is
env-driven: `KAFKA_SSL`, `KAFKA_USERNAME`, `KAFKA_PASSWORD`, `KAFKA_SASL_MECHANISM`,
`KAFKA_CA_CERT`. Required topics: `game-events`, `adjustments`.

---

## Security note

If any secret was ever committed, rotate it immediately — the Firebase service
account key, the `ANTHROPIC_API_KEY`, and the `JWT_SECRET`.
