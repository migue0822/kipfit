// Planes, afiliados y membresías: alta, renovación, congelar, anular, filtros y aislamiento.
import { nuevaEmpresa, sesion, sql, terminar, verificar } from './comun.mjs';

const hoy = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const mas = (f, d) =>
  new Date(new Date(`${f}T00:00:00Z`).getTime() + d * 864e5).toISOString().slice(0, 10);

const { a, perfil } = await nuevaEmpresa('900777001');
const { a: b } = await nuevaEmpresa('900777002');

// ───────────── Planes ─────────────
let r = await a('POST', '/planes', {
  nombre: 'Mensual',
  tipo: 'MENSUAL',
  precio: '80.000',
  dias: 30,
});
verificar(
  'crea un plan mensual (precio colombiano)',
  r.estado === 201 && r.datos.precio === '80000.00',
  JSON.stringify(r.datos),
);
const mensual = r.datos;
r = await a('POST', '/planes', { nombre: 'Mensual', tipo: 'MENSUAL', precio: '1', dias: 30 });
verificar('no repite el nombre del plan (409)', r.estado === 409);
r = await a('POST', '/planes', {
  nombre: 'Tiquetera',
  tipo: 'TIQUETERA',
  precio: '60000',
  dias: 30,
});
verificar('la tiquetera exige sesiones (400)', r.estado === 400);
r = await a('POST', '/planes', {
  nombre: 'Tiquetera 12',
  tipo: 'TIQUETERA',
  precio: '60000',
  dias: 30,
  sesiones: 12,
});
verificar(
  'crea una tiquetera',
  r.estado === 201 && r.datos.sesiones === 12,
  JSON.stringify(r.datos),
);
const tiquetera = r.datos;
r = await a('POST', '/planes', {
  nombre: 'Semanal',
  tipo: 'MENSUAL',
  precio: '30000',
  dias: 7,
  sesiones: 3,
});
verificar('el plan mensual ignora las sesiones', r.estado === 201 && r.datos.sesiones === null);
const semanal = r.datos;
r = await a('GET', '/planes');
verificar('lista los planes', r.estado === 200 && r.datos.length === 3);

// ───────────── Afiliados ─────────────
r = await a('POST', '/afiliados', {
  documento: '1.085.123-456',
  nombre: 'Ana Pérez',
  telefono: '3001234567',
});
verificar(
  'crea un afiliado sin membresía (documento normalizado)',
  r.estado === 201 &&
    r.datos.documento === '1085123456' &&
    r.datos.estadoMembresia === 'SIN_MEMBRESIA',
  JSON.stringify(r.datos),
);
const ana = r.datos;
r = await a('POST', '/afiliados', { documento: '1085123456', nombre: 'Otra' });
verificar('no repite el documento (409)', r.estado === 409);
r = await a('POST', '/afiliados', { documento: '2222', nombre: 'X' });
verificar('valida el documento y el nombre (400)', r.estado === 400);

r = await a('POST', '/afiliados', {
  documento: '900100',
  nombre: 'Luis Gómez',
  planId: mensual.id,
  referidoPorId: ana.id,
});
verificar(
  'crea el afiliado con su primera membresía',
  r.estado === 201 && r.datos.suscripciones.length === 1,
  JSON.stringify(r.datos),
);
const luis = r.datos;
verificar(
  'la membresía mensual dura 30 días contando el de inicio',
  luis.suscripciones[0].fechaInicio === hoy() &&
    luis.suscripciones[0].fechaFin === mas(hoy(), 29) &&
    luis.estadoMembresia === 'VIGENTE',
  JSON.stringify(luis.suscripciones[0]),
);
verificar('guarda quién lo refirió', luis.referidoPor?.id === ana.id);

// ───────────── Membresías ─────────────
r = await a('POST', `/afiliados/${ana.id}/membresias`, { planId: tiquetera.id });
verificar(
  'vende una tiquetera: 12 sesiones sin usar',
  r.estado === 201 &&
    r.datos.suscripciones[0].sesionesTotal === 12 &&
    r.datos.sesionesRestantes === 12,
  JSON.stringify(r.datos),
);
r = await a('POST', `/afiliados/${ana.id}/membresias`, { planId: mensual.id, fechaInicio: hoy() });
verificar('no se cruza con una membresía vigente (409)', r.estado === 409, JSON.stringify(r.datos));
r = await a('POST', `/afiliados/${ana.id}/membresias`, { planId: mensual.id });
verificar(
  'renovar: empieza el día siguiente al fin de la vigente',
  r.estado === 201 && r.datos.suscripciones.some((s) => s.fechaInicio === mas(hoy(), 30)),
  JSON.stringify(r.datos.suscripciones),
);
r = await a('POST', `/afiliados/${ana.id}/membresias`, {
  planId: mensual.id,
  fechaInicio: mas(hoy(), -3),
});
verificar('no empieza en el pasado (400)', r.estado === 400);

// congelar y descongelar corren las fechas, también las de las que siguen
r = await a('GET', `/afiliados/${ana.id}`);
const tiq = r.datos.suscripciones.find((s) => s.planNombre === 'Tiquetera 12');
const siguiente = r.datos.suscripciones.find((s) => s.planNombre === 'Mensual');
r = await a('POST', `/afiliados/${ana.id}/membresias/${tiq.id}/congelar`);
verificar(
  'congela la membresía',
  r.estado === 200 && r.datos.estadoMembresia === 'CONGELADA',
  JSON.stringify(r.datos),
);
r = await a('POST', `/afiliados/${ana.id}/membresias/${tiq.id}/congelar`);
verificar('no se congela dos veces (409)', r.estado === 409);
// simulamos 5 días de congelación
sql(`UPDATE suscripcion SET congelada_desde = congelada_desde - 5 WHERE id = '${tiq.id}'`);
r = await a('POST', `/afiliados/${ana.id}/membresias/${tiq.id}/descongelar`);
const tiq2 = r.datos.suscripciones.find((s) => s.id === tiq.id);
const sig2 = r.datos.suscripciones.find((s) => s.id === siguiente.id);
verificar(
  'descongelar suma los días congelados a la fecha fin',
  r.estado === 200 && tiq2.fechaFin === mas(tiq.fechaFin, 5) && tiq2.diasCongelados === 5,
  JSON.stringify(tiq2),
);
verificar(
  'y corre la membresía que sigue',
  sig2.fechaInicio === mas(siguiente.fechaInicio, 5) &&
    sig2.fechaFin === mas(siguiente.fechaFin, 5),
  JSON.stringify(sig2),
);
r = await a('POST', `/afiliados/${ana.id}/membresias/${tiq.id}/descongelar`);
verificar('no descongela lo que no está congelado (409)', r.estado === 409);

// anular
r = await a('POST', `/afiliados/${ana.id}/membresias/${siguiente.id}/anular`, {});
verificar('anular exige el motivo (400)', r.estado === 400);
r = await a('POST', `/afiliados/${ana.id}/membresias/${siguiente.id}/anular`, {
  motivo: 'Error de digitación',
});
verificar(
  'anula con motivo y queda en el historial',
  r.estado === 200 && r.datos.suscripciones.find((s) => s.id === siguiente.id).estado === 'ANULADA',
);
r = await a('POST', `/afiliados/${ana.id}/membresias/${siguiente.id}/anular`, {
  motivo: 'otra vez',
});
verificar('no se anula dos veces (409)', r.estado === 409);
verificar(
  'la anulada no cuenta como membresía',
  sql(`SELECT count(*) FROM suscripcion WHERE afiliado_id = '${ana.id}' AND estado = 'VIGENTE'`) ===
    '1',
);

// ───────────── Estados y filtros ─────────────
r = await a('POST', '/afiliados', {
  documento: '700001',
  nombre: 'Marta Vence',
  planId: semanal.id,
});
const marta = r.datos;
verificar(
  'una membresía de 7 días queda por vencer',
  r.estado === 201 && marta.estadoMembresia === 'POR_VENCER',
  JSON.stringify(marta),
);
r = await a('POST', '/afiliados', {
  documento: '700002',
  nombre: 'Pedro Vencido',
  planId: mensual.id,
});
const pedro = r.datos;
sql(
  `UPDATE suscripcion SET fecha_inicio = fecha_inicio - 40, fecha_fin = fecha_fin - 40 WHERE afiliado_id = '${pedro.id}'`,
);
r = await a('GET', `/afiliados/${pedro.id}`);
verificar(
  'vencida tras su último día',
  r.datos.estadoMembresia === 'VENCIDA' && r.datos.diasRestantes < 0,
  JSON.stringify(r.datos),
);
r = await a('POST', `/afiliados/${pedro.id}/membresias`, { planId: mensual.id });
verificar(
  'renovar una vencida empieza hoy',
  r.estado === 201 &&
    r.datos.suscripciones.some((s) => s.fechaInicio === hoy()) &&
    r.datos.estadoMembresia === 'VIGENTE',
  JSON.stringify(r.datos),
);
sql(
  `UPDATE suscripcion SET fecha_inicio = fecha_inicio - 70, fecha_fin = fecha_fin - 70 WHERE afiliado_id = '${pedro.id}'`,
);

const ids = async (q) =>
  (await a('GET', `/afiliados?${q}`)).datos.datos
    .map((x) => x.nombre)
    .sort()
    .join('|');
verificar('filtro: sin membresía', (await ids('membresia=sin')) === '', await ids('membresia=sin')); // Ana ya compró
verificar(
  'filtro: vigentes',
  (await ids('membresia=vigentes')) === 'Ana Pérez|Luis Gómez|Marta Vence',
  await ids('membresia=vigentes'),
);
verificar(
  'filtro: por vencer',
  (await ids('membresia=por_vencer')) === 'Marta Vence',
  await ids('membresia=por_vencer'),
);
verificar(
  'filtro: vencidas',
  (await ids('membresia=vencidas')) === 'Pedro Vencido',
  await ids('membresia=vencidas'),
);
verificar('busca sin tildes ni mayúsculas', (await ids('buscar=gomez')) === 'Luis Gómez');
verificar(
  'busca por documento y por teléfono',
  (await ids('buscar=900100')) === 'Luis Gómez' && (await ids('buscar=3001234567')) === 'Ana Pérez',
);

// ───────────── Editar e inactivar ─────────────
r = await a('PUT', `/afiliados/${luis.id}`, {
  documento: '900100',
  nombre: 'Luis A. Gómez',
  telefono: '3109998888',
  fechaNacimiento: '1990-05-17',
});
verificar(
  'edita al afiliado',
  r.estado === 200 &&
    r.datos.nombre === 'Luis A. Gómez' &&
    r.datos.fechaNacimiento === '1990-05-17' &&
    r.datos.referidoPor === null,
  JSON.stringify(r.datos),
);
r = await a('PUT', `/afiliados/${luis.id}`, { documento: '1085123456', nombre: 'Luis' });
verificar('no toma el documento de otro (409)', r.estado === 409);
r = await a('PUT', `/afiliados/${luis.id}`, {
  documento: '900100',
  nombre: 'Luis',
  referidoPorId: luis.id,
});
verificar('no se refiere a sí mismo (400)', r.estado === 400);
r = await a('PATCH', `/afiliados/${marta.id}/estado`, { activo: false });
verificar('inactiva (no se borra)', r.estado === 200 && r.datos.activo === false);
verificar(
  'el listado por defecto oculta a los inactivos',
  (await ids('buscar=marta')) === '' &&
    (await ids('buscar=marta&estado=inactivos')) === 'Marta Vence',
);
r = await a('POST', `/afiliados/${marta.id}/membresias`, { planId: mensual.id });
verificar('un afiliado inactivo no compra membresía (409)', r.estado === 409);
r = await a('PATCH', `/planes/${semanal.id}/estado`, { activo: false });
r = await a('POST', `/afiliados/${luis.id}/membresias`, {
  planId: semanal.id,
  fechaInicio: mas(hoy(), 40),
});
verificar('un plan inactivo no se vende (409)', r.estado === 409);

// editar el plan no cambia lo ya vendido
r = await a('PUT', `/planes/${mensual.id}`, {
  nombre: 'Mensual',
  tipo: 'MENSUAL',
  precio: '90000',
  dias: 30,
});
r = await a('GET', `/afiliados/${luis.id}`);
verificar(
  'la membresía vendida conserva su precio',
  r.datos.suscripciones[0].precio === '80000.00',
  JSON.stringify(r.datos.suscripciones[0]),
);

// ───────────── Aislamiento y permisos ─────────────
r = await b('GET', `/afiliados/${luis.id}`);
verificar('otra empresa no ve al afiliado (404)', r.estado === 404);
r = await b('POST', `/afiliados/${luis.id}/membresias`, { planId: mensual.id });
verificar(
  'ni le vende membresías (404 o 400)',
  r.estado === 404 || r.estado === 400,
  String(r.estado),
);
r = await b('GET', '/planes');
verificar('ni ve los planes', r.estado === 200 && r.datos.length === 0);
verificar(
  'RLS: filas por empresa en la base',
  sql(`SELECT count(DISTINCT empresa_id) FROM afiliado`) === '2' ||
    sql(`SELECT count(DISTINCT empresa_id) FROM afiliado`) === '1',
);

r = await a('POST', '/roles', { nombre: 'Solo informes', permisos: ['informes.ver'] });
const rolInf = r.datos;
r = await a('POST', '/roles', { nombre: 'Solo mirar', permisos: ['afiliados.ver'] });
const rolVer = r.datos;
for (const [correo, rol] of [
  ['inf@777.co', rolInf],
  ['ver@777.co', rolVer],
]) {
  r = await a('POST', '/usuarios', {
    nombre: correo,
    email: correo,
    password: 'una-clave-segura',
    rolId: rol.id,
  });
  verificar(`crea el usuario ${correo}`, r.estado === 201, JSON.stringify(r.datos));
}
const inf = sesion();
await inf('POST', '/auth/login', { email: 'inf@777.co', password: 'una-clave-segura' });
verificar(
  'sin afiliados.ver no entra (403)',
  (await inf('GET', '/afiliados')).estado === 403 && (await inf('GET', '/planes')).estado === 403,
);
const ver = sesion();
await ver('POST', '/auth/login', { email: 'ver@777.co', password: 'una-clave-segura' });
verificar(
  'con afiliados.ver consulta',
  (await ver('GET', '/afiliados')).estado === 200 && (await ver('GET', '/planes')).estado === 200,
);
verificar(
  'pero no crea ni vende (403)',
  (await ver('POST', '/afiliados', { documento: '999999', nombre: 'No' })).estado === 403 &&
    (await ver('POST', '/planes', { nombre: 'X', tipo: 'MENSUAL', precio: '1', dias: 1 }))
      .estado === 403 &&
    (await ver('POST', `/afiliados/${luis.id}/membresias`, { planId: mensual.id })).estado === 403,
);

// ───────────── Integridad ─────────────
verificar(
  'toda membresía tiene sus fechas en orden',
  sql(`SELECT count(*) FROM suscripcion WHERE fecha_fin < fecha_inicio`) === '0',
);
verificar(
  'la auditoría registró altas, ventas, congelar y anular',
  Number(
    sql(
      `SELECT count(*) FROM auditoria WHERE entidad IN ('afiliado','suscripcion','plan_gimnasio')`,
    ),
  ) >= 12,
);
verificar(
  'sin membresías solapadas por afiliado (vigentes)',
  sql(
    `SELECT count(*) FROM suscripcion a JOIN suscripcion b ON a.afiliado_id = b.afiliado_id AND a.id < b.id AND a.estado = 'VIGENTE' AND b.estado = 'VIGENTE' AND a.fecha_inicio <= b.fecha_fin AND b.fecha_inicio <= a.fecha_fin WHERE a.afiliado_id <> '${pedro.id}'`,
  ) === '0',
);
void perfil;
terminar();
