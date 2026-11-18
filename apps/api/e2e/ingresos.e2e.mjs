// Ingresos: decisión por membresía, tiquetera, idempotencia, alertas, anular, aviso en tiempo real y aislamiento.
import { nuevaEmpresa, sesion, sql, terminar, verificar } from './comun.mjs';

const URL = process.env.E2E_URL ?? 'http://localhost:3999/api/v1';
const { a } = await nuevaEmpresa('900888001');
const { a: b } = await nuevaEmpresa('900888002');

const plan = (
  await a('POST', '/planes', { nombre: 'Mensual', tipo: 'MENSUAL', precio: '80000', dias: 30 })
).datos;
const tiq = (
  await a('POST', '/planes', {
    nombre: 'Tiquetera 3',
    tipo: 'TIQUETERA',
    precio: '30000',
    dias: 30,
    sesiones: 3,
  })
).datos;
const afiliado = async (documento, nombre) =>
  (await a('POST', '/afiliados', { documento, nombre })).datos;
const ana = await afiliado('1001', 'Ana');
const beto = await afiliado('1002', 'Beto');
const caro = await afiliado('1003', 'Caro');
const dani = await afiliado('1004', 'Dani');
await a('POST', `/afiliados/${ana.id}/membresias`, { planId: plan.id });
await a('POST', `/afiliados/${caro.id}/membresias`, { planId: tiq.id });
const m = (await a('POST', `/afiliados/${dani.id}/membresias`, { planId: plan.id })).datos
  .suscripciones[0];
await a('POST', `/afiliados/${dani.id}/membresias/${m.id}/congelar`);
// Beto: membresía vencida (se envejece directo en la base)
await a('POST', `/afiliados/${beto.id}/membresias`, { planId: plan.id });
sql(
  `UPDATE suscripcion SET fecha_inicio = fecha_inicio - 40, fecha_fin = fecha_fin - 40 WHERE afiliado_id = '${beto.id}'`,
);

// Aviso en tiempo real: se abre el flujo SSE antes de registrar.
const cookie = await (async () => {
  const r = await fetch(URL + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@900888001.co', password: 'una-clave-segura' }),
  });
  const c = r.headers.get('set-cookie').split(';')[0];
  return { c };
})();
const recibidos = [];
const ctl = new AbortController();
const flujo = fetch(URL + '/ingresos/eventos', {
  headers: { cookie: cookie.c },
  signal: ctl.signal,
})
  .then(async (res) => {
    const lector = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      recibidos.push(dec.decode(value));
    }
  })
  .catch(() => {});
await new Promise((r) => setTimeout(r, 400));

let r = await a('POST', '/ingresos', { documento: '1.001', origen: 'TABLET' });
verificar(
  'ingreso de afiliada vigente: PERMITIDO',
  r.estado === 201 && r.datos.resultado === 'PERMITIDO' && r.datos.afiliadoNombre === 'Ana',
  JSON.stringify(r.datos),
);
const idAna = r.datos.id;
await new Promise((r2) => setTimeout(r2, 400));
verificar(
  'recepción recibe el aviso en tiempo real',
  recibidos.join('').includes('"afiliadoNombre":"Ana"'),
  recibidos.join('|'),
);
ctl.abort();
await flujo;

r = await a('POST', '/ingresos', { documento: '1002' });
verificar(
  'vencida: ALERTA con días vencida',
  r.datos.resultado === 'ALERTA' &&
    r.datos.estadoMembresia === 'VENCIDA' &&
    r.datos.diasVencido >= 9 &&
    r.datos.alertaPendiente === true,
  JSON.stringify(r.datos),
);
const idBeto = r.datos.id;
r = await a('POST', '/ingresos', { documento: '1004' });
verificar(
  'congelada: ALERTA',
  r.datos.estadoMembresia === 'CONGELADA' && r.datos.resultado === 'ALERTA',
);
r = await a('POST', '/ingresos', { documento: '1099' });
verificar('documento desconocido: 404', r.estado === 404);

// Tiquetera: una sesión por día
r = await a('POST', '/ingresos', { documento: '1003' });
verificar(
  'tiquetera descuenta una sesión',
  r.datos.descuentaSesion === true && r.datos.sesionesRestantes === 2,
  JSON.stringify(r.datos),
);
const idCaro = r.datos.id;
r = await a('POST', '/ingresos', { documento: '1003' });
verificar(
  'segundo ingreso del mismo día no descuenta',
  r.datos.descuentaSesion === false && r.datos.sesionesRestantes === 2,
);
verificar(
  'sesiones_usadas = 1',
  sql(`SELECT sesiones_usadas FROM suscripcion WHERE afiliado_id = '${caro.id}'`) === '1',
);

// Idempotencia
const uuid = crypto.randomUUID();
r = await a('POST', '/ingresos', { id: uuid, documento: '1001' });
const r2 = await a('POST', '/ingresos', { id: uuid, documento: '1001' });
verificar(
  'reenviar el mismo id no duplica',
  r.estado === 201 &&
    r2.datos.repetido === true &&
    sql(`SELECT count(*) FROM ingreso WHERE id = '${uuid}'`) === '1',
);

// Listado, revisión y anulación
r = await a('GET', '/ingresos');
verificar(
  'lista el día con totales',
  r.estado === 200 && r.datos.total === 6 && r.datos.alertas === 2 && r.datos.pendientes === 2,
  JSON.stringify({ t: r.datos.total, a: r.datos.alertas, p: r.datos.pendientes }),
);
r = await a('PATCH', `/ingresos/${idBeto}/revisar`);
verificar('revisar acepta la alerta', r.estado === 200 && r.datos.alertaPendiente === false);
r = await a('PATCH', `/ingresos/${idBeto}/revisar`);
verificar('revisar dos veces: 409', r.estado === 409);
r = await a('POST', `/ingresos/${idCaro}/anular`, { motivo: 'Error de digitación' });
verificar(
  'anular devuelve la sesión de la tiquetera',
  r.estado === 200 &&
    r.datos.anulado === true &&
    sql(`SELECT sesiones_usadas FROM suscripcion WHERE afiliado_id = '${caro.id}'`) === '0',
);
r = await a('POST', `/ingresos/${idCaro}/anular`, { motivo: 'otra vez' });
verificar('no se anula dos veces (409)', r.estado === 409);
r = await a('POST', `/ingresos/${idAna}/anular`, {});
verificar('anular exige motivo (400)', r.estado === 400);
r = await a('GET', `/ingresos/afiliado/${ana.id}`);
verificar('historial del afiliado', r.estado === 200 && r.datos.length === 2);
r = await a('GET', '/plataforma/empresas');
void r;

// Aislamiento
r = await b('POST', '/ingresos', { documento: '1001' });
verificar('otra empresa no ve a los afiliados ajenos (404)', r.estado === 404);
r = await b('GET', '/ingresos');
verificar('otra empresa no ve los ingresos', r.estado === 200 && r.datos.total === 0);
r = await b('POST', `/ingresos/${idAna}/anular`, { motivo: 'intento ajeno' });
verificar('otra empresa no anula ingresos ajenos (404)', r.estado === 404);

// Permisos
r = await a('POST', '/roles', { nombre: 'Solo mirar', permisos: ['afiliados.ver'] });
await a('POST', '/usuarios', {
  nombre: 'Mira',
  email: 'mira@888.co',
  password: 'una-clave-segura',
  rolId: r.datos.id,
});
const mira = sesion();
await mira('POST', '/auth/login', { email: 'mira@888.co', password: 'una-clave-segura' });
verificar(
  'sin ingresos.registrar no registra (403)',
  (await mira('POST', '/ingresos', { documento: '1001' })).estado === 403 &&
    (await mira('GET', '/ingresos')).estado === 403,
);

// Licencia vencida: solo lectura
sql(`UPDATE empresa SET pagado_hasta = current_date - 3 WHERE nit = '900888001'`);
r = await a('POST', '/ingresos', { documento: '1001' });
verificar('con la licencia vencida no registra (403)', r.estado === 403);
r = await a('GET', '/ingresos');
verificar('con la licencia vencida sí consulta', r.estado === 200);

// Integridad
verificar(
  'toda tiquetera cuadra: sesiones usadas = ingresos que descuentan vigentes',
  sql(
    `SELECT count(*) FROM suscripcion s WHERE s.sesiones_total IS NOT NULL AND s.sesiones_usadas <> (SELECT count(*) FROM ingreso i WHERE i.suscripcion_id = s.id AND i.descuenta_sesion AND i.anulado_en IS NULL)`,
  ) === '0',
);
verificar(
  'la auditoría registró revisar y anular',
  Number(sql(`SELECT count(*) FROM auditoria WHERE entidad = 'ingreso'`)) >= 2,
);
terminar();
