# syntax=docker/dockerfile:1

# Bun is only the package manager and script runner (keep in step with "packageManager" in package.json).
# The app itself runs on Node: better-sqlite3 is a native addon that Bun's runtime cannot load.
ARG BUN_VERSION=1.3.14
FROM oven/bun:${BUN_VERSION} AS bun

# ---- build: install, compile the SPA, keep only production dependencies ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
# No compiler toolchain: "trustedDependencies" stops Bun compiling better-sqlite3, which ships prebuilt binaries.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# Bun has no prune command: reinstall with production dependencies only.
RUN bun run build && rm -rf node_modules && bun install --frozen-lockfile --production

# ---- runtime: Node runs the TypeScript server directly (type stripping), no compile step ----
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_DIR=/app/dist/web
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/web ./dist/web
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
RUN mkdir -p /data && chown -R node:node /data
# The image's `node` user, by number so the host can resolve it.
USER 1000:1000
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server/index.ts"]
