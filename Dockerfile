# Imágenes de producción (ver despliegue/LEAME.md). Dos destinos:
#   api  → NestJS; aplica las migraciones al arrancar.
#   web  → Caddy interno (sin HTTPS): sirve la SPA y pasa /api a la API. El HTTPS lo pone el Caddy de
#          OrdenKipu, que recibe las visitas del servidor y las trae por la red "kipu".
# Se construyen en el mismo servidor (ARM en Oracle): no hay imágenes publicadas.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TURBO_TELEMETRY_DISABLED=1
RUN corepack enable && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS api
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:3002/api/v1/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# migrate deploy solo aplica las migraciones del repositorio que falten; nunca crea ni borra.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]

FROM caddy:2 AS web
COPY despliegue/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
