# Tools image (compose.yaml, profile "tools"): seeds, admin scripts, lint, tests.
FROM node:24.21.0-bookworm-slim

RUN corepack enable && corepack prepare pnpm@12.6.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json .npmrc eslint.config.mjs .prettierrc ./
COPY apps/api/package.json apps/api/nest-cli.json ./apps/api/
COPY apps/web/package.json apps/web/next.config.ts ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps ./apps
COPY packages ./packages
COPY tests ./tests

CMD ["bash"]
