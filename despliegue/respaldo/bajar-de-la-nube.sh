#!/usr/bin/env bash
# Baja un respaldo de la nube (RCLONE_DESTINO) y verifica que se pueda leer.
#   bajar-de-la-nube.sh [kip-AAAAMMDD-HHMM.dump] [carpeta]
# Sin nombre baja el diario más reciente; la carpeta por defecto es /respaldos/diarios.
# Los mensajes van a la salida de error: la salida normal es solo la ruta del archivo bajado.
set -euo pipefail
[ -n "${RCLONE_DESTINO:-}" ] || {
  echo "RCLONE_DESTINO está vacío en despliegue/.env: no hay copia en la nube configurada (guía, paso 6)." >&2
  exit 1
}
nombre=${1:-}
destino=${2:-${RESPALDO_DIR:-/respaldos}/diarios}

if [ -z "$nombre" ]; then
  # Los nombres llevan la fecha (kip-AAAAMMDD-HHMM): el último en orden es el más reciente.
  lista=$(rclone lsf "$RCLONE_DESTINO/diarios" --files-only --include 'kip-*.dump') || {
    echo "No se pudo leer $RCLONE_DESTINO/diarios. Revise la conexión con Google Drive (guía, paso 6)." >&2
    exit 1
  }
  nombre=$(printf '%s\n' "$lista" | sort | tail -1)
  [ -n "$nombre" ] || { echo "No hay respaldos en $RCLONE_DESTINO/diarios." >&2; exit 1; }
fi
carpeta=diarios
if ! rclone lsf "$RCLONE_DESTINO/diarios" --files-only --include "$nombre" | grep -qx "$nombre"; then
  carpeta=mensuales
  rclone lsf "$RCLONE_DESTINO/mensuales" --files-only --include "$nombre" | grep -qx "$nombre" || {
    echo "No está $nombre en $RCLONE_DESTINO (ni en diarios ni en mensuales)." >&2
    exit 1
  }
fi

mkdir -p "$destino"
echo "Bajando $nombre de $RCLONE_DESTINO/$carpeta…" >&2
rclone copyto "$RCLONE_DESTINO/$carpeta/$nombre" "$destino/$nombre.tmp"
pg_restore --list "$destino/$nombre.tmp" >/dev/null || {
  rm -f "$destino/$nombre.tmp"
  echo "El archivo bajado está dañado: pruebe con otro respaldo." >&2
  exit 1
}
mv "$destino/$nombre.tmp" "$destino/$nombre"
echo "Bajado: $nombre ($(du -h "$destino/$nombre" | cut -f1))." >&2
echo "$destino/$nombre"
