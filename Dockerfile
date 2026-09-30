# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS production-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# Route modules validate that server-only configuration exists while Next.js
# collects build metadata. These non-secret, unreachable values are replaced by
# the required runtime environment in Compose.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    SERVICEAUDIT_ORGANIZATION_ID=00000000-0000-0000-0000-000000000000 \
    npm run build

FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

FROM base AS migrator
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs package.json package-lock.json ./
COPY --chown=nextjs:nodejs drizzle ./drizzle
COPY --chown=nextjs:nodejs scripts/migrate-production.mjs ./scripts/migrate-production.mjs

USER nextjs
CMD ["node", "scripts/migrate-production.mjs"]
