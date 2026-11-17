#!/usr/bin/env bash
# Reemplaza la base en uso por un respaldo. La base actual NO se borra: queda renombrada
# como kipfit_antes_<fecha> por si hay que volver atrás.
# Antes, detener la API:   docker compose stop api
#   docker compose exec respaldo restaurar.sh /respaldos/diarios/kip-AAAAMMDD-HHMM.dump
# Luego:                   docker compose start api
set -euo pipefail
export PGOPTIONS='-c client_min_messages=warning'
archivo=${1:-}
[ -n "$archivo" ] && [ -f "$archivo" ] || {
  echo "Uso: restaurar.sh <archivo .dump>"
  echo "Respaldos disponibles:"
  ls -1t /respaldos/diarios /respaldos/mensuales 2>/dev/null | head -20
  exit 1
}

conexiones=$(psql -d postgres -Atc "SELECT count(*) FROM pg_stat_activity WHERE datname = '$PGDATABASE' AND pid <> pg_backend_pid()")
if [ "$conexiones" != "0" ]; then
  echo "La base tiene $conexiones conexiones abiertas. Detenga la API primero: docker compose stop api"
  exit 1
fi

# recuperar.sh ya pidió la confirmación y pasa CONFIRMAR=SI.
if [ "${CONFIRMAR:-}" != "SI" ]; then
  read -r -p "Se reemplazará $PGDATABASE por $(basename "$archivo"). Escriba SI para continuar: " r
  [ "$r" = "SI" ] || { echo "Cancelado."; exit 1; }
fi

NUEVA=kip_restaurando
ANTES="${PGDATABASE}_antes_$(date +%Y%m%d_%H%M%S)"
# Los respaldos traen permisos y políticas del rol kip_app (RLS): debe existir antes de restaurar.
psql -d postgres -qc "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kip_app') THEN CREATE ROLE kip_app NOLOGIN; END IF; END \$\$"
dropdb --if-exists --force "$NUEVA"
createdb "$NUEVA"
pg_restore --no-owner --exit-on-error --dbname="$NUEVA" "$archivo"

psql -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER DATABASE \"$PGDATABASE\" RENAME TO \"$ANTES\"" \
  -c "ALTER DATABASE \"$NUEVA\" RENAME TO \"$PGDATABASE\""
echo "Restaurado. La base anterior quedó como $ANTES."
[ "${CONFIRMAR:-}" = "SI" ] || echo "Inicie la API: docker compose start api"
