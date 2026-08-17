FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Development image, copy all the files and run next
FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# We don't run CMD here, docker-compose will override it with "npm run dev"

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Create empty directories for volume mounts (photos and config)
RUN mkdir -p ./public/photos ./public/config
RUN chown -R nextjs:nodejs ./public/photos ./public/config

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The admin panel's "What's new" reads this at runtime; standalone output would
# otherwise leave it behind in the build stage.
COPY --from=builder --chown=nextjs:nodejs /app/CHANGELOG.md ./CHANGELOG.md

# ---------------------------------------------------------------------------
# Database initialisation.
#
# This used to be an inline copy of the schema pasted into a shell script, which
# had drifted a long way behind `database/init.sql` — it created three tables
# with their original columns and nothing else. Everything added since (seating,
# donations, finances, the honeymoon portal, and half of guest_list's columns)
# appeared only when its API route was first called, so a *fresh* install came up
# with a partial schema. A long-running install never noticed, because every
# route had been hit months ago; a new demo instance noticed immediately.
#
# init.sql is now the only copy and the image runs it. It is idempotent
# (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout), so it is
# safe on every boot, and it is passed as a single query because its DO $$ … $$
# blocks cannot survive being split on semicolons.
# ---------------------------------------------------------------------------
COPY --from=builder --chown=nextjs:nodejs /app/database/init.sql ./database/init.sql

RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -e' \
    'echo "Waiting for database..."' \
    'until node -e "const {Client}=require(\"pg\");const c=new Client(process.env.DATABASE_URL);c.connect().then(()=>{c.end();process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null; do sleep 1; done' \
    'echo "Applying database/init.sql..."' \
    'node -e "const fs=require(\"fs\");const {Client}=require(\"pg\");const c=new Client(process.env.DATABASE_URL);const sql=fs.readFileSync(\"/app/database/init.sql\",\"utf8\");c.connect().then(()=>c.query(sql)).then(()=>{console.log(\"Database initialized!\");return c.end()}).then(()=>process.exit(0)).catch(e=>{console.error(e);c.end();process.exit(1)})"' \
    > /app/init-db.sh && \
    chmod +x /app/init-db.sh && \
    chown nextjs:nodejs /app/init-db.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
# set hostname to localhost
ENV HOSTNAME="0.0.0.0"

# Run init script then start server
CMD ["sh", "-c", "/app/init-db.sh && node server.js"]
