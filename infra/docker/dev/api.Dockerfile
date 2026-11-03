# Development image for the API (compose.yaml): NestJS in watch mode.
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

RUN cd /app/packages/contracts && ../../node_modules/.bin/tsc -p tsconfig.json

WORKDIR /app/apps/api
EXPOSE 3001

CMD ["./node_modules/.bin/nest", "start", "--watch"]
