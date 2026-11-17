#!/usr/bin/env bash
# Compara la base (con las migraciones aplicadas) contra schema.prisma. Prisma no conoce los
# índices parciales ni las reglas CHECK que solo existen en el SQL: esas diferencias se ignoran.
set -euo pipefail
cd "$(dirname "$0")/.."
# Índices que solo existen en el SQL (Prisma propone borrarlos).
PROPIOS_DEL_SQL='ninguno_por_ahora'

diferencias=$(npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script \
  | grep -v '^--' | grep -v '^\s*$' | grep -Ev "DROP INDEX \"(${PROPIOS_DEL_SQL})\";" || true)
if [ -n "$diferencias" ]; then
  echo "Las migraciones no coinciden con schema.prisma. Falta en las migraciones:"
  echo "$diferencias"
  exit 1
fi
echo "Las migraciones coinciden con schema.prisma."
