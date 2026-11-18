// Caja y cobros: turnos, cobro al vender (pago combinado), recibos, movimientos, cuadre, cierre y aislamiento.
import { nuevaEmpresa, sesion, sql, terminar, verificar } from './comun.mjs';

const { a } = await nuevaEmpresa('900999001');
const { a: b } = await nuevaEmpresa('900999002');

const plan = (
  await a('POST', '/planes', { nombre: 'Mensual', tipo: 'MENSUAL', precio: '80000', dias: 30 })
).datos;
const afiliado = async (documento, nombre) =>
  (await a('POST', '/afiliados', { documento, nombre })).datos;
const ana = await afiliado('2001', 'Ana');
const beto = await afiliado('2002', 'Beto');
const caro = await afiliado('2003', 'Caro');
const dani = await afiliado('2004', 'Dani');

// ───────────── Sin caja no se cobra ─────────────
let r = await a('GET', '/caja/actual');
verificar('sin caja abierta: actual = null', r.estado === 200 && r.datos === null);
r = await a('POST', `/afiliados/${ana.id}/membresias`, {
  planId: plan.id,
  pagos: [{ medio: 'EFECTIVO', valor: '80000' }],
});
verificar('cobrar sin caja abierta: 409', r.estado === 409, JSON.stringify(r.datos));
verificar(
  'y no deja membresía a medias',
  sql(`SELECT count(*) FROM suscripcion WHERE afiliado_id = '${ana.id}'`) === '0',
);

// ───────────── Abrir ─────────────
r = await a('POST', '/caja/abrir', { base: '50.000' });
verificar(
  'abre la caja con su base (formato colombiano)',
  r.estado === 201 &&
    r.datos.base === '50000.00' &&
    r.datos.numero.startsWith('CJ') &&
    r.datos.estado === 'ABIERTO',
  JSON.stringify(r.datos),
);
const turno = r.datos;
r = await a('POST', '/caja/abrir', {});
verificar('no abre una segunda caja (409)', r.estado === 409);

// ───────────── Cobros ─────────────
r = await a('POST', `/afiliados/${ana.id}/membresias`, {
  planId: plan.id,
  pagos: [
    { medio: 'EFECTIVO', valor: '30000' },
    { medio: 'NEQUI', valor: '49000' },
  ],
});
verificar('pagos que no suman el precio: 400', r.estado === 400, JSON.stringify(r.datos));
r = await a('POST', `/afiliados/${ana.id}/membresias`, {
  planId: plan.id,
  pagos: [
    { medio: 'EFECTIVO', valor: '30000' },
    { medio: 'NEQUI', valor: '50000' },
  ],
});
verificar(
  'cobro combinado crea la membresía y el recibo',
  r.estado === 201 && r.datos.suscripciones[0].recibo?.numero.startsWith('RC'),
  JSON.stringify(r.datos.suscripciones?.[0]?.recibo),
);
const reciboAna = r.datos.suscripciones[0].recibo;
r = await a('POST', `/afiliados/${beto.id}/membresias`, {
  planId: plan.id,
  pagos: [{ medio: 'EFECTIVO', valor: '80000' }],
});
const reciboBeto = r.datos.suscripciones[0].recibo;
verificar(
  'segundo recibo con consecutivo siguiente',
  r.estado === 201 && reciboBeto.numero !== reciboAna.numero,
);
r = await a('POST', `/afiliados/${caro.id}/membresias`, { planId: plan.id });
verificar(
  'sin pagos queda sin cobro (cortesía)',
  r.estado === 201 && r.datos.suscripciones[0].recibo === null,
);

r = await a('GET', `/recibos/${reciboAna.id}`);
verificar(
  'datos del recibo para imprimir',
  r.estado === 200 &&
    r.datos.valor === '80000.00' &&
    r.datos.pagos.length === 2 &&
    r.datos.afiliadoNombre === 'Ana' &&
    r.datos.cajero === 'Administrador',
  JSON.stringify(r.datos),
);

// ───────────── Movimientos y cuadre ─────────────
r = await a('POST', '/caja/movimientos', {
  tipo: 'EGRESO',
  concepto: 'Compra de agua',
  valor: '20000',
});
verificar('registra un egreso', r.estado === 201 && r.datos.numero.startsWith('MC'));
const egreso = r.datos;
r = await a('POST', '/caja/movimientos', {
  tipo: 'INGRESO',
  concepto: 'Venta de proteína',
  valor: '15000',
});
verificar('registra un ingreso', r.estado === 201);
r = await a('POST', '/caja/movimientos', {
  tipo: 'EGRESO',
  concepto: 'Demasiado',
  valor: '999999',
});
verificar('un egreso mayor al efectivo de la caja: 409', r.estado === 409, JSON.stringify(r.datos));
r = await a('GET', '/caja/actual');
// esperado = 50000 base + 30000 + 80000 efectivo + 15000 − 20000 = 155000
verificar(
  'cuadre: base + efectivo + ingresos − egresos',
  r.datos.resumen.esperado === '155000.00' &&
    r.datos.resumen.efectivoCobros === '110000.00' &&
    r.datos.resumen.otrosMedios.NEQUI === '50000.00' &&
    r.datos.resumen.recibos === 2,
  JSON.stringify(r.datos.resumen),
);

r = await a('POST', `/caja/movimientos/${egreso.id}/anular`, { motivo: 'Error' });
verificar('anula el egreso (vuelve el efectivo)', r.estado === 200 && r.datos.anulado === true);
r = await a('GET', '/caja/actual');
verificar(
  'cuadre después de anular el egreso',
  r.datos.resumen.esperado === '175000.00',
  r.datos.resumen.esperado,
);

// ───────────── Anular membresía = anular su recibo ─────────────
const sBeto = (await a('GET', `/afiliados/${beto.id}`)).datos.suscripciones[0];
r = await a('POST', `/afiliados/${beto.id}/membresias/${sBeto.id}/anular`, {
  motivo: 'Se arrepintió',
});
verificar(
  'anular la membresía anula el recibo',
  r.estado === 200 && r.datos.suscripciones[0].recibo.anulado === true,
);
r = await a('GET', '/caja/actual');
verificar(
  'el efectivo del recibo anulado sale del cuadre',
  r.datos.resumen.esperado === '95000.00' && r.datos.resumen.recibosAnulados === 1,
  JSON.stringify(r.datos.resumen),
);

// ───────────── Cierre ─────────────
r = await a('POST', `/caja/turnos/${turno.id}/cerrar`, { contado: '94000' });
verificar('no cuadra y sin observación: 400', r.estado === 400, JSON.stringify(r.datos));
r = await a('POST', `/caja/turnos/${turno.id}/cerrar`, {
  contado: '94000',
  observaciones: 'Faltó una moneda',
});
verificar(
  'cierra con diferencia y observación',
  r.estado === 200 &&
    r.datos.estado === 'CERRADO' &&
    r.datos.diferencia === '-1000.00' &&
    r.datos.esperado === '95000.00',
  JSON.stringify(r.datos),
);
r = await a('POST', `/caja/turnos/${turno.id}/cerrar`, { contado: '95000' });
verificar('no se cierra dos veces (409)', r.estado === 409);
r = await a('POST', `/afiliados/${dani.id}/membresias`, {
  planId: plan.id,
  pagos: [{ medio: 'EFECTIVO', valor: '80000' }],
});
verificar('con la caja cerrada no se cobra (409)', r.estado === 409);
const sAna = (await a('GET', `/afiliados/${ana.id}`)).datos.suscripciones[0];
r = await a('POST', `/afiliados/${ana.id}/membresias/${sAna.id}/anular`, { motivo: 'Tarde' });
verificar(
  'el cobro de una caja cerrada no se anula (409)',
  r.estado === 409,
  JSON.stringify(r.datos),
);
verificar(
  'y la membresía sigue vigente',
  sql(`SELECT estado FROM suscripcion WHERE id = '${sAna.id}'`) === 'VIGENTE',
);
r = await a('GET', `/caja/turnos/${turno.id}`);
verificar(
  'el detalle trae recibos y movimientos y el cuadre quedó fijo',
  r.estado === 200 &&
    r.datos.recibos.length === 2 &&
    r.datos.movimientos.length === 2 &&
    r.datos.resumen.esperado === '95000.00',
);

// Una caja nueva y exacta
r = await a('POST', '/caja/abrir', { base: '10000' });
const t2 = r.datos;
r = await a('POST', `/caja/turnos/${t2.id}/cerrar`, { contado: '10000' });
verificar('cierre exacto sin observaciones', r.estado === 200 && r.datos.diferencia === '0.00');

// ───────────── Permisos y cajeros ─────────────
r = await a('POST', '/roles', { nombre: 'Solo mirar', permisos: ['afiliados.ver'] });
await a('POST', '/usuarios', {
  nombre: 'Mira',
  email: 'mira@999.co',
  password: 'una-clave-segura',
  rolId: r.datos.id,
});
const mira = sesion();
await mira('POST', '/auth/login', { email: 'mira@999.co', password: 'una-clave-segura' });
verificar(
  'sin caja.operar no abre ni consulta (403)',
  (await mira('POST', '/caja/abrir', {})).estado === 403 &&
    (await mira('GET', '/caja/actual')).estado === 403,
);
const roles = (await a('GET', '/roles')).datos;
const rolRecep = roles.find((x) => x.nombre === 'Recepción');
verificar(
  'el rol Recepción trae caja.operar',
  rolRecep.permisos.includes('caja.operar') && !rolRecep.permisos.includes('caja.supervisar'),
);
await a('POST', '/usuarios', {
  nombre: 'Recep',
  email: 'recep@999.co',
  password: 'una-clave-segura',
  rolId: rolRecep.id,
});
const recep = sesion();
await recep('POST', '/auth/login', { email: 'recep@999.co', password: 'una-clave-segura' });
r = await recep('POST', '/caja/abrir', { base: '5000' });
const tRecep = r.datos;
verificar('otro cajero abre su propia caja', r.estado === 201);
r = await recep('GET', '/caja/turnos');
verificar('el cajero solo ve sus turnos', r.datos.length === 1 && r.datos[0].id === tRecep.id);
r = await a('GET', '/caja/turnos');
verificar('el administrador (supervisa) ve todos', r.datos.length === 3, String(r.datos.length));
r = await recep('GET', `/caja/turnos/${turno.id}`);
verificar('un cajero no ve la caja de otro (403)', r.estado === 403);
r = await a('POST', `/caja/turnos/${tRecep.id}/cerrar`, { contado: '5000' });
verificar('el supervisor cierra la caja de otro', r.estado === 200);
r = await recep('POST', `/caja/turnos/${t2.id}/cerrar`, { contado: '1' });
verificar('un cajero no cierra la de otro (403)', r.estado === 403 || r.estado === 409);

// ───────────── Aislamiento ─────────────
r = await b('GET', `/caja/turnos/${turno.id}`);
verificar('otra empresa no ve turnos ajenos (404)', r.estado === 404);
r = await b('GET', `/recibos/${reciboAna.id}`);
verificar('otra empresa no ve recibos ajenos (404)', r.estado === 404);

// ───────────── Licencia vencida ─────────────
r = await a('POST', '/caja/abrir', { base: '1000' });
const t3 = r.datos;
sql(`UPDATE empresa SET pagado_hasta = current_date - 3 WHERE nit = '900999001'`);
r = await a('POST', '/caja/movimientos', { tipo: 'INGRESO', concepto: 'No debe', valor: '1000' });
verificar('con la licencia vencida no registra (403)', r.estado === 403);
r = await a('POST', `/caja/turnos/${t3.id}/cerrar`, { contado: '1000' });
verificar('pero sí puede cerrar la caja', r.estado === 200);

// ───────────── Integridad ─────────────
verificar(
  'cada recibo vigente: sus pagos suman su valor',
  sql(
    `SELECT count(*) FROM recibo r WHERE r.estado = 'VIGENTE' AND r.valor <> (SELECT sum(valor) FROM recibo_pago p WHERE p.recibo_id = r.id)`,
  ) === '0',
);
verificar(
  'turnos cerrados guardan su cuadre',
  sql(
    `SELECT count(*) FROM turno_caja WHERE estado = 'CERRADO' AND (resumen IS NULL OR esperado IS NULL)`,
  ) === '0',
);
verificar(
  'no hay dos turnos abiertos del mismo cajero',
  sql(
    `SELECT count(*) FROM (SELECT 1 FROM turno_caja WHERE estado = 'ABIERTO' GROUP BY sucursal_id, cajero_id HAVING count(*) > 1) x`,
  ) === '0',
);
verificar(
  'la auditoría registró abrir, cobrar, anular y cerrar',
  Number(
    sql(
      `SELECT count(*) FROM auditoria WHERE entidad IN ('turno_caja','recibo','movimiento_caja')`,
    ),
  ) >= 10,
);
terminar();
