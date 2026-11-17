#!/usr/bin/env bash
# Simulacro sin riesgo: baja de la nube un respaldo (el más reciente o el indicado), lo restaura en una base
# temporal, cuenta empresas, sucursales y usuarios, y borra todo. No toca la base en uso.
#   docker compose exec respaldo probar-nube.sh [kip-AAAAMMDD-HHMM.dump]
set -euo pipefail
inicio=$(date +%s)
carpeta="${RESPALDO_DIR:-/respaldos}/prueba-nube"
rm -rf "$carpeta"
trap 'rm -rf "$carpeta"' EXIT
archivo=$(bajar-de-la-nube.sh "${1:-}" "$carpeta")
probar-restauracion.sh "$archivo"
echo "La copia de la nube sirve. Bajarla y restaurarla tomó $(($(date +%s) - inicio)) segundos."
