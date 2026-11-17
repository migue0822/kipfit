#!/usr/bin/env bash
# Recupera el sistema desde los respaldos (guía: despliegue/LEAME.md, "Si se pierde el servidor").
#
#   ./recuperar.sh                  restaura el respaldo más reciente de Google Drive (servidor nuevo o base dañada)
#   ./recuperar.sh kip-AAAAMMDD-HHMM.dump   restaura ese respaldo (del servidor si está, si no de Drive)
#   ./recuperar.sh --lista          muestra los respaldos disponibles en el servidor y en Drive
#   ./recuperar.sh --simulacro      prueba completa SIN tocar la base en uso: baja el último de Drive, lo
#                                   restaura en una base temporal, la compara con la real y la borra
#
# La base que haya no se borra: queda renombrada como kipfit_antes_<fecha>.
set -euo pipefail
cd "$(dirname "$0")"

titulo() { printf '\n== %s\n' "$1"; }
falla() {
  printf '\nNO SE PUDO: %s\n' "$1" >&2
  exit 1
}
# Sin la entrada estándar: así el comando no se come la respuesta "SI" (por ejemplo, con: echo SI | ./recuperar.sh).
en_respaldo() { docker compose exec -T "$@" </dev/null; }

[ -f .env ] || falla "falta despliegue/.env. Créelo como en la guía (paso 3) con los valores que guardó aparte."
nube=$(grep -E '^RCLONE_DESTINO=' .env | tail -1 | cut -d= -f2- || true)

titulo "Arrancando la base y el contenedor de respaldos"
docker compose up -d --build --wait postgres respaldo >/dev/null

case "${1:-}" in
  --lista)
    titulo "Respaldos en este servidor"
    en_respaldo respaldo sh -c 'ls -1t /respaldos/diarios /respaldos/mensuales 2>/dev/null | grep kip- | head -20' ||
      echo "(ninguno)"
    if [ -n "$nube" ]; then
      titulo "Respaldos en $nube"
      en_respaldo respaldo sh -c "rclone lsf \"\$RCLONE_DESTINO/diarios\" --include 'kip-*.dump' | sort -r | head -20; \
        rclone lsf \"\$RCLONE_DESTINO/mensuales\" --include 'kip-*.dump' | sort -r | head -13"
    else
      echo "RCLONE_DESTINO está vacío: no hay copia en Google Drive (guía, paso 6)."
    fi
    exit 0
    ;;
  --simulacro)
    [ -n "$nube" ] || falla "RCLONE_DESTINO está vacío: sin copia en Google Drive no hay con qué recuperar (guía, paso 6)."
    titulo "Simulacro: bajar el último respaldo de Drive y restaurarlo aparte (la base en uso no se toca)"
    en_respaldo respaldo probar-nube.sh || falla "el respaldo de Drive no se pudo bajar o restaurar."
    cat <<'TXT'

Simulacro correcto. Para recuperar de verdad, además de este respaldo necesita, guardados FUERA del servidor:
  - el archivo despliegue/.env (o sus valores) y despliegue/rclone/rclone.conf
  - la llave SSH (oracle_erp) y el acceso a su cuenta de DuckDNS (o de su dominio)
Anote la fecha de este simulacro y repítalo cada mes.
TXT
    exit 0
    ;;
  -*)
    sed -n '2,11p' "$0"
    exit 1
    ;;
esac

inicio=$(date +%s)
nombre=${1:-}
archivo=""
if [ -n "$nombre" ]; then
  for c in diarios mensuales; do
    if en_respaldo respaldo test -f "/respaldos/$c/$nombre"; then archivo="/respaldos/$c/$nombre"; fi
  done
fi
if [ -z "$archivo" ]; then
  [ -n "$nube" ] || falla "RCLONE_DESTINO está vacío y el respaldo no está en este servidor. Configure Google Drive (guía, paso 6) o use ./recuperar.sh --lista."
  titulo "Bajando el respaldo de Google Drive"
  archivo=$(en_respaldo respaldo bajar-de-la-nube.sh "$nombre") || falla "no se pudo bajar el respaldo."
  archivo=$(printf '%s' "$archivo" | tail -1 | tr -d '\r')
fi

titulo "Lo que se va a hacer"
base=$(basename "$archivo")
if [[ $base =~ ^kip-([0-9]{4})([0-9]{2})([0-9]{2})-([0-9]{2})([0-9]{2}) ]]; then
  r=("${BASH_REMATCH[@]}")
  echo "Respaldo: $base, hecho el ${r[3]}/${r[2]}/${r[1]} a las ${r[4]}:${r[5]} (hora de Colombia)."
else
  echo "Respaldo: $base"
fi
echo "Lo registrado después de esa hora no está en el respaldo."
echo "La base actual (si tiene datos) no se borra: queda como kipfit_antes_<fecha>."
echo "El sistema queda fuera de servicio unos minutos."
read -r -p "Escriba SI para restaurar: " r
[ "$r" = "SI" ] || falla "cancelado por usted; no se cambió nada."

titulo "Deteniendo la API"
docker compose stop api >/dev/null 2>&1 || true

titulo "Restaurando"
en_respaldo -e CONFIRMAR=SI respaldo restaurar.sh "$archivo" || {
  docker compose up -d >/dev/null 2>&1 || true
  falla "la restauración falló; la base anterior quedó como estaba."
}

titulo "Arrancando el sistema (aplica las migraciones pendientes)"
docker compose up -d --build >/dev/null
for _ in $(seq 1 100); do
  estado=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q api)" 2>/dev/null || true)
  [ "$estado" = "healthy" ] && break
  sleep 3
done
[ "${estado:-}" = "healthy" ] || falla "la API no arrancó. Revise: docker compose logs --tail 100 api"

titulo "Listo en $(($(date +%s) - inicio)) segundos"
en_respaldo respaldo psql -Atc "SELECT (SELECT count(*) FROM empresa) || ' empresas, ' || (SELECT count(*) FROM documento) || ' documentos, ' || (SELECT count(*) FROM usuario) || ' usuarios'"
cat <<'TXT'
Falta:
  1. Si es un servidor nuevo: OrdenKipu debe estar recuperado y arrancado; luego publique Kipfit con ./conectar.sh
     y en duckdns.org ponga la IP de este servidor en su dominio (update ip). En unos minutos sale el candado.
  2. Entre al sistema y revise las últimas ventas: lo registrado después de la hora del respaldo se perdió y hay
     que volver a digitarlo.
  3. Haga un respaldo nuevo ya: docker compose exec respaldo respaldar.sh
TXT
