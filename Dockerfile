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

# Create database initialization script directly
RUN echo '#!/bin/sh' > /app/init-db.sh && \
    echo 'echo "Waiting for database..."' >> /app/init-db.sh && \
    echo 'until node -e "const { Client } = require(\"pg\"); const client = new Client(process.env.DATABASE_URL); client.connect().then(() => { client.end(); process.exit(0); }).catch(() => process.exit(1));" 2>/dev/null; do sleep 1; done' >> /app/init-db.sh && \
    echo 'echo "Initializing database schema..."' >> /app/init-db.sh && \
    echo 'node -e "const { Client } = require(\"pg\"); const client = new Client(process.env.DATABASE_URL); const schema = \`CREATE TABLE IF NOT EXISTS rsvps (id SERIAL PRIMARY KEY, guest_name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL, phone VARCHAR(50), attending BOOLEAN NOT NULL, number_of_guests INTEGER DEFAULT 1, dietary_restrictions TEXT, message TEXT, created_at TIMESTAMP DEFAULT NOW()); CREATE TABLE IF NOT EXISTS wip_toggles (id SERIAL PRIMARY KEY, page_path VARCHAR(255) NOT NULL UNIQUE, page_label VARCHAR(255) NOT NULL, is_wip BOOLEAN DEFAULT false, updated_at TIMESTAMP DEFAULT NOW()); CREATE TABLE IF NOT EXISTS guest_list (id SERIAL PRIMARY KEY, guest_name VARCHAR(255) NOT NULL, email VARCHAR(255), phone VARCHAR(50), party_size INTEGER DEFAULT 1, side VARCHAR(50), notes TEXT, invited BOOLEAN DEFAULT true, rsvp_status VARCHAR(50), plus_one_name VARCHAR(255), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()); ALTER TABLE guest_list ADD COLUMN IF NOT EXISTS plus_one_name VARCHAR(255);\`; client.connect().then(() => client.query(schema)).then(() => { console.log(\"Database initialized!\"); client.end(); process.exit(0); }).catch(err => { console.error(err); client.end(); process.exit(1); });"' >> /app/init-db.sh && \
    chmod +x /app/init-db.sh && \
    chown nextjs:nodejs /app/init-db.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
# set hostname to localhost
ENV HOSTNAME="0.0.0.0"

# Run init script then start server
CMD ["sh", "-c", "/app/init-db.sh && node server.js"]
