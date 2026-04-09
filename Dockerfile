# Stage 1: Build frontend
FROM oven/bun:1 AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install
COPY frontend/ .
RUN bun run build

# Stage 2: Install backend dependencies
FROM oven/bun:1 AS deps
WORKDIR /backend
COPY backend/package.json backend/bun.lock ./
RUN bun install

# Stage 3: Production runner
FROM oven/bun:1
WORKDIR /app/backend
COPY --from=deps /backend/node_modules ./node_modules
COPY backend/ .
COPY --from=frontend-build /frontend/dist /app/frontend/dist

EXPOSE 3000
CMD ["bun", "server.js"]
