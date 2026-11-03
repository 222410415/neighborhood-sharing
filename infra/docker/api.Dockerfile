# Production image for the NestJS API (Google Cloud Run or any container host).
# Build from the repository root:
#   docker build -f infra/docker/api.Dockerfile -t neighborhood-api .
# Runtime configuration comes from environment variables, never from the image:
#   FIREBASE_PROJECT_ID, PORT (set by Cloud Run), GEMINI_API_KEY (secret, optional),
#   GEMINI_MODEL, CORS_ALLOWED_ORIGINS (optional), SWEEP_SECRET (secret, optional).
# On Cloud Run the API uses the service's own identity (Application Default
# Credentials); no key file is needed. Elsewhere set FIREBASE_SERVICE_ACCOUNT_BASE64.

FROM node:24.21.0-bookworm-slim

RUN corepack enable && corepack prepare pnpm@12.6.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY apps/api/package.json apps/api/nest-cli.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps/api ./apps/api
COPY packages ./packages

RUN cd /app/packages/contracts && ../../node_modules/.bin/tsc -p tsconfig.json \
 && cd /app/apps/api && ./node_modules/.bin/nest build

ENV NODE_ENV=production
WORKDIR /app/apps/api
USER node
EXPOSE 8080

CMD ["node", "dist/main.js"]
