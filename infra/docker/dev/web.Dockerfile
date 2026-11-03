# Development image for the web app (compose.yaml): Next.js dev server.
FROM node:24.21.0-bookworm-slim

RUN corepack enable && corepack prepare pnpm@12.6.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps/web ./apps/web
COPY packages ./packages

WORKDIR /app/apps/web
EXPOSE 3000

CMD ["./node_modules/.bin/next", "dev", "-p", "3000"]
