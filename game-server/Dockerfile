FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Run directly with tsx (no build step needed for dev)
CMD ["npx", "tsx", "server.ts"]
