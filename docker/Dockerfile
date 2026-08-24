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

# ---------------------------------------------------------------------------
# Seeder image — the demo instance's one-shot seed service.
#
# The production image above deliberately ships the standalone server and
# nothing else, so it cannot run the demo seed. The demo stack (see
# docker-compose.demo.yml) runs this image as a short-lived `seed` service:
# it waits for the database, and only when the guest list is empty it runs
# the demo seed — writing the config and photos straight into the demo
# volumes — then exits. A redeploy therefore never wipes a demo someone has
# been clicking around in.
#
# It is published as a separate image,
#     ghcr.io/soccerbeats/weddingwebsite-seeder:latest
# by the "Demo Instance" workflow (see .github/workflows/demo-deploy.yml).
# The production image name and its tags are untouched.
# ---------------------------------------------------------------------------
FROM base AS seeder
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts/ ./scripts/
# The seed imports the schema owners from src/lib (financeDb, honeymoonDb,
# and their friends), so the library source ships with it — never executed
# by the server, only loaded by the seed.
COPY src/lib/ ./src/lib/
COPY database/init.sql ./database/init.sql

# The seed is a TypeScript script run through tsx; --no-save keeps
# package.json and the lockfile untouched.
RUN npm install --no-save tsx

# The demo volumes mount here. Creating them in the image (owned by the
# app user) makes Docker initialise the named volumes with the right
# ownership, so the seed can write to them as nextjs.
RUN mkdir -p /data/config /data/photos
RUN chown nextjs:nodejs /data/config /data/photos

# Wait for the database, apply the idempotent schema (the web service does
# the same on its own boot — harmless to run twice), then seed only when
# guest_list is empty. The wipe flag is safe here: the seed runs against
# the dedicated demo database only, and only when it is provably empty.
#
# SEED_ALWAYS=true reseeds on every start instead, wiping first. That is what
# the public demo sets: it runs with DEMO_MODE, so nothing a visitor does was
# ever kept and there is nothing to preserve — while a *new* seed brings the
# fictional wedding up to date with whatever features shipped since. Left
# unset, the guard above stands, so a hand-run demo someone is using is safe.
RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -e' \
    'echo "Waiting for database..."' \
    'until node -e "const {Client}=require(\"pg\");const c=new Client(process.env.DATABASE_URL);c.connect().then(()=>{c.end();process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null; do sleep 1; done' \
    'node -e "const fs=require(\"fs\");const {Client}=require(\"pg\");const c=new Client(process.env.DATABASE_URL);const sql=fs.readFileSync(\"/app/database/init.sql\",\"utf8\");c.connect().then(()=>c.query(sql)).then(()=>c.end()).then(()=>process.exit(0)).catch(e=>{console.error(e);c.end();process.exit(1)})"' \
    'COUNT=$(node -e "const {Client}=require(\"pg\");const c=new Client(process.env.DATABASE_URL);c.connect().then(()=>c.query(\"SELECT count(*)::int AS n FROM guest_list\")).then(r=>{console.log(r.rows[0].n);return c.end()}).catch(e=>{console.error(e);c.end();process.exit(1)})")' \
    'if [ "$COUNT" = "0" ] || [ "$SEED_ALWAYS" = "true" ]; then' \
    '  echo "guest_list is empty — seeding the demo instance..."' \
    '  node_modules/.bin/tsx scripts/seed-demo.mts --yes-wipe' \
    '  echo "Demo seeded."' \
    'else' \
    '  echo "guest_list already has $COUNT rows — the demo keeps its current data, seed skipped."' \
    'fi' \
    > /app/seed-demo.sh && \
    chmod +x /app/seed-demo.sh && \
    chown nextjs:nodejs /app/seed-demo.sh

USER nextjs

CMD ["/app/seed-demo.sh"]
