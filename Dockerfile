# Stage 1: Build frontend
# VITE_ env vars must be passed at build time via --build-arg
FROM oven/bun:1 AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install
COPY frontend/ .
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_WS_URL
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_WS_URL=$VITE_WS_URL
RUN bun run build

# Stage 2: Install backend dependencies
FROM node:20-alpine AS deps
WORKDIR /backend
COPY backend/package.json ./
RUN npm install

# Stage 3: Production runner
FROM node:20-alpine
WORKDIR /app/backend
COPY --from=deps /backend/node_modules ./node_modules
COPY backend/ .
COPY --from=frontend-build /frontend/dist /app/frontend/dist

EXPOSE 3000
CMD ["node", "server.js"]
