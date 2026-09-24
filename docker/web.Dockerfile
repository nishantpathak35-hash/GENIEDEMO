# apps/web — the internal ERP. The three other surfaces build identically with
# a different --filter.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/ apps/
COPY services/ services/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS dev
CMD ["pnpm", "--filter", "@cog/web", "dev"]

FROM deps AS build
COPY . .
RUN pnpm turbo run build --filter=@cog/web...

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --system --uid 10001 cog
COPY --from=build --chown=cog:cog /app/apps/web/.next/standalone ./
COPY --from=build --chown=cog:cog /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=cog:cog /app/apps/web/public ./apps/web/public
USER cog
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
