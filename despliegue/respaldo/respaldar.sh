#!/usr/bin/env bash
# Un respaldo completo de la base (pg_dump, formato comprimido), verificado y copiado a la nube.
#   diarios/   uno por día, se guardan RESPALDO_DIAS (servidor) y RESPALDO_DIAS_NUBE (nube)
#   mensuales/ el del día 1 de cada mes, se guardan 13 meses
# Los domingos además lo baja de la nube y lo restaura en una base temporal para probar que sirve.
# Para hacer uno ya:  docker compose exec respaldo respaldar.sh
set -euo pipefail
DIR=${RESPALDO_DIR:-/respaldos}
mkdir -p "$DIR/diarios" "$DIR/mensuales"

nombre="kip-$(date +%Y%m%d-%H%M).dump"
archivo="$DIR/diarios/$nombre"

echo "[$(date '+%F %T')] Respaldando $PGDATABASE…"
pg_dump --format=custom --compress=6 --file="$archivo.tmp"
# Un archivo que pg_restore no puede leer no es un respaldo.
pg_restore --list "$archivo.tmp" >/dev/null
mv "$archivo.tmp" "$archivo"
echo "Listo: $nombre ($(du -h "$archivo" | cut -f1))"

if [ "$(date +%d)" = "01" ]; then cp "$archivo" "$DIR/mensuales/$nombre"; fi

# Retención en el servidor.
find "$DIR/diarios" -name 'kip-*.dump' -mtime +"${RESPALDO_DIAS:-14}" -delete
find "$DIR/mensuales" -name 'kip-*.dump' -mtime +400 -delete
find "$DIR" -name '*.tmp' -mmin +120 -delete

if [ -n "${RCLONE_DESTINO:-}" ]; then
  echo "Copiando a $RCLONE_DESTINO…"
  # Las carpetas deben existir antes de limpiarlas (mensuales queda vacía hasta el día 1).
  rclone mkdir "$RCLONE_DESTINO/diarios"
  rclone mkdir "$RCLONE_DESTINO/mensuales"
  rclone copy "$DIR/diarios" "$RCLONE_DESTINO/diarios" --include 'kip-*.dump'
  rclone copy "$DIR/mensuales" "$RCLONE_DESTINO/mensuales" --include 'kip-*.dump'
  rclone delete "$RCLONE_DESTINO/diarios" --min-age "${RESPALDO_DIAS_NUBE:-60}d" --include 'kip-*.dump'
  rclone delete "$RCLONE_DESTINO/mensuales" --min-age 400d --include 'kip-*.dump'
  echo "Copia en la nube al día."
else
  echo "AVISO: RCLONE_DESTINO vacío, el respaldo solo quedó en el servidor."
fi

# Los domingos se prueba que el respaldo sirve: el que quedó en la nube (lo que salva todo si se pierde el
# servidor) o, sin nube, el del servidor.
if [ "$(date +%u)" = "7" ]; then
  if [ -n "${RCLONE_DESTINO:-}" ]; then probar-nube.sh "$nombre"; else probar-restauracion.sh "$archivo"; fi
fi

echo "$(date '+%F %T') $nombre" >"$DIR/ultimo-respaldo.txt"
if [ -n "${RESPALDO_AVISO_URL:-}" ]; then curl -fsS -m 10 --retry 3 "$RESPALDO_AVISO_URL" >/dev/null || true; fi
