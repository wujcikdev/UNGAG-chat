# Builds UNGAG-chat (LibreChat fork) from the public GitHub repo for Hugging Face Spaces.
# Mirrors the repo's root Dockerfile; the source is fetched from GitHub because a
# Space git repo holds only this file and the README.

FROM debian:bookworm-slim AS source
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch berry-13/tailwind-v4-theme-tokens \
    https://github.com/wujcikdev/UNGAG-chat.git /repo

FROM node:24.16.0-alpine

RUN apk upgrade --no-cache
RUN apk add --no-cache jemalloc
RUN apk add --no-cache python3 py3-pip uv

ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2
ENV SCARF_ANALYTICS=false

COPY --from=ghcr.io/astral-sh/uv:0.9.5-python3.12-alpine /usr/local/bin/uv /usr/local/bin/uvx /bin/

ARG NODE_MAX_OLD_SPACE_SIZE=6144

RUN mkdir -p /app && chown node:node /app
WORKDIR /app

USER node

COPY --from=source --chown=node:node /repo/package.json /repo/package-lock.json ./
COPY --from=source --chown=node:node /repo/api/package.json ./api/package.json
COPY --from=source --chown=node:node /repo/client/package.json ./client/package.json
COPY --from=source --chown=node:node /repo/packages/data-provider/package.json ./packages/data-provider/package.json
COPY --from=source --chown=node:node /repo/packages/data-schemas/package.json ./packages/data-schemas/package.json
COPY --from=source --chown=node:node /repo/packages/api/package.json ./packages/api/package.json

RUN \
    touch .env ; \
    mkdir -p /app/client/public/images /app/logs /app/uploads /app/skill /app/data ; \
    chmod 1777 /app/data ; \
    npm config set fetch-retry-maxtimeout 600000 ; \
    npm config set fetch-retries 5 ; \
    npm config set fetch-retry-mintimeout 15000 ; \
    npm ci --no-audit

COPY --from=source --chown=node:node /repo/ ./

RUN \
    NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" npm run frontend ; \
    npm prune --production ; \
    npm cache clean --force

EXPOSE 3080
ENV HOST=0.0.0.0
CMD ["npm", "run", "backend"]
