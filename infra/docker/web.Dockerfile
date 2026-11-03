# Production image for the Next.js web app (Google Cloud Run or any container host).
# Next.js fixes the /api rewrite target and NEXT_PUBLIC_* values at BUILD time,
# so they are build arguments:
#
#   docker build -f infra/docker/web.Dockerfile \
#     --build-arg API_INTERNAL_ORIGIN=https://<api-service-url> \
#     -t neighborhood-web .
#
# The NEXT_PUBLIC_FIREBASE_* values are the project's public web config (not
# secrets); when unset, the defaults in apps/web/src/lib/firebase-client.ts apply.

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

ARG API_INTERNAL_ORIGIN
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID

ENV API_INTERNAL_ORIGIN=$API_INTERNAL_ORIGIN \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/apps/web
RUN test -n "$API_INTERNAL_ORIGIN" || (echo "Build argument API_INTERNAL_ORIGIN is required" && exit 1) \
 && ./node_modules/.bin/next build \
 && chown -R node:node /app/apps/web/.next

ENV NODE_ENV=production
USER node
EXPOSE 8080

CMD ["sh", "-c", "exec ./node_modules/.bin/next start -p ${PORT:-8080}"]
