# One service: Fastify serves the API and the built dashboard from the same origin.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY web web
RUN npm run build -w web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 COOKIE_SECURE=true WEB_DIST=../web/dist
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace server
COPY server/src server/src
COPY server/migrations server/migrations
COPY server/scripts server/scripts
COPY --from=build /app/web/dist web/dist
USER node
EXPOSE 3000
# Apply any pending migrations, then start. Migrations are idempotent, so this is
# safe on every start and a fresh database gets its tables before the first
# request. `exec` hands PID 1 to node so SIGTERM reaches its graceful shutdown.
CMD ["sh", "-c", "node server/scripts/migrate.js && exec node server/src/server.js"]
