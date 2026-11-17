#!/usr/bin/env bash
# Publica Kipfit con HTTPS a través del Caddy de OrdenKipu (el que tiene los puertos 80 y 443):
# escribe su sitio (sitio.caddy con el DOMINIO de .env) en la carpeta sitios/ de OrdenKipu y recarga ese Caddy,
# que saca el certificado del dominio. Se corre al instalar y cada vez que cambie DOMINIO.
#   cd ~/kipfit/despliegue && ./conectar.sh
set -euo pipefail
cd "$(dirname "$0")"

falla() {
  printf '\nNO SE PUDO: %s\n' "$1" >&2
  exit 1
}
valor() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d "\"'\r "; }

[ -f .env ] || falla "falta despliegue/.env (guía, paso 3)."
dominio=$(valor DOMINIO)
[ -n "$dominio" ] || falla "DOMINIO está vacío en despliegue/.env."
[[ $dominio =~ ^[a-z0-9.-]+$ ]] || falla "DOMINIO debe ser solo el nombre, sin https:// ni barras (ej. kipfit.duckdns.org)."
ordenkipu=$(valor ORDENKIPU_DIR)
ordenkipu=${ordenkipu:-$HOME/erp-pyme/despliegue}
[ -f "$ordenkipu/docker-compose.yml" ] || falla "no está OrdenKipu en $ordenkipu (revise ORDENKIPU_DIR en .env)."
grep -q '/etc/caddy/sitios' "$ordenkipu/Caddyfile" ||
  falla "OrdenKipu no está actualizado para atender otros sistemas: cd $ordenkipu && ./actualizar.sh"

mkdir -p "$ordenkipu/sitios"
sed "s/DOMINIO_KIPFIT/$dominio/" sitio.caddy >"$ordenkipu/sitios/kipfit.caddy"
echo "Sitio escrito: $ordenkipu/sitios/kipfit.caddy ($dominio)"

docker compose -f "$ordenkipu/docker-compose.yml" exec -T web caddy reload --config /etc/caddy/Caddyfile ||
  falla "el Caddy de OrdenKipu no aceptó el sitio. Revise: docker compose -f $ordenkipu/docker-compose.yml logs --tail 50 web"
echo "Listo. En uno o dos minutos abra https://$dominio (la primera vez Caddy saca el certificado)."
