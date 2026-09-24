# Queue worker — document rendering (Typst), imports, reconciliation.
# CPU-bound work never runs in the request path.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# Typst ships as a single static binary — no runtime, no package ecosystem.
# Pin the version: rendering must be reproducible across releases (ADR-0013).
FROM base AS typst
ARG TYPST_VERSION=0.12.0
# ca-certificates is a *recommend* of curl, not a dependency, so
# --no-install-recommends drops it. Without it curl fails TLS against github.com
# with "error setting certificate file", emits nothing, and the empty stream
# reaches `tar -xJ` as "File format not recognized" — and because one failing
# image aborts the whole compose build, NO container is created at all.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" \
       | tar -xJ --strip-components=1 -C /usr/local/bin typst-x86_64-unknown-linux-musl/typst

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/ apps/
COPY services/ services/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS dev
COPY --from=typst /usr/local/bin/typst /usr/local/bin/typst
CMD ["pnpm", "--filter", "@cog/worker", "dev"]

FROM deps AS build
COPY . .
RUN pnpm turbo run build --filter=@cog/worker...

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --system --uid 10001 cog
COPY --from=typst  /usr/local/bin/typst /usr/local/bin/typst
COPY --from=build --chown=cog:cog /app/node_modules ./node_modules
COPY --from=build --chown=cog:cog /app/services ./services
COPY --from=build --chown=cog:cog /app/packages ./packages
USER cog
# Rendering is sandboxed: no network, temp-dir only, templates ship with the
# release and tenant input enters as JSON data (ADR-0013).
CMD ["node", "services/worker/dist/index.js"]
