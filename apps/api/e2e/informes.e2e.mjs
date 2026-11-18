// Informes: cobros por medio/día/plan, ingresos por día y hora, vencimientos, cajas y permisos.
import { nuevaEmpresa, sesion, sql, terminar, verificar } from './comun.mjs';

const { a } = await nuevaEmpresa('900777001');
const { a: b } = await nuevaEmpresa('900777002');
const HOY = sql(`SELECT (now() AT TIME ZONE 'America/Bogota')::date`);
const dia = (n) => sql(`SELECT ((now() AT TIME ZONE 'America/Bogota')::date + ${n})`);

const mensual = (
  await a('POST', '/planes', { nombre: 'Mensual', tipo: 'MENSUAL', precio: '80000', dias: 30 })
).datos;
const tiquetera = (
  await a('POST', '/planes', {
    nombre: 'Tiquetera 10',
    tipo: 'TIQUETERA',
    precio: '30000',
    dias: 30,
    sesiones: 10,
  })
).datos;
const afiliado = async (documento, nombre, telefono) =>
  (await a('POST', '/afiliados', { documento, nombre, telefono })).datos;
const ana = await afiliado('3001', 'Ana Gómez', '3001234567');
const beto = await afiliado('3002', 'Beto Ruiz', '7234567');
const caro = await afiliado('3003', 'Caro Díaz', '3109876543');
const dani = await afiliado('3004', 'Dani Sin Plan');

await a('POST', '/caja/abrir', { base: '10000' });
await a('POST', `/afiliados/${ana.id}/membresias`, {
  planId: mensual.id,
  pagos: [
    { medio: 'EFECTIVO', valor: '30000' },
    { medio: 'NEQUI', valor: '50000' },
  ],
});
await a('POST', `/afiliados/${beto.id}/membresias`, {
  planId: tiquetera.id,
  pagos: [{ medio: 'EFECTIVO', valor: '30000' }],
});
await a('POST', `/afiliados/${caro.id}/membresias`, { planId: mensual.id });

// ───────────── Cobros ─────────────
let r = await a('GET', `/informes/cobros?desde=${HOY}&hasta=${HOY}`);
verificar(
  'cobros: total, recibos y por medio',
  r.estado === 200 &&
    r.datos.total === '110000.00' &&
    r.datos.recibos === 2 &&
    r.datos.porMedio.find((m) => m.medio === 'EFECTIVO').valor === '60000.00' &&
    r.datos.porMedio.find((m) => m.medio === 'NEQUI').valor === '50000.00',
  JSON.stringify(r.datos),
);
verificar(
  'cobros: por plan',
  r.datos.porPlan.length === 2 &&
    r.datos.porPlan[0].plan === 'Mensual' &&
    r.datos.porPlan[0].valor === '80000.00',
  JSON.stringify(r.datos.porPlan),
);
verificar(
  'cobros: por día',
  r.datos.porDia.length === 1 &&
    r.datos.porDia[0].fecha === HOY &&
    r.datos.porDia[0].valor === '110000.00',
);

// El recibo de Beto pasa a hace 3 días: sale del día de hoy y entra en el período anterior.
sql(
  `UPDATE recibo SET fecha_hora = ((now() AT TIME ZONE 'America/Bogota')::date - 3 + time '15:30') AT TIME ZONE 'America/Bogota' WHERE afiliado_id = '${beto.id}'`,
);
r = await a('GET', `/informes/cobros?desde=${HOY}&hasta=${HOY}`);
verificar(
  'cobros: respeta el día de Colombia',
  r.datos.total === '80000.00' && r.datos.recibos === 1,
);
r = await a('GET', `/informes/cobros?desde=${dia(-10)}&hasta=${dia(-1)}`);
verificar(
  'cobros: período anterior',
  r.datos.total === '30000.00' && r.datos.porDia[0].fecha === dia(-3),
);
r = await a('GET', `/informes/cobros?desde=${dia(-1)}&hasta=${dia(-5)}`);
verificar('cobros: rango invertido 400', r.estado === 400);
r = await a('GET', `/informes/cobros?desde=2020-01-01&hasta=${HOY}`);
verificar('cobros: más de 366 días 400', r.estado === 400);
r = await a('GET', '/informes/cobros');
verificar('cobros: sin fechas 400', r.estado === 400);

// ───────────── Ingresos ─────────────
await a('POST', '/ingresos', { documento: '3001' });
await a('POST', '/ingresos', { documento: '3001' });
await a('POST', '/ingresos', { documento: '3002' });
await a('POST', '/ingresos', { documento: '3004' }); // sin membresía: alerta
const idAtras = (await a('POST', '/ingresos', { documento: '3001' })).datos.id;
sql(
  `UPDATE ingreso SET fecha = (now() AT TIME ZONE 'America/Bogota')::date - 2, fecha_hora = ((now() AT TIME ZONE 'America/Bogota')::date - 2 + time '18:10') AT TIME ZONE 'America/Bogota' WHERE id = '${idAtras}'`,
);
const anul = (await a('POST', '/ingresos', { documento: '3001' })).datos.id;
await a('POST', `/ingresos/${anul}/anular`, { motivo: 'prueba' });
r = await a('GET', `/informes/ingresos?desde=${dia(-5)}&hasta=${HOY}`);
verificar(
  'ingresos: total sin anulados, personas distintas y alertas',
  r.datos.total === 5 && r.datos.afiliados === 3 && r.datos.alertas === 1,
  JSON.stringify({ t: r.datos.total, a: r.datos.afiliados, al: r.datos.alertas }),
);
verificar(
  'ingresos: por día',
  r.datos.porDia.length === 2 &&
    r.datos.porDia[0].fecha === dia(-2) &&
    r.datos.porDia[1].total === 4,
);
verificar(
  'ingresos: por hora (24 horas, la de las 18 con 1)',
  r.datos.porHora.length === 24 &&
    r.datos.porHora[18].total === 1 &&
    r.datos.porHora.reduce((s, h) => s + h.total, 0) === 5,
);
verificar(
  'ingresos: más asiduos',
  r.datos.masAsiduos[0].nombre === 'Ana Gómez' && r.datos.masAsiduos[0].ingresos === 3,
  JSON.stringify(r.datos.masAsiduos),
);

// ───────────── Vencimientos ─────────────
const fin = (id, n) =>
  sql(
    `UPDATE suscripcion SET fecha_fin = ((now() AT TIME ZONE 'America/Bogota')::date + ${n}), fecha_inicio = ((now() AT TIME ZONE 'America/Bogota')::date + ${n}) - 29 WHERE afiliado_id = '${id}'`,
  );
fin(ana.id, 3);
fin(caro.id, -5);
fin(beto.id, 40);
r = await a('GET', '/informes/vencimientos');
verificar(
  'vencimientos: por vencer en 15 días',
  r.estado === 200 &&
    r.datos.porVencer.length === 1 &&
    r.datos.porVencer[0].nombre === 'Ana Gómez' &&
    r.datos.porVencer[0].dias === 3 &&
    r.datos.porVencer[0].telefono === '3001234567',
  JSON.stringify(r.datos.porVencer),
);
verificar(
  'vencimientos: vencidas en 30 días',
  r.datos.vencidas.length === 1 &&
    r.datos.vencidas[0].nombre === 'Caro Díaz' &&
    r.datos.vencidas[0].dias === -5,
);
r = await a('GET', '/informes/vencimientos?dias=60&vencidasDias=2');
verificar(
  'vencimientos: el rango se puede cambiar',
  r.datos.porVencer.length === 2 && r.datos.vencidas.length === 0,
);
// Renovar por adelantado: ya no está por vencer
await a('POST', `/afiliados/${ana.id}/membresias`, {
  planId: mensual.id,
  pagos: [{ medio: 'EFECTIVO', valor: '80000' }],
});
r = await a('GET', '/informes/vencimientos');
verificar('vencimientos: si renovó por adelantado no aparece', r.datos.porVencer.length === 0);
await a('PATCH', `/afiliados/${caro.id}/estado`, { activo: false });
r = await a('GET', '/informes/vencimientos');
verificar('vencimientos: no incluye afiliados inactivos', r.datos.vencidas.length === 0);

// ───────────── Cajas ─────────────
const turno = (await a('GET', '/caja/actual')).datos;
r = await a('GET', `/informes/cajas?desde=${HOY}&hasta=${HOY}`);
verificar(
  'cajas: abierta con su cuadre',
  r.estado === 200 &&
    r.datos.turnos.length === 1 &&
    r.datos.abiertas === 1 &&
    r.datos.turnos[0].esperado === '150000.00',
  JSON.stringify(r.datos.turnos[0]),
);
await a('POST', `/caja/turnos/${turno.id}/cerrar`, { contado: '119000', observaciones: 'Faltó' });
r = await a('GET', `/informes/cajas?desde=${HOY}&hasta=${HOY}`);
verificar(
  'cajas: diferencia y cobros del período',
  r.datos.abiertas === 0 &&
    r.datos.diferenciaTotal === '-31000.00' &&
    r.datos.turnos[0].diferencia === '-31000.00' &&
    r.datos.cobrosTotal === '190000.00',
  JSON.stringify({ d: r.datos.diferenciaTotal, c: r.datos.cobrosTotal }),
);

// ───────────── Permisos y aislamiento ─────────────
const roles = (await a('GET', '/roles')).datos;
const recep = roles.find((x) => x.nombre === 'Recepción');
await a('POST', '/usuarios', {
  nombre: 'Recep',
  email: 'recep@777.co',
  password: 'una-clave-segura',
  rolId: recep.id,
});
const sr = sesion();
await sr('POST', '/auth/login', { email: 'recep@777.co', password: 'una-clave-segura' });
verificar(
  'Recepción no ve informes (403)',
  (await sr('GET', `/informes/cobros?desde=${HOY}&hasta=${HOY}`)).estado === 403 &&
    (await sr('GET', '/informes/vencimientos')).estado === 403,
);
r = await b('GET', `/informes/cobros?desde=${HOY}&hasta=${HOY}`);
verificar(
  'otra empresa ve sus propias cifras (vacías)',
  r.estado === 200 && r.datos.total === '0.00' && r.datos.recibos === 0,
);
r = await b('GET', `/informes/ingresos?desde=${HOY}&hasta=${HOY}`);
verificar(
  'otra empresa no ve ingresos ajenos',
  r.datos.total === 0 && r.datos.masAsiduos.length === 0,
);
terminar();
