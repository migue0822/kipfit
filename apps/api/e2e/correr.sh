#!/usr/bin/env bash
# Pruebas de punta a punta: por cada suite, base vacía (kipfit_e2e), migraciones y la API en :3999.
# Uso: pnpm --filter @kip/api e2e [suite...]   (requiere PostgreSQL local y psql; compila antes)
set -euo pipefail
cd "$(dirname "$0")/.."
SERVIDOR=${E2E_SERVIDOR:-postgresql://kip:kip@localhost:5434}
export E2E_DB="$SERVIDOR/kipfit_e2e"
export E2E_URL=http://localhost:3999/api/v1

suites=("$@")
if [ ${#suites[@]} -eq 0 ]; then
  for f in e2e/*.e2e.mjs; do suites+=("$(basename "$f" .e2e.mjs)"); done
fi

[ -f dist/main.js ] || { echo "Primero compile: pnpm build"; exit 1; }
fallaron=()
for s in "${suites[@]}"; do
  psql "$SERVIDOR/postgres" -qc 'DROP DATABASE IF EXISTS kipfit_e2e WITH (FORCE)' -c 'CREATE DATABASE kipfit_e2e' >/dev/null
  for m in prisma/migrations/*/migration.sql; do
    psql "$E2E_DB" -q -v ON_ERROR_STOP=1 -f "$m" >/dev/null 2>&1 || { echo "Falló la migración $m"; exit 1; }
  done
  DATABASE_URL="$E2E_DB" PORT=3999 PLATAFORMA_CLAVE="${E2E_PLATAFORMA_CLAVE:-clave-plataforma-e2e-0123456789}" \
    node dist/main.js >"/tmp/kipfit-e2e-api.log" 2>&1 &
  api=$!
  for _ in $(seq 1 50); do curl -sf "$E2E_URL/salud" >/dev/null 2>&1 && break; sleep 0.2; done
  echo "── $s"
  if ! node "e2e/$s.e2e.mjs"; then fallaron+=("$s"); fi
  kill $api; wait $api 2>/dev/null || true
done
if [ ${#fallaron[@]} -gt 0 ]; then echo "Suites con fallas: ${fallaron[*]}"; exit 1; fi
echo "Todas las suites pasaron: ${suites[*]}"
