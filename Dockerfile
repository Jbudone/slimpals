FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/db/migrations ./server/db/migrations
# Tuning docs (server/services/contentTuning/fs.ts) are read from disk at
# runtime via a process.cwd()-relative path, not bundled by tsc — must be
# copied alongside dist/ or coach-message generation 500s in production.
COPY --from=builder /app/server/services/ai/prompts ./server/services/ai/prompts
COPY --from=builder /app/server/services/contentTuning/docs ./server/services/contentTuning/docs
COPY drizzle.config.ts ./
EXPOSE 3000
CMD ["node", "dist/server/server/index.js"]
