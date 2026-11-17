#!/usr/bin/env bash
# Hace un respaldo cada día a RESPALDO_HORA (hora de Bogotá). Corre siempre en el contenedor "respaldo".
set -uo pipefail
HORA=${RESPALDO_HORA:-02:30}

echo "Respaldos programados todos los días a las $HORA (America/Bogota)."
while true; do
  ahora=$(date +%s)
  siguiente=$(date -d "today $HORA" +%s)
  [ "$siguiente" -le "$ahora" ] && siguiente=$(date -d "tomorrow $HORA" +%s)
  echo "Próximo respaldo: $(date -d "@$siguiente" '+%Y-%m-%d %H:%M')"
  sleep $((siguiente - ahora))
  respaldar.sh || echo "El respaldo falló; se reintenta mañana."
done
