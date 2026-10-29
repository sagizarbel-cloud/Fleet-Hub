# Production image of the api. Built on the server, so it is arm64 there (`pnpm docker:arm64`
# cross-builds it on another machine). Build context: the repo root.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --filter @fleet-hub/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @fleet-hub/api build \
 && pnpm --filter @fleet-hub/api deploy --prod /out \
 && cd /out && node_modules/.bin/prisma generate && rm -rf src test

FROM base AS runtime
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3001 UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=build --chown=node:node /out ./
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
# Fail the build, not the first start, if a native module doesn't load on this machine.
RUN node -e "import('@node-rs/argon2').then(async (a) => { if (!(await a.verify(await a.hash('x'), 'x'))) process.exit(1); })" \
 && node -e "require('sharp'); new (require('@prisma/client').PrismaClient)();"
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Migrations only move forward (never reset); an empty database gets every table on first start.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/server.js"]
