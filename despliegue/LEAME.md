# Instalar Kipfit en el servidor de OrdenKipu

Kipfit se instala **en el mismo servidor de Oracle** donde ya funciona OrdenKipu, con su propio dominio de DuckDNS
y su propia base de datos. No se abre ningún puerto nuevo: el Caddy de OrdenKipu (el que tiene los puertos 80 y 443)
recibe las visitas de los dos dominios, saca el certificado HTTPS de cada uno y le pasa a Kipfit las suyas por una
red interna de Docker llamada `kipu`.

```
Internet ──443──▶ Caddy de OrdenKipu ──┬──▶ OrdenKipu   (erppymes.duckdns.org)
                                        └──▶ Kipfit     (su dominio nuevo, red "kipu")
```

Cada sistema tiene sus contenedores, su base, sus respaldos y su `.env`. Si Kipfit se detiene, OrdenKipu sigue igual.

**Antes de empezar:** OrdenKipu debe tener el cambio que le permite atender otros sistemas (PR "compartir el servidor
con otros sistemas" de `erp-pyme`, ya unido a `main`). En el servidor:

```bash
cd ~/erp-pyme/despliegue && ./actualizar.sh
```

Para entrar al servidor, desde PowerShell en su computador:

```powershell
ssh -i $HOME\.ssh\oracle_erp ubuntu@157.137.198.151
```

## 1. El dominio en DuckDNS

1. Entre a <https://www.duckdns.org> con la misma cuenta de OrdenKipu.
2. En **sub domain** escriba el nombre (por ejemplo `kipfit`) y pulse **add domain**.
3. En la fila nueva, en **current ip**, escriba la IP del servidor `157.137.198.151` y pulse **update ip** (debe ser
   la misma IP que tiene el dominio de OrdenKipu).

La dirección será `kipfit.duckdns.org` (o el nombre que haya escogido).

## 2. Traer el programa al servidor

El repositorio es privado y GitHub no deja usar la misma llave de OrdenKipu en otro repositorio: se crea una llave
nueva solo para Kipfit. En el servidor:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_kipfit -N ""
printf 'Host github-kipfit\n  HostName github.com\n  IdentityFile ~/.ssh/github_kipfit\n' >> ~/.ssh/config
cat ~/.ssh/github_kipfit.pub
```

Copie la línea que muestra `cat` (empieza por `ssh-ed25519`). En GitHub: repositorio **kipfit → Settings → Deploy
keys → Add deploy key**, título `servidor oracle`, pegue la línea, **sin** marcar "Allow write access" → **Add key**.
Luego en el servidor:

```bash
cd ~
git clone git@github-kipfit:migue0822/kipfit.git
cd kipfit/despliegue
```

(La primera vez pregunta si confía en github.com: escriba `yes`.)

## 3. Configurar

```bash
cp .env.ejemplo .env
openssl rand -hex 24   # copie el resultado: será POSTGRES_PASSWORD
openssl rand -hex 32   # copie el resultado: será PLATAFORMA_CLAVE
nano .env
```

Llene `DOMINIO` (el del paso 1, sin `https://`), `POSTGRES_PASSWORD` y `PLATAFORMA_CLAVE` (la misma va en
`KIPFIT_CLAVE` del `.env` de OrdenKipu, ver "Licencias y demostraciones"). `REGISTRO_CODIGO` puede quedar vacío: las
empresas se crean desde la consola de OrdenKipu. Guarde con **Ctrl+O**,
Enter, y salga con **Ctrl+X**. Guarde también esos valores en un lugar seguro suyo, aparte de los de OrdenKipu.

## 4. Arrancar y publicar

La primera vez tarda unos 10 minutos construyendo:

```bash
docker compose up -d --build
docker compose ps
./conectar.sh
```

Los cuatro contenedores deben quedar `running` (la API, `healthy` después de un minuto). `conectar.sh` deja el sitio
de Kipfit en `~/erp-pyme/despliegue/sitios/kipfit.caddy` y recarga el Caddy de OrdenKipu. En uno o dos minutos abra
`https://SU_DOMINIO`: debe salir la pantalla de ingreso de Kipfit con el candado.

Si no abre:

- `docker compose ps`: los cuatro deben estar arriba.
- `docker compose -f ~/erp-pyme/despliegue/docker-compose.yml logs --tail 50 web`: el certificado del dominio nuevo
  (si dice que el dominio no apunta al servidor, revise el paso 1).
- `docker compose logs --tail 50 api`: errores de la API.

## 5. La empresa piloto

1. Créela desde la consola de plataforma de OrdenKipu (sistema **Kipfit**, ver "Licencias y demostraciones"). Si
   prefiere, también se registra en la pantalla de ingreso de Kipfit con el **código de registro** del `.env` (queda
   en demostración de `DEMO_DIAS` días).
2. **Administración → Sucursales**: revise la sucursal principal y cree las demás sedes.
3. **Administración → Usuarios**: cree el usuario de cada persona de recepción con el rol **Recepción** (y **Supervisor**
   para quien revise informes).
4. Las pantallas de afiliados, ingreso en la tablet e informes llegan en las etapas siguientes del plan.

## 6. Respaldos en Google Drive

Se usa la misma conexión de Google Drive que ya tiene OrdenKipu, en otra carpeta:

```bash
cd ~/kipfit/despliegue
mkdir -p rclone
sudo install -m 600 -o ubuntu -g ubuntu ~/erp-pyme/despliegue/rclone/rclone.conf rclone/rclone.conf
grep '^\[' rclone/rclone.conf     # muestra el nombre de la conexión, por ejemplo [gdrive]
grep RCLONE_DESTINO ~/erp-pyme/despliegue/.env
nano .env                         # RCLONE_DESTINO=gdrive:respaldos-kipfit  (el mismo nombre, otra carpeta)
docker compose up -d respaldo
docker compose exec respaldo respaldar.sh
```

Debe terminar con "Copia en la nube al día". En Google Drive aparece la carpeta `respaldos-kipfit`.

### Cómo funcionan

- Todos los días a las 2:45 a. m. (`RESPALDO_HORA`; OrdenKipu se respalda a las 2:30) se guarda un respaldo completo
  en `~/kipfit/despliegue/respaldos/diarios` (14 días) y en Drive (60 días). El del día 1 de cada mes se guarda 13
  meses en `mensuales`.
- Los domingos el respaldo se baja de Drive y se restaura en una base temporal para probar que sirve.
- `./actualizar.sh` hace un respaldo antes de actualizar.

### Restaurar (solo si se dañó o se borró información)

```bash
cd ~/kipfit/despliegue
./recuperar.sh --lista                       # respaldos disponibles
./recuperar.sh kip-AAAAMMDD-HHMM.dump        # restaura ese (pide escribir SI)
```

La base anterior no se borra: queda como `kipfit_antes_<fecha>`.

## Licencias y demostraciones (consola de OrdenKipu)

Las empresas de Kipfit se crean y se administran en la **consola de plataforma de OrdenKipu**
(`https://erppymes.duckdns.org/#/plataforma`), escogiendo arriba el sistema **Kipfit**: crear empresas con días de
demostración, plan, vencimiento, suspender o retirar, y registrar pagos. La consola habla con Kipfit por la red interna
del servidor (`kipu-api`); desde internet esa parte de Kipfit no existe.

Para conectarlas (una sola vez), la misma clave en los dos `.env`:

```bash
openssl rand -hex 32                                  # copie el resultado
nano ~/kipfit/despliegue/.env                        # PLATAFORMA_CLAVE=<la clave>
nano ~/erp-pyme/despliegue/.env                       # KIPFIT_CLAVE=<la misma clave>
cd ~/kipfit/despliegue && docker compose up -d api
cd ~/erp-pyme/despliegue && docker compose up -d api
```

- Al terminar la demostración (o vencer lo pagado) la empresa queda en **solo lectura**: consulta, imprime y cierra
  la caja, pero no vende ni registra nada. Ve un aviso con el botón para escribirle por WhatsApp.
- Al registrar el primer pago termina la demostración y el vencimiento se corre los meses pagados.

## Si se pierde el servidor

1. Recupere primero OrdenKipu con su guía (`~/erp-pyme/despliegue/LEAME.md`, "Si se pierde el servidor").
2. Repita los pasos 2 y 3 de esta guía con los valores que guardó aparte, y deje `rclone/rclone.conf` como en el paso 6.
3. Recupere y publique:

   ```bash
   cd ~/kipfit/despliegue && ./recuperar.sh && ./conectar.sh
   ```

4. En DuckDNS ponga la IP del servidor nuevo también en el dominio de Kipfit.

Simulacro sin riesgo (cada mes, junto con el de OrdenKipu): `./recuperar.sh --simulacro`.

## Actualizar

Cuando haya hecho merge de un PR de Kipfit en GitHub, en el servidor:

```bash
cd ~/kipfit/despliegue && ./actualizar.sh
```

Hace un respaldo, descarga `main`, reconstruye, reinicia (aplicando las migraciones) y espera a que la API responda.
Kipfit queda fuera de servicio uno o dos minutos (OrdenKipu no se detiene): hágalo fuera del horario del negocio.

Si alguna vez actualiza OrdenKipu, Kipfit no se afecta (solo unos segundos mientras se reinicia el Caddy).

## Comandos útiles

```bash
cd ~/kipfit/despliegue
docker compose ps                     # estado
docker compose logs --tail 100 api    # errores de la API
docker compose restart api            # reiniciar la API
docker stats --no-stream              # memoria y CPU de todos los contenedores (de los dos sistemas)
df -h /                               # espacio en disco
```

### Registro de empresas

El registro queda **cerrado** salvo para quien tenga `REGISTRO_CODIGO`. Para cambiar el código (o dejarlo vacío y
cerrarlo del todo):

```bash
cd ~/kipfit/despliegue
nano .env                     # REGISTRO_CODIGO=...   (Ctrl+O, Enter, Ctrl+X)
docker compose up -d api      # la API toma el cambio
```

### Quitar Kipfit del servidor

```bash
rm ~/erp-pyme/despliegue/sitios/kipfit.caddy
docker compose -f ~/erp-pyme/despliegue/docker-compose.yml exec web caddy reload --config /etc/caddy/Caddyfile
cd ~/kipfit/despliegue && docker compose down    # sin -v: la base queda guardada en Docker
```

## Seguridad

- `despliegue/.env` y `despliegue/rclone/` tienen claves: nunca se suben a GitHub (están en `.gitignore`).
- La base no tiene puertos abiertos y Kipfit tampoco: solo se llega a él por el Caddy de OrdenKipu, con HTTPS.
- El ingreso se bloquea 15 minutos tras 10 contraseñas erradas para un mismo correo (o 30 desde una misma IP).
- La llave `github_kipfit` solo puede leer el repositorio (sin "Allow write access").
