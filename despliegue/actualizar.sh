#!/usr/bin/env bash
# Actualiza el sistema en el servidor a la última versión de main:
# respaldo primero, luego descarga, reconstruye y reinicia (las migraciones se aplican al arrancar la API).
#   cd ~/kipfit/despliegue && ./actualizar.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "1/4 Respaldo antes de actualizar…"
docker compose exec -T respaldo respaldar.sh

echo "2/4 Descargando la última versión…"
git -C .. checkout main
git -C .. pull --ff-only

echo "3/4 Construyendo y reiniciando (puede tardar unos minutos)…"
docker compose up -d --build

echo "4/4 Limpiando imágenes viejas…"
docker image prune -f >/dev/null

echo "Esperando a la API…"
for _ in $(seq 1 60); do
  estado=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q api)" 2>/dev/null || true)
  [ "$estado" = "healthy" ] && { echo "Listo: el sistema quedó actualizado."; exit 0; }
  sleep 3
done
echo "La API no respondió. Revise: docker compose logs --tail 100 api"
exit 1
