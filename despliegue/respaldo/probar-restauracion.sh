#!/usr/bin/env bash
# Restaura un respaldo en una base temporal, cuenta empresas y documentos, y la borra.
# No toca la base en uso. Sin argumento usa el respaldo diario más reciente.
#   docker compose exec respaldo probar-restauracion.sh [ruta del .dump]
set -euo pipefail
export PGOPTIONS='-c client_min_messages=warning'
archivo=${1:-$(ls -1t "${RESPALDO_DIR:-/respaldos}"/diarios/kip-*.dump 2>/dev/null | head -1)}
[ -n "$archivo" ] && [ -f "$archivo" ] || { echo "No hay respaldo para probar"; exit 1; }
PRUEBA=kip_prueba_restauracion

echo "Probando la restauración de $(basename "$archivo")…"
# Los respaldos traen permisos y políticas del rol kip_app (RLS): debe existir antes de restaurar.
psql -d postgres -qc "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kip_app') THEN CREATE ROLE kip_app NOLOGIN; END IF; END \$\$"
dropdb --if-exists --force "$PRUEBA"
createdb "$PRUEBA"
trap 'dropdb --if-exists --force "$PRUEBA"' EXIT
pg_restore --no-owner --exit-on-error --dbname="$PRUEBA" "$archivo"

contar() { psql -d "$1" -Atc "SELECT (SELECT count(*) FROM empresa) || ' empresas, ' || (SELECT count(*) FROM documento) || ' documentos, ' || (SELECT count(*) FROM turno_caja) || ' cierres de caja'"; }
echo "Respaldo restaurado: $(contar "$PRUEBA")"
echo "Base en uso:         $(contar "$PGDATABASE")"
echo "Restauración correcta."
