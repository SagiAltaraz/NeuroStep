# NeuroStep

NeuroStep is a cognitive-training web platform with:

- React + Vite frontend
- Bun + Express REST backend
- TypeScript WebSocket game server
- Kafka pipeline for game events
- Firebase (Auth verification + Firestore persistence)
- OpenAI-powered chat assistant endpoint

The system is built around adaptive game difficulty: live game events are sent over WebSocket, analyzed on the server, and fed back as real-time difficulty adjustments.

## What is currently implemented

- User auth with email/password and Google sign-in
- JWT-protected backend routes
- Personalized onboarding profile form saved to Firestore
- Two working games:
   - `shapes-click` (Phaser)
   - `color-trains` (Phaser)
- Real-time adaptive difficulty engine
- Kafka producer + analytics consumer pipeline
- Admin dashboard shell with:
   - working users management
   - placeholder stats/events/settings pages
- Website chat widget calling `/api/askAI`

## High-level architecture

1. Frontend game emits actions via `useGameSession` over WebSocket (`ws://localhost:3001` by default).
2. Game server:
   - initializes/updates session state
   - writes raw events to Kafka topic `game-events`
   - runs adaptive-agent logic per session
   - sends difficulty adjustments back to the game socket
   - logs adjustments to Kafka topic `adjustments`
3. Analytics agent consumes `game-events` and writes:
   - session summaries into `sessions/{sessionId}`
   - rolling user/game stats into `users/{userId}/stats/{gameId}` (Firestore)
4. REST backend serves auth/admin/personalization/chat APIs and (in container mode) serves the built frontend.

## Repository structure

```text
NeuroStep/
|- frontend/                  React app (Vite + TypeScript + Phaser)
|  |- src/pages/              App pages (home, games, admin, auth)
|  |- src/games/              Game implementations
|  |- src/hooks/useGameSession.ts
|  `- src/context/AuthContext.tsx
|- backend/                   Express REST API (Bun runtime)
|  |- controllers/            auth/admin/chat controllers
|  |- routes/                 API routes
|  |- services/user.js        Firestore user service
|  `- middleware/authMiddleware.js
|- game-server/               WebSocket + Kafka + adaptive agents (TS)
|  |- agents/
|  |- kafka/
|  `- sessions/
|     |- server.ts
|     |- agents/
|     |- kafka/
|     `- sessions/
|- docker-compose.yml         Local stack: app + game-server + kafka + ui
`- Dockerfile                 Multi-stage build for backend + frontend dist
```

## API overview

Base URL (dev): `http://localhost:3000`

Auth:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/google`

Personalization (requires Bearer token):

- `POST /api/personalization/profile/save`
- `GET /api/personalization/profile`

Admin (requires Bearer token + admin role):

- `GET /api/admin/users`
- `PATCH /api/admin/users/:id/role`
- `PUT /api/admin/users/:id`
- `DELETE /api/admin/users/:id`

Chat:

- `POST /api/askAI`

## Environment variables

Create `backend/.env` with at least:

```env
# Backend
PORT=3000
JWT_SECRET=change-me
OPENAI_API_KEY=your_openai_key

# Firebase Admin SDK
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=...

# Optional
WS_PORT=3001
KAFKA_BROKER=localhost:9092
```

Frontend optional env:

```env
# frontend/.env
VITE_WS_URL=ws://localhost:3001
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## Running locally (development)

Prerequisites:

- Bun
- Node.js (for some scripts/tooling)
- Docker (if running Kafka with compose)

Install dependencies:

```bash
# frontend
cd frontend
bun install

# backend
cd ../backend
bun install

# game-server
cd ../game-server
npm install
```

Run services in separate terminals:

```bash
# Terminal 1: Kafka + Zookeeper + Kafka UI
docker compose up kafka zookeeper kafka-ui

# Terminal 2: REST backend
cd backend
bun run start

# Terminal 3: game-server (WebSocket + agents)
cd game-server
npm run dev

# Terminal 4: frontend
cd frontend
bun run dev
```

Then open `http://localhost:5173`.

## Running with Docker Compose (app stack)

From repo root:

```bash
docker compose up --build
```

This starts:

- `app` on `http://localhost:3000`
- `game-server` on `ws://localhost:3001`
- Kafka on `localhost:9092`
- Kafka UI on `http://localhost:8080`

## Notes on current state

- `Memory` and `TicTacToe` pages are currently placeholders (instruction screens + "coming soon" game view).
- Admin `stats`, `events`, and `settings` are currently mock/static UI.
- `frontend/src/config/firebase.ts` contains some hardcoded Firebase project values; env-based values are recommended for all fields.

## Security note

If secrets were ever committed to Git history, rotate them immediately:

- Firebase service account private key
- OpenAI API key
- JWT secret

## Deploy to Render (step by step)

This project should run on Render as:

- `app` web service (Docker): backend API + built frontend
- `game-server` web service (Docker): WebSocket + Kafka agents
- managed Kafka provider (Confluent Cloud/Aiven/Upstash Kafka)

### 1) Prepare production environment values

You will need:

- `JWT_SECRET`
- `OPENAI_API_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (keep newline escapes as `\n`)
- `FIREBASE_DATABASE_URL`
- `KAFKA_BROKER` (managed Kafka endpoint, e.g. `host:9092`)
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

### 2) Push repo to GitHub/GitLab

Render deploys from your git repository, so commit/push first.

### 3) Create `app` service on Render

In Render:

1. New `Web Service`
2. Connect your repo
3. Environment: `Docker`
4. Root Directory: repository root
5. Dockerfile Path: `./Dockerfile`
6. Add env vars:
   - Backend vars from step 1
   - `PORT=3000`
   - `VITE_WS_URL=wss://<your-game-server>.onrender.com`
   - `CORS_ORIGINS=https://<your-app>.onrender.com`
7. Create service and wait for deploy

Notes:

- Render injects Docker service env vars as Docker build args, so `VITE_*` values are available during frontend build in the Dockerfile.
- Frontend is served by Express from `frontend/dist`; no separate static site is required.

### 4) Create `game-server` service on Render

In Render:

1. New `Web Service`
2. Connect same repo
3. Environment: `Docker`
4. Root Directory: `game-server`
5. Dockerfile Path: `./Dockerfile`
6. Add env vars:
   - `WS_PORT=3001`
   - `KAFKA_BROKER=<managed-kafka-broker:port>`
   - Firebase vars used by agents (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_DATABASE_URL`)
   - Any optional AI-related keys your agents use
7. Create service and wait for deploy

### 5) Wire domains

After `game-server` is live:

1. Copy its public URL
2. Update `app` env var `VITE_WS_URL` to `wss://<game-server-url>`
3. Redeploy `app`

If you use a custom domain:

1. Add custom domain to `app`
2. Set `CORS_ORIGINS` to include each frontend origin as comma-separated values
   - Example: `https://app.example.com,https://www.app.example.com`
3. Redeploy `app`

### 6) Validate deployment

1. Open `https://<app>.onrender.com`
2. Confirm signup/login works
3. Open browser dev tools and verify WebSocket connects to `wss://<game-server>.onrender.com`
4. Start a game and confirm session events are processed (no Kafka connection errors in game-server logs)

### 7) Recommended Render settings

- Set both services to auto-deploy on push
- Add health checks:
   - `app`: `GET /api/auth/login` is not ideal (POST route), use a simple GET route if you add one later
   - `game-server`: TCP health on exposed port is sufficient if no HTTP endpoint exists
- Use Render Environment Groups to share common secrets across both services
