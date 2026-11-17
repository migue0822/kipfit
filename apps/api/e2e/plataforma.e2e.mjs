// API de plataforma (la usa la consola de OrdenKipu): clave, empresas en demostración, planes con
// límites, licencia vencida/suspendida/retirada, pagos y anulación, y la auditoría con quién lo hizo.
import { calcularDV, nuevaEmpresa, sesion, sql, terminar, verificar } from './comun.mjs';

const URL = process.env.E2E_URL ?? 'http://localhost:3999/api/v1';
const CLAVE = process.env.E2E_PLATAFORMA_CLAVE ?? 'clave-plataforma-e2e-0123456789';
const QUIEN = 'Miguel López <miguel@example.com>';

async function p(metodo, ruta, cuerpo, cabeceras = {}) {
  const r = await fetch(URL + '/plataforma' + ruta, {
    method: metodo,
    headers: {
      'x-plataforma-clave': CLAVE,
      'x-plataforma-usuario': QUIEN,
      ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
      ...cabeceras,
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  return { estado: r.status, datos: texto ? JSON.parse(texto) : null };
}

const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const dias = (n) => new Date(Date.parse(`${hoy}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// ── La clave.
verificar(
  'sin clave no entra (401)',
  (await p('GET', '/empresas', undefined, { 'x-plataforma-clave': '' })).estado === 401,
);
verificar(
  'con otra clave no entra (401)',
  (await p('GET', '/empresas', undefined, { 'x-plataforma-clave': 'otra-clave-0123456789' }))
    .estado === 401,
);
verificar(
  'sin decir quién la usa no entra (401)',
  (await p('GET', '/empresas', undefined, { 'x-plataforma-usuario': '' })).estado === 401,
);

// ── Registro con código = demostración de 15 días.
const { a: demo, perfil } = await nuevaEmpresa('900555001');
verificar(
  'el registro deja la empresa en demostración por 15 días',
  perfil.empresa.licencia.enDemo === true &&
    perfil.empresa.licencia.pagadoHasta === dias(15) &&
    perfil.empresa.licencia.diasRestantes === 15 &&
    perfil.empresa.licencia.soloLectura === false,
  JSON.stringify(perfil.empresa.licencia),
);
let r = await p('GET', '/empresas');
verificar(
  'la consola ve la empresa en demostración con su administrador',
  r.estado === 200 &&
    r.datos.length === 1 &&
    r.datos[0].enDemo === true &&
    r.datos[0].administrador.email === 'admin@900555001.co' &&
    r.datos[0].usuariosActivos === 1,
  JSON.stringify(r.datos),
);

// ── Planes (los módulos que manda la consola de OrdenKipu se ignoran).
r = await p('POST', '/planes', {
  nombre: 'Básico',
  precioMensual: '60000',
  modulos: ['NOMINA'],
  maxUsuarios: 2,
  maxSucursales: 1,
});
const basico = r.datos.find((x) => x.nombre === 'Básico');
verificar(
  'crea el plan sin módulos',
  r.estado === 201 && basico.precioMensual === '60000.00' && basico.modulos.length === 0,
  JSON.stringify(r.datos),
);
verificar(
  'no repite el nombre del plan (409)',
  (await p('POST', '/planes', { nombre: 'Básico', precioMensual: '1' })).estado === 409,
);

// ── Empresa creada desde la consola: plan y 30 días de demostración.
const nit = '900555002';
r = await p('POST', '/empresas', {
  empresa: { nit, dv: calcularDV(nit), razonSocial: 'Gimnasio La Granja' },
  usuario: { nombre: 'Doña Rosa', email: 'rosa@granja.co', password: 'una-clave-segura' },
  planId: basico.id,
  pagadoHasta: dias(30),
  notas: 'Demo para la feria',
});
const granja = r.datos;
verificar(
  'crea la empresa con plan y demostración',
  r.estado === 201 &&
    granja.plan.nombre === 'Básico' &&
    granja.pagadoHasta === dias(30) &&
    granja.enDemo === true &&
    granja.cuentaExistente === false,
  JSON.stringify(r.datos),
);
verificar(
  'la auditoría guarda quién la creó',
  sql(
    `SELECT despues->>'por' FROM auditoria WHERE empresa_id = '${granja.id}' AND accion = 'plataforma_crear'`,
  ) === QUIEN,
);
verificar(
  'sin contraseña para un correo nuevo no la crea (400)',
  (
    await p('POST', '/empresas', {
      empresa: { nit: '900555003', dv: calcularDV('900555003'), razonSocial: 'Otra' },
      usuario: { nombre: 'Sin clave', email: 'nueva@otra.co' },
      planId: null,
      pagadoHasta: null,
    })
  ).estado === 400,
);

// La administradora entra con su clave.
const rosa = sesion();
r = await rosa('POST', '/auth/login', { email: 'rosa@granja.co', password: 'una-clave-segura' });
verificar(
  'entra la administradora creada desde la consola',
  r.estado === 200 && r.datos.empresa.licencia.plan === 'Básico' && r.datos.empresa.licencia.enDemo,
  JSON.stringify(r.datos.empresa),
);

// ── Límites del plan: 2 usuarios, 1 sucursal.
const roles = (await rosa('GET', '/roles')).datos;
const recepcion = roles.find((x) => x.nombre === 'Recepción').id;
const usuario = (n) =>
  rosa('POST', '/usuarios', {
    nombre: `Recepción ${n}`,
    email: `recep${n}@granja.co`,
    password: 'una-clave-segura',
    rolId: recepcion,
    sucursalIds: [],
  });
verificar('el segundo usuario cabe en el plan', (await usuario(1)).estado === 201);
r = await usuario(2);
verificar(
  'el tercero no (409, con el contacto)',
  r.estado === 409 && /permite 2 usuarios activos/.test(r.datos.message),
  JSON.stringify(r.datos),
);
r = await rosa('POST', '/sucursales', { codigo: '02', nombre: 'Plaza' });
verificar(
  'ni una segunda sucursal (409)',
  r.estado === 409 && /1 sucursal activa/.test(r.datos.message),
  JSON.stringify(r.datos),
);

// ── Demostración terminada: solo lectura (consultar sí, registrar no).
r = await p('PUT', `/empresas/${granja.id}/licencia`, {
  planId: basico.id,
  pagadoHasta: dias(-1),
  estado: 'ACTIVA',
  notas: 'Terminó la demo',
});
verificar(
  'la consola la ve vencida',
  r.estado === 200 && r.datos.soloLectura === true && r.datos.diasRestantes === -1,
  JSON.stringify(r.datos),
);
r = await rosa('GET', '/auth/yo');
verificar(
  'el perfil dice que la demostración terminó',
  r.datos.empresa.licencia.soloLectura &&
    r.datos.empresa.licencia.motivo === 'VENCIDA' &&
    r.datos.empresa.licencia.enDemo,
  JSON.stringify(r.datos.empresa.licencia),
);
verificar('consultar sigue funcionando', (await rosa('GET', '/roles')).estado === 200);
r = await rosa('POST', '/roles', { nombre: 'Entrenador', permisos: ['afiliados.ver'] });
verificar(
  'registrar no (403, "La demostración terminó")',
  r.estado === 403 && /La demostración terminó/.test(r.datos.message),
  JSON.stringify(r.datos),
);

// ── Pago: termina la demostración y corre la fecha desde el día del pago (ya había vencido).
r = await p('POST', `/empresas/${granja.id}/pagos`, {
  fecha: hoy,
  meses: 1,
  valor: '60000',
  medio: 'NEQUI',
  referencia: 'M123',
});
const pago = r.datos.pagos?.[0];
const unMes = (() => {
  const [y, m, d] = hoy.split('-').map(Number);
  const t = y * 12 + (m - 1) + 1;
  const ultimo = new Date(Date.UTC(Math.floor(t / 12), (t % 12) + 1, 0)).getUTCDate();
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
})();
verificar(
  'el pago activa la empresa y termina la demostración',
  r.estado === 201 &&
    r.datos.pagadoHasta === unMes &&
    r.datos.enDemo === false &&
    r.datos.soloLectura === false &&
    pago.registradoPor === QUIEN &&
    pago.pagadoHastaAnterior === dias(-1),
  JSON.stringify(r.datos),
);
verificar(
  'ya puede registrar',
  (await rosa('POST', '/roles', { nombre: 'Entrenador', permisos: ['afiliados.ver'] })).estado ===
    201,
);
verificar(
  'un pago con fecha futura no (400)',
  (
    await p('POST', `/empresas/${granja.id}/pagos`, {
      fecha: dias(2),
      meses: 1,
      valor: '1',
      medio: 'EFECTIVO',
    })
  ).estado === 400,
);

// ── Anular el pago devuelve la fecha anterior (y vuelve a la demostración vencida).
r = await p('POST', `/pagos/${pago.id}/anular`, { motivo: 'Lo registré dos veces' });
verificar(
  'anular el pago devuelve la fecha',
  r.estado === 201 &&
    r.datos.pagadoHasta === dias(-1) &&
    r.datos.enDemo === true &&
    r.datos.pagos[0].anulado === true,
  JSON.stringify(r.datos),
);
verificar(
  'no se anula dos veces (409)',
  (await p('POST', `/pagos/${pago.id}/anular`, { motivo: 'Otra vez' })).estado === 409,
);

// ── Suspendida y retirada.
await p('PUT', `/empresas/${granja.id}/licencia`, {
  planId: basico.id,
  pagadoHasta: null,
  estado: 'SUSPENDIDA',
});
r = await rosa('GET', '/auth/yo');
verificar(
  'suspendida: solo lectura aunque no venza',
  r.datos.empresa.licencia.motivo === 'SUSPENDIDA',
  JSON.stringify(r.datos.empresa.licencia),
);
await p('PUT', `/empresas/${granja.id}/licencia`, {
  planId: basico.id,
  pagadoHasta: null,
  estado: 'RETIRADA',
});
r = await rosa('GET', '/auth/yo');
verificar(
  'retirada: sin acceso a la empresa',
  r.datos.empresa === null && r.datos.empresas.length === 0,
  JSON.stringify(r.datos),
);
r = await p('POST', `/empresas/${granja.id}/pagos`, {
  fecha: hoy,
  meses: 1,
  valor: '1',
  medio: 'EFECTIVO',
});
verificar('a una retirada no se le registra pago (409)', r.estado === 409);

// ── La otra empresa no se afectó; el plan cuenta sus empresas.
verificar(
  'la empresa del registro sigue en demostración',
  (await demo('GET', '/auth/yo')).datos.empresa.licencia.enDemo === true,
);
r = await p('GET', '/planes');
verificar(
  'el plan no cuenta empresas retiradas',
  r.datos.find((x) => x.nombre === 'Básico').empresas === 0,
  JSON.stringify(r.datos),
);
verificar(
  'las empresas no escriben planes ni pagos (rol limitado)',
  sql(
    "SELECT has_table_privilege('kip_app', 'plan', 'INSERT') OR has_table_privilege('kip_app', 'pago_licencia', 'INSERT')",
  ) === 'f',
);

terminar();
