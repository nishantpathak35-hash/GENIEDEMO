# API host — the seven services composed into one deployable (OPEN-DECISIONS #2).
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# ignore-scripts is enforced repo-wide (ADR-0015); postinstall is the primary
# npm attack vector.
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/ apps/
COPY services/ services/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS dev
CMD ["pnpm", "--filter", "@cog/api", "dev"]

FROM deps AS build
COPY . .
RUN pnpm turbo run build --filter=@cog/api...

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --system --uid 10001 cog
COPY --from=build --chown=cog:cog /app/node_modules ./node_modules
COPY --from=build --chown=cog:cog /app/services ./services
COPY --from=build --chown=cog:cog /app/packages ./packages
USER cog
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://localhost:4000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/host/dist/index.js"]
