# syntax=docker/dockerfile:1
# CityPulse API — NestJS + Prisma multi-stage build

# ---- deps: install all node_modules (incl. dev deps needed to build) ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: generate prisma client + compile nest ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client into node_modules/.prisma so it ships in the runner,
# then compile the Nest application to ./dist.
RUN npx prisma generate \
  && npm run build

# ---- runner: production image ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3096

# Run as an unprivileged user
RUN addgroup -g 1001 -S nodejs \
  && adduser -u 1001 -S nestjs -G nodejs

# Ship compiled output, the (generated-client-containing) node_modules,
# the prisma schema (needed for `prisma db push`/`generate` at runtime),
# and the prisma runtime config + package manifest.
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nestjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs
EXPOSE 3096
# Apply the schema to the DB on boot, then start the compiled server.
# Nest compiles main.ts to dist/src/main.js with this project's tsconfig layout.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/src/main"]
