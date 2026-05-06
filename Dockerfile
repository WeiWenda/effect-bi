# Base image: override when Docker Hub is unreachable (timeouts to auth.docker.io).
# Example (DaoCloud mirror):
#   docker build --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim -t effect-bi:local .
# Example (Aliyun, replace <your-namespace> if you mirror node yourself):
#   docker build --build-arg NODE_IMAGE=registry.cn-hangzhou.aliyuncs.com/acs/node:22-bookworm-slim -t effect-bi:local .
ARG NODE_IMAGE=node:22-bookworm-slim
# SPA Gravitino metalake segment: docker build --build-arg VITE_GRAVITINO_METALAKE=my_lake …

# --- Vite React app (VITE_* are inlined at build time; pass via compose build.args)
FROM ${NODE_IMAGE} AS frontend-builder
ARG VITE_GRAVITINO_METALAKE=effectbi
ENV VITE_GRAVITINO_METALAKE=${VITE_GRAVITINO_METALAKE}
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json ./
COPY src ./src
COPY public ./public
RUN npm run build

# --- Express API (TypeScript → dist) ---
FROM ${NODE_IMAGE} AS backend-builder
WORKDIR /api
COPY backend/node/package.json ./
RUN npm install
COPY backend/node/tsconfig.json ./
COPY backend/node/src ./src
RUN npm run build

# --- Single process: Node serves /api + optional proxies + static SPA ---
FROM ${NODE_IMAGE} AS production
WORKDIR /app
ENV NODE_ENV=production
COPY backend/node/package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=backend-builder /api/dist ./dist
COPY --from=frontend-builder /web/dist ./static
COPY backend/node/migrations ./migrations
COPY scripts/docker-entrypoint-effect-bi.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
