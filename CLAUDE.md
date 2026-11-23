# Kipfit — guía para Claude Code

Gestión web multi-empresa de gimnasios (familia KIPU): afiliados, planes, control de ingreso en la entrada
con una tablet (tiempo real hacia recepción) y cobros. Migración a la web de la app de escritorio "Control de
Gimnasio". Usa el mismo stack y las mismas reglas base que OrdenKipu (`migue0822/erp-pyme`) y AviKipu
(`migue0822/avikipu`), de los que se tomó el núcleo (autenticación, empresas, sucursales, usuarios, roles, RLS,
licencias). El plan vive en el documento "Plan de migración a web – Control de Gimnasio".

## Stack

- Monorepo pnpm + Turborepo. Solo TypeScript.
- `apps/api`: NestJS (CommonJS), Prisma 7 con `@prisma/adapter-pg`, PostgreSQL.
- `apps/web`: React + Vite (SPA), Tailwind (tonos `stone` + acento `amber`, heredados de AviKipu; la identidad propia se define después), TanStack Query.
- `packages/shared` (`@kip/shared`): esquemas Zod, tipos y utilidades de API y web.
- Pruebas con Vitest y suites de punta a punta en `apps/api/e2e`.

## Comandos

```bash
pnpm install
pnpm db:up                         # Postgres en Docker (puerto 5434, para no chocar con OrdenKipu)
cp .env.example apps/api/.env
pnpm --filter @kip/api db:migrate
pnpm dev                           # API :3002 y web :5175
pnpm typecheck && pnpm test && pnpm build
pnpm --filter @kip/api e2e         # después de build; requiere psql
```

## Reglas no negociables

1. **Dinero exacto:** `Decimal(18,2)` para valores, `Decimal(18,4)` para costos. Viajan como texto.
2. **Aislamiento por empresa:** toda tabla de negocio lleva `empresa_id`; toda consulta filtra por la
   empresa de la sesión. RLS es la segunda barrera: una tabla nueva con `empresa_id` trae en su migración
   `ENABLE ROW LEVEL SECURITY` + la política `aislamiento_empresa` (lo verifica la suite e2e `rls`).
3. **Sucursales desde el inicio:** numeraciones, ingresos y cobros son por sucursal.
4. **Nada se borra:** documentos se anulan; maestros y presentaciones se inactivan. Cambios a `auditoria`.
5. **Consecutivos** con `tomarConsecutivo` (bloqueo `FOR UPDATE` en `numeracion`) dentro de la
   transacción del documento. Prefijos (`PREFIJOS` en `comun/numeracion.ts`) + código de sucursal:
   `RC` recibo, `CJ` turno de caja y `MC` movimiento de caja; los demás se agregan con cada módulo (la migración crea los
   de las sucursales existentes y `crearNumeraciones` los de las nuevas).
6. **Un documento = una transacción.**
7. **Fechas** en UTC (`timestamptz`), se muestran en America/Bogota.
8. **Permisos en el backend** (`@RequierePermiso`); el catálogo está en `packages/shared/src/permisos.ts`
   (todo permiso nuevo también en `CATALOGO_PERMISOS`, lo verifica una prueba).
9. **Autenticación propia:** sesiones en servidor (cookie httpOnly `kip_sesion`), Argon2.

## Estado y diseño (Etapas 0 a 3 hechas, con informes)

- Núcleo: autenticación, empresas, sucursales, usuarios, roles, auditoría, RLS (`kip_app`) y licencias/planes/pagos.
  Permisos en `packages/shared/src/permisos.ts` (empresa, sucursales, usuarios, afiliados, ingresos, informes) y roles
  sugeridos Recepción y Supervisor.
- Migraciones: armadas a mano desde las de AviKipu (no verificadas con `prisma migrate diff`); verifíquelas con
  `scripts/verificar-migraciones.sh` en CI antes de desplegar. `ventasMes` de la consola = ingresos vigentes del mes.
- Reglas de diseño para el modo sin conexión (futuro): ids de cliente (UUID), operaciones idempotentes, marcas de
  tiempo del cliente y consecutivos asignados por el servidor al sincronizar.

## Afiliados, planes y membresías (`apps/api/src/afiliados`, `@kip/shared` `esquemas/afiliados.ts`, web `afiliados/`)

- `plan_gimnasio` (`/planes`): `MENSUAL` (por días) o `TIQUETERA` (sesiones dentro de un plazo; `CHECK` sesiones solo en
  tiquetera). Lectura con `afiliados.ver`, escritura con `afiliados.editar`. Editar un plan no cambia lo ya vendido.
- `afiliado` (`/afiliados`, patrón de maestros: `buscar`, `estado`, `pagina`; además `membresia=todas|vigentes|por_vencer|
vencidas|sin`): documento único por empresa (normalizado: sin puntos ni espacios, mayúsculas), `texto_busqueda`,
  sede de inscripción (`sucursal_id`; la membresía sirve en todas las sucursales). Nada se borra: se inactiva.
- `suscripcion` (la "membresía" del afiliado; el nombre evita chocar con `membresia` = usuario en empresa): foto del plan
  y del precio al vender; `fecha_inicio` y `fecha_fin` (el día de inicio cuenta: 30 días desde el 1 terminan el 30);
  tiquetera con `sesiones_total/usadas`; `congelada_desde` y `dias_congelados`; `estado` VIGENTE | ANULADA (anular no borra).
- Reglas (`@kip/shared`: `estadoMembresia`, `inicioRenovacion`, `finMembresia`): estado = SIN_MEMBRESIA, VIGENTE,
  POR_VENCER (≤ 7 días), CONGELADA, VENCIDA o AGOTADA. Vender/renovar bloquea la fila del afiliado `FOR UPDATE`, empieza hoy
  o el día siguiente al fin de la vigente, no en el pasado ni cruzada (409). Descongelar corre la fecha fin esos días y la de
  las que siguen. El afiliado inactivo o el plan inactivo no venden (409).
- El cobro va en la venta (ver "Caja y cobros"); sin `pagos` la membresía queda sin cobro (cortesía o dato de antes). Sin foto,
  huella ni importación del desktop todavía. Suite e2e `afiliados`.

## Ingreso (`apps/api/src/ingresos`, `@kip/shared` `esquemas/ingresos.ts`, web `ingresos/`, menú Ingreso)

- `ingreso` (RLS, por sucursal, nunca se borra): afiliado, membresía usada, `fecha` (día Bogotá), `origen` TABLET |
  RECEPCION, `resultado` PERMITIDO | ALERTA, foto del estado/plan/vencimiento, `alerta_revisada`, anulación con motivo.
- `POST /ingresos { id?, documento, origen }` (`ingresos.registrar`): busca por documento (404 si no existe), bloquea el
  afiliado `FOR UPDATE` y decide con `decidirIngreso` (`@kip/shared`): VIGENTE y POR_VENCER entran; SIN_MEMBRESIA,
  CONGELADA, VENCIDA, AGOTADA, aún no iniciada o afiliado inactivo → ALERTA (no se impide el paso: lo decide recepción).
  **Idempotente**: el `id` (UUID del cliente) repetido devuelve el ya guardado (`repetido: true`), listo para el modo sin
  conexión. La tiquetera gasta **una sesión por día** (`descuenta_sesion`); anular la devuelve (`CHECK` y e2e: sesiones
  usadas = ingresos vigentes que descuentan).
- `GET /ingresos?fecha` (día de la sucursal, totales, alertas y pendientes), `GET /ingresos/afiliado/:id`
  (`afiliados.ver`, historial en la ficha), `PATCH /ingresos/:id/revisar` (recepción acepta la alerta),
  `POST /ingresos/:id/anular { motivo }`. Con licencia vencida solo se consulta.
- **Tiempo real**: `GET /ingresos/eventos` (SSE, `@Sse`) de la sucursal de la sesión; `IngresosService.eventos` es un
  `Subject` en memoria (una sola instancia de la API; si hay varias, hará falta Redis/Postgres NOTIFY). Latido cada 25 s.
  El Caddy interno no comprime ese camino y usa `flush_interval -1`.
- Web: `#/ingreso` = **pantalla de la tablet** (sin menú, teclado numérico grande, resultado de 6 s: verde bienvenido,
  ámbar alerta, rojo error; reintenta con el mismo `id` si falla la red) y `#/ingresos` = **recepción en vivo** (lista
  del día, pitido y resalte en cada ingreso, Aceptar/Anular, registro manual). Suite e2e `ingresos`.

## Caja y cobros (`apps/api/src/caja`, `@kip/shared` `esquemas/caja.ts`, web `caja/`, menú Caja)

- `turno_caja` (RLS, `CJ` + sucursal): lo abre un cajero con una base; **uno abierto por cajero y sucursal** (índice parcial
  `turno_caja_abierto_unico`, solo en el SQL y en `PROPIOS_DEL_SQL`). Al cerrar guarda `contado`, `esperado`, `diferencia`
  y la foto `resumen`: el cuadre de un turno cerrado no cambia. Si no cuadra exige observaciones.
- `recibo` (`RC`, uno por `suscripcion` o por venta de la tienda) + `recibo_pago` (una fila por medio: EFECTIVO, TRANSFERENCIA, NEQUI, DAVIPLATA,
  TARJETA; 1 a 5 distintos, suman exactamente el precio). Se crea **en la misma transacción de la venta**
  (`CajaService.cobrarMembresia`, llamado desde `venderEnTx` cuando vienen `pagos`): exige `caja.operar` y la caja abierta
  del usuario (409 si no). Anular la membresía anula su recibo (`anularReciboDeMembresia`) y solo si la caja del cobro sigue
  abierta; el efectivo no puede quedar en negativo.
- `movimiento_caja` (`MC`): ingreso o egreso de efectivo con concepto; un egreso no puede superar el efectivo que hay;
  se anula (no se borra) y solo con el turno abierto.
- **Cuadre** (`calcularCuadre`, en centavos exactos con `aCentavos/deCentavos`): efectivo esperado = base + cobros en
  efectivo + ingresos − egresos (solo vigentes); los otros medios se informan aparte, no están en la caja.
- **Orden de bloqueo:** afiliado → turno (`FOR SHARE` en cobros y movimientos; el cierre lo toma `FOR UPDATE` y espera a los
  cobros en curso) → numeración. Las salidas de efectivo de un turno se serializan con `pg_advisory_xact_lock('efectivo:…')`
  (con `$executeRaw`: Prisma no lee `void`).
- Endpoints: `GET /caja/actual`, `POST /caja/abrir`, `POST /caja/turnos/:id/cerrar` (`@PermitidoEnSoloLectura`: se puede
  cerrar con la licencia vencida), `GET /caja/turnos?desde&hasta`, `GET /caja/turnos/:id`, `POST /caja/movimientos`,
  `POST /caja/movimientos/:id/anular`, `GET /recibos/:id` (`afiliados.ver`, para imprimir). Permisos: `caja.operar` (su
  caja; Recepción y Supervisor) y `caja.supervisar` (ver y cerrar la de todos; Supervisor).
- Web: `#/caja` (abrir, cuadre en vivo, ingreso/egreso, cerrar con vista previa de la diferencia, cajas del día),
  panel de cobro en la ficha del afiliado (pago combinado, "Sin cobro" para cortesías, aviso si no hay caja abierta) y
  `#/recibo?id=` (recibo imprimible en otra pestaña). Suite e2e `caja`.

## Foto del afiliado (`afiliado_foto`, `afiliados/Foto.tsx`)

- Tabla aparte (`afiliado_foto`, RLS, `CHECK` ≤ 300 KB) para no arrastrar los bytes en las consultas. El navegador la recorta al
  centro en cuadrado y la reduce a 360 px JPEG (`EditorFoto`: cámara con `getUserMedia` o subir imagen); la API acepta
  JPEG/PNG/WebP **por sus bytes** (`tipoDeImagen`, no SVG). `PUT /afiliados/:id/foto { foto: dataURL | null }`
  (`afiliados.editar`, auditoría `cambiar_foto`/`quitar_foto`) y `GET /afiliados/:id/foto` (`afiliados.ver` o
  `ingresos.registrar`; caché larga con `?v=`).
- `AfiliadoResumen.fotoVersion` e `IngresoVista.fotoVersion` (null = sin foto) alimentan `Avatar`: ficha, lista, recepción y la
  tablet de la entrada (foto grande al ingresar). Suite e2e `foto`. Nunca leer `afiliado_foto.contenido` fuera de `leerFoto`.

## Importar afiliados desde Excel (`afiliados/importar.ts`, `Importar.tsx`, `POST /afiliados/importar`)

- Afiliados → "Importar desde Excel" (`afiliados.editar`): plantilla `.xlsx` armada en el navegador con `exceljs` (carga
  diferida; hojas Afiliados, Planes con la lista de validación e Instrucciones). Columnas por **título** (el orden no importa):
  Documento\*, Nombre completo\*, Teléfono, Fecha de nacimiento, Notas, Plan, Vence el, Sesiones restantes. Números y fechas
  de Excel se leen por su **valor** (`textoCelda`); fechas AAAA-MM-DD o DD/MM/AAAA.
- Cada fila se valida con `afiliadoImportarFilaSchema` (`@kip/shared`) y los errores salen por fila de Excel y columna; si hay
  alguno no se envía nada. La API repite las reglas (planes de la empresa y activos, sesiones ≤ las del plan, documentos
  repetidos en el archivo → 400 «Fila N: …»), máx. 2.000 filas, **todo o nada** en una transacción (`timeout` 120 s).
- Los documentos que ya existen se **omiten sin modificar**. La membresía entra «como estaba»: plan + `Vence el` (puede ser
  pasada → queda Vencida), inicio = fin − (días − 1), precio del plan, `sesiones_usadas` = total − restantes; **sin recibo ni
  caja**. Auditoría `importar` (una por archivo). Suite e2e `importar`; prueba de lectura en `importar.test.ts`.

## Informes (`apps/api/src/informes`, `@kip/shared` `esquemas/informes.ts`, web `informes/Informes.tsx`, menú Informes)

- Todos con `informes.ver`, de la **sucursal de la sesión**, por `?desde&hasta` (AAAA-MM-DD, días de Colombia, máx. 366
  días: `periodoSchema`). Solo cuenta lo vigente (recibos e ingresos anulados no suman).
- `GET /informes/cobros` (total, por medio, por día, por plan), `/ingresos` (total, personas distintas, alertas, por día,
  por hora de Colombia, más asiduos), `/vencimientos?dias&vencidasDias` (última membresía vigente de cada afiliado activo;
  por vencer en N días y vencidas hace ≤ M; las congeladas y las renovadas por adelantado no salen), `/cajas` (turnos
  abiertos en el período con su cuadre; el cerrado usa su foto).
- La web (una pantalla, cuatro pestañas): períodos rápidos, CSV para Excel (`;`, BOM), imprimir y, en Vencimientos, botón de
  WhatsApp (`enlaceWhatsApp` + `mensajeVencimiento`; solo celulares colombianos). Suite e2e `informes`.

## Tienda: productos e inventario (`apps/api/src/tienda`, `@kip/shared` `esquemas/tienda.ts`, web `tienda/`, menú Tienda)

- Productos (`/tienda/productos`, patrón de maestros sin DELETE; `tienda.ver` lee, `tienda.productos` escribe): maestro por
  **empresa** (`codigo` opcional único en mayúsculas y sin espacios, `precio_venta`, `texto_busqueda`); la **existencia es por
  sucursal** (`existencia`: cantidad entera, `valor` en pesos = fuente de verdad, `costo_promedio` derivado; `CHECK` no negativos).
  Cambiar el precio deja `cambiar_precio` en auditoría y no toca lo vendido.
- Todo movimiento nace de un **documento** (`documento` + `documento_linea`, prefijos `EN` entrada, `AJ` ajuste, `VT` venta y
  `DV` devolución + código de sucursal) y pasa por `aplicarPasos` (`tienda/movimientos.ts`, igual que AviKipu): bloquea las
  existencias en orden de id, valida que ninguna quede negativa, actualiza y deja el kardex (`movimiento_inventario`).
  **Costo promedio ponderado por valor total** (`tienda/costo.ts`). Orden de bloqueo: numeración → existencias.
- `POST /tienda/inventario/entradas` (`tienda.inventario`): unidades × costo digitado = valor exacto de la línea.
  `POST /tienda/inventario/ajustes`: por producto `sistema` y `contado`; si la existencia cambió desde que se cargó → 409 (la
  pantalla recarga sin perder lo digitado); motivos CONTEO, MERMA, DANADO, VENCIDO, CONSUMO, OTRO (todos menos CONTEO exigen
  observaciones); lo que falta sale y lo que sobra entra al costo promedio. `POST …/documentos/:id/anular` (`tienda.anular`):
  reversa con el valor exacto y falla si la existencia quedaría negativa; ventas y devoluciones se anulan desde Ventas.
- **Costos solo con `tienda.costos`**: costo promedio, valor, costos de líneas y kardex llegan `null` sin él y la web quita
  las columnas. Roles sugeridos: Recepción = ver + vender; Supervisor = todos los `tienda.*`.
  Los roles que ya existen en una empresa no reciben permisos nuevos: agréguelos en Administración → Roles.
- Suite e2e `tienda-inventario`.

## Tienda: ventas, devoluciones e informe (`apps/api/src/tienda/ventas.service.ts`, web `tienda/Vender.tsx`, `Ventas.tsx`, `VentaImpresa.tsx`)

- **Venta** (`POST /tienda/ventas`, `tienda.vender` + `caja.operar`): documento `VENTA` (`VT`) cobrado **por la caja abierta del
  cajero** (409 si no tiene). Cuerpo: líneas `{productoId, cantidad}`, `total` que vio el cajero (si los precios cambiaron → 409),
  `pagos` (pago combinado, como en membresías), `recibido` (efectivo entregado; `documento.recibido/cambio`), `afiliadoId`
  opcional (sin él, mostrador). Todo en una transacción: turno (compartido) → numeración VT → documento → recibo `RC`
  (`recibo.documento_id`, sin suscripción; `CajaService.cobrarVenta`) → `aplicarPasos` → líneas con `precio`, `total` y `valor` =
  **costo** de lo vendido (positivo). El cuadre cuenta el efectivo igual que los cobros de membresía; el informe de cobros las
  agrupa como plan «Tienda». `recibo` ahora exige suscripción **o** documento (`CHECK`); `ReciboVista.afiliado*` pueden ser null.
- **Anular venta** (`POST /tienda/ventas/:id/anular`, `tienda.anular`): solo sin devoluciones vigentes y con la caja del cobro
  abierta (`anularReciboDeVenta`); reversa el inventario con el valor exacto.
- **Devolución** (`POST /tienda/ventas/:id/devolucion`, `tienda.vender`, motivo obligatorio): hasta lo vendido menos lo ya
  devuelto; reintegra al precio de la línea y al costo proporcional (al completar la línea, exactamente el costo que falta).
  `medio` EFECTIVO = egreso de la caja abierta de quien devuelve (`movimiento_caja.documento_id`, `exigirEfectivo`; ese egreso
  no se anula desde Caja → 409) u OTRO = no toca la caja. `POST /tienda/ventas/devoluciones/:id/anular` (`tienda.anular`)
  anula el egreso (su caja abierta) y reversa el inventario (falla si esas unidades ya se vendieron).
- **Orden de bloqueo:** documento (venta, luego devolución) → turno → numeración → existencias.
- `GET /tienda/ventas?desde&hasta&buscar` (hoy por defecto) y `GET /tienda/ventas/:id` (`tienda.ver`; costos `null` sin
  `tienda.costos`; incluye pagos, devoluciones, `anulable`). Informe `GET /informes/tienda` (`informes.ver`): neto = ventas −
  devoluciones vigentes por día, producto y medio; costo/utilidad/margen solo con `tienda.costos`.
- Web: Tienda → Vender (POS: búsqueda o código exacto + Enter, cuenta, cliente opcional, pago combinado, cambio; tras cobrar,
  enlace a la tirilla `#/venta?id=`), Ventas (detalle, devolver, anular) e Informes → Tienda. Los roles existentes necesitan
  `tienda.vender` + `caja.operar` (Recepción ya los trae si es nueva). Suite e2e `tienda-ventas`.
- **Tirilla de cierre** (`caja/CierreImpreso.tsx`, `#/cierre?id=&formato=resumido|completo`, `caja.operar`/`caja.supervisar`):
  al cerrar la caja se ofrece imprimirla; también en el detalle de cada caja y en Informes → Cajas (columna Tirilla). Resumida =
  cuadre, cobros por medio y observaciones; completa = además recibos, vendido por producto de la tienda, devoluciones en efectivo
  e ingresos/egresos (`GET /caja/turnos/:id` trae `empresa`, `sucursal`, `productos` y `devoluciones`). Anulados salen tachados.
- **Caja obligatoria en pantalla** (`caja/ExigirCaja.tsx`): Afiliados → «Nuevo afiliado» y Tienda → Vender solo muestran su
  contenido con la caja del usuario abierta; si no, piden abrirla (base en efectivo) allí mismo. El servidor ya la exige al cobrar.
- **Recibo por WhatsApp** (`tienda/WhatsAppVenta.tsx`, `mensajeVenta` en `@kip/shared`): al cobrar y en el detalle de la venta;
  usa el celular del afiliado (`VentaDetalle.afiliadoTelefono`) y, si es cliente de mostrador, **pregunta el celular**
  (`enlaceWhatsApp`, solo celulares colombianos). WhatsApp web solo manda texto: el mensaje lleva el detalle y el total.
- Sigue: contrato de licencia adaptable a cada app KIPU; huella y modo sin conexión (después).

## Registro de empresas, licencias y demostraciones (`apps/api/src/plataforma`, `@kip/shared` `plataforma.ts`)

- Página de ingreso → "Registrarla". `REGISTRO_PUBLICO=no` lo cierra; con `REGISTRO_CODIGO` queda abierto
  solo para quien tenga el código. Quien se registra queda en **demostración** de `DEMO_DIAS` días (15; 0 = sin
  vencimiento).
- **Licencia** en `empresa` (como OrdenKipu): `plan_id`, `pagado_hasta` (date, inclusive; null = sin vencimiento),
  `licencia_estado` ACTIVA | SUSPENDIDA | RETIRADA (`activa = false`). `enDemo` = con vencimiento y sin pagos
  vigentes. Vencida o suspendida = **solo lectura** (`SesionGuard`: nada que no sea GET en rutas con empresa,
  `mensajeSoloLectura`) salvo `@PermitidoEnSoloLectura()`. `perfil.empresa.licencia` →
  `AvisoLicencia` en el menú. `plan` (sin `empresa_id`: precio, `max_usuarios`, `max_sucursales`;
  `exigirCupoPlan` al crear o reactivar) y `pago_licencia` (RLS; `kip_app` no escribe ninguno de los dos).
- **Se administra desde la consola de plataforma de OrdenKipu** (selector de sistema): `/plataforma/*`
  (empresas, licencia, pagos, anular, planes) con las mismas formas de respuesta que OrdenKipu. Sin sesión de
  Kipfit (`@Publico()` + `ClavePlataformaGuard`: cabecera `X-Plataforma-Clave` = `PLATAFORMA_CLAVE`, mínimo 16
  caracteres, vacía = 404; `X-Plataforma-Usuario` = quién, va a `auditoria.despues.por` y a
  `pago_licencia.registrado_por`). Solo por la red de Docker `kipu-api` (`kipfit-api:3002`); el Caddy interno
  responde 404 a `/api/v1/plataforma*` desde internet. Suite e2e `plataforma`.

## Despliegue (`despliegue/`, guía en `despliegue/LEAME.md`)

- En el **mismo servidor de OrdenKipu**, con su dominio de DuckDNS. `Dockerfile` (raíz): `api` (aplica
  `prisma migrate deploy` al arrancar, puerto 3002) y `web` (Caddy **interno** sin HTTPS: SPA y `/api` → API).
  `despliegue/docker-compose.yml` (proyecto `kipfit`): postgres, api, web y respaldo; sin puertos publicados.
- El HTTPS lo pone el Caddy de OrdenKipu: importa `~/erp-pyme/despliegue/sitios/*.caddy` y comparte la red de Docker
  `kipu` (la crea OrdenKipu; aquí es `external`; la API además está en `kipu-api` para la consola). `conectar.sh` escribe `sitio.caddy` con el `DOMINIO` de `.env` y
  recarga ese Caddy; el web de Kipfit está en `kipu` con el alias `kipfit-web`. Dos Caddy delante → `TRUST_PROXY=2`
  y el interno confía en `private_ranges`.
- Respaldos (`despliegue/respaldo/`, `kip-*.dump`, 2:45), `actualizar.sh` y `recuperar.sh` como en OrdenKipu; la nube
  usa la misma conexión de rclone en otra carpeta. El workflow `despliegue.yml` lo prueba detrás de un Caddy que hace
  de OrdenKipu (`.github/despliegue-prueba/`): HTTPS, registro con código, cookie segura, IP real, respaldo y
  recuperación desde la "nube".

## Migraciones

- Cada cambio de `schema.prisma` va con su carpeta en `prisma/migrations`. Los índices parciales y las
  reglas `CHECK` solo existen en el SQL. El CI (`base-de-datos`) aplica las migraciones a un PostgreSQL
  real, verifica que coincidan con el esquema (`scripts/verificar-migraciones.sh`; un índice parcial nuevo
  se agrega ahí a `PROPIOS_DEL_SQL`) y corre las suites e2e.

## Convenciones

- Dominio en español; términos técnicos en inglés. Base en `snake_case` (`@map`), código en `camelCase`.
- API REST bajo `/api/v1`. Validar con los esquemas Zod de `@kip/shared` (`ZodPipe`).
- Mensajes al usuario en español, tratando de "usted".
- Git: `main` siempre desplegable; ramas por funcionalidad; commits `feat:`, `fix:`, `chore:`, `docs:`.

## Plan

1. ✅ Etapa 0: esqueleto Kipfit (núcleo de AviKipu), licencias desde la consola de OrdenKipu.
2. ✅ Afiliados y planes: fichas, membresías (vender, renovar, congelar, anular) y vencimientos. Falta: foto, importación desde la app de escritorio.
3. ✅ Ingreso: ventana para tablet con SSE hacia recepción. Falta (opcional): foto/huella en la entrada.
4. ✅ Cobros y caja (recibos, pago combinado, turnos, cuadre). Informes ✅. Tienda ✅ (inventario, ventas por la caja, devoluciones). Sigue: contrato de licencia adaptable a cada app KIPU.
5. Respaldos y despliegue en el servidor de Oracle junto a OrdenKipu y AviKipu; modo sin conexión (explorar).
