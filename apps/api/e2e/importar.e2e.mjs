// Importar afiliados: todo o nada, omite existentes, membresía "como estaba" sin cobro, permisos y aislamiento.
import { nuevaEmpresa, sesion, sql, terminar, verificar } from './comun.mjs';

const { a } = await nuevaEmpresa('900999001');
const { a: b } = await nuevaEmpresa('900999002');
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
const hoy = sql(`SELECT (now() AT TIME ZONE 'America/Bogota')::date`);
const dia = (n) => sql(`SELECT ((now() AT TIME ZONE 'America/Bogota')::date + ${n})`);
await a('POST', '/afiliados', { documento: '7003', nombre: 'Ya Existía' });

const filas = [
  {
    documento: '7001',
    nombre: 'Ana Importada',
    telefono: '3001234567',
    fechaNacimiento: '1990-05-17',
    planId: mensual.id,
    venceEl: dia(10),
  },
  { documento: '7002', nombre: 'Beto Vencido', planId: mensual.id, venceEl: dia(-20) },
  { documento: '7003', nombre: 'Nombre distinto', planId: mensual.id, venceEl: dia(5) },
  {
    documento: '7004',
    nombre: 'Caro Tiquetera',
    planId: tiquetera.id,
    venceEl: dia(15),
    sesionesRestantes: 4,
  },
  { documento: '7005', nombre: 'Dani Sin Plan' },
];
let r = await a('POST', '/afiliados/importar', { filas });
verificar(
  'importa y reporta',
  r.estado === 201 &&
    r.datos.creados === 4 &&
    r.datos.conMembresia === 3 &&
    r.datos.omitidos.join() === '7003',
  JSON.stringify(r.datos),
);
verificar(
  'el existente no se modifica',
  sql(`SELECT nombre FROM afiliado WHERE documento = '7003'`) === 'Ya Existía' &&
    sql(
      `SELECT count(*) FROM suscripcion s JOIN afiliado f ON f.id = s.afiliado_id WHERE f.documento = '7003'`,
    ) === '0',
);

const lista = (await a('GET', '/afiliados?estado=todos&porPagina=100')).datos.datos;
const est = (doc) => lista.find((x) => x.documento === doc)?.estadoMembresia;
verificar(
  'estados de membresía',
  est('7001') === 'VIGENTE' &&
    est('7002') === 'VENCIDA' &&
    est('7004') === 'VIGENTE' &&
    est('7005') === 'SIN_MEMBRESIA',
  JSON.stringify(lista.map((x) => [x.documento, x.estadoMembresia])),
);
verificar(
  'fecha de inicio = fin − (días − 1)',
  sql(
    `SELECT (s.fecha_fin - s.fecha_inicio) FROM suscripcion s JOIN afiliado f ON f.id = s.afiliado_id WHERE f.documento = '7001'`,
  ) === '29',
);
verificar(
  'sesiones restantes de la tiquetera',
  lista.find((x) => x.documento === '7004').sesionesRestantes === 4,
);
verificar(
  'sin cobro: ni recibos ni movimientos de caja',
  sql(`SELECT count(*) FROM recibo`) === '0' &&
    sql(
      `SELECT count(*) FROM suscripcion WHERE empresa_id = (SELECT id FROM empresa WHERE nit LIKE '900999001%' LIMIT 1) AND creado_por_id IS NULL`,
    ) === '0',
);
verificar(
  'búsqueda por nombre funciona',
  (await a('GET', '/afiliados?buscar=importada')).datos.total === 1,
);
verificar(
  'auditoría de la importación',
  sql(`SELECT count(*) FROM auditoria WHERE accion = 'importar'`) === '1',
);
const ana = lista.find((x) => x.documento === '7001');
const d = (await a('GET', `/afiliados/${ana.id}`)).datos;
verificar(
  'la ficha trae la membresía sin recibo',
  d.suscripciones.length === 1 &&
    d.suscripciones[0].recibo === null &&
    d.suscripciones[0].precio === '80000.00',
);

// Reimportar el mismo archivo: nada nuevo
r = await a('POST', '/afiliados/importar', { filas });
verificar(
  'reimportar omite todo',
  r.estado === 201 && r.datos.creados === 0 && r.datos.omitidos.length === 5,
);

// Todo o nada: una fila mala (sesiones de más) no crea ninguna
const antes = sql(`SELECT count(*) FROM afiliado`);
r = await a('POST', '/afiliados/importar', {
  filas: [
    { documento: '8001', nombre: 'Buena' },
    {
      documento: '8002',
      nombre: 'Mala',
      planId: tiquetera.id,
      venceEl: dia(3),
      sesionesRestantes: 11,
    },
  ],
});
verificar(
  'sesiones de más → 400 con la fila y no crea nada',
  r.estado === 400 &&
    /Fila 3/.test(JSON.stringify(r.datos)) &&
    sql(`SELECT count(*) FROM afiliado`) === antes,
  JSON.stringify(r.datos),
);
r = await a('POST', '/afiliados/importar', {
  filas: [
    { documento: '8003', nombre: 'Uno' },
    { documento: '8003', nombre: 'Repetido' },
  ],
});
verificar(
  'documento repetido en el archivo → 400',
  r.estado === 400 &&
    /Fila 3/.test(JSON.stringify(r.datos)) &&
    /8003/.test(JSON.stringify(r.datos)),
);
r = await a('POST', '/afiliados/importar', {
  filas: [
    {
      documento: '8004',
      nombre: 'Plan inexistente',
      planId: '00000000-0000-4000-8000-000000000000',
      venceEl: dia(3),
    },
  ],
});
verificar('plan inexistente → 400', r.estado === 400 && /Fila 2/.test(JSON.stringify(r.datos)));
r = await a('POST', '/afiliados/importar', {
  filas: [{ documento: '8005', nombre: 'Plan sin fecha', planId: mensual.id }],
});
verificar('plan sin "vence el" → 400', r.estado === 400);
r = await a('POST', '/afiliados/importar', { filas: [] });
verificar('sin filas → 400', r.estado === 400);
await a('PATCH', `/planes/${mensual.id}/estado`, { activo: false });
r = await a('POST', '/afiliados/importar', {
  filas: [{ documento: '8006', nombre: 'Plan inactivo', planId: mensual.id, venceEl: dia(3) }],
});
verificar('plan inactivo → 400', r.estado === 400 && /inactivo/.test(JSON.stringify(r.datos)));

// Aislamiento: la otra empresa no ve nada y puede usar los mismos documentos
verificar(
  'otra empresa sin afiliados',
  (await b('GET', '/afiliados?estado=todos')).datos.total === 0,
);
r = await b('POST', '/afiliados/importar', {
  filas: [{ documento: '7001', nombre: 'Mismo documento, otra empresa' }],
});
verificar('mismo documento en otra empresa se crea', r.estado === 201 && r.datos.creados === 1);
r = await b('POST', '/afiliados/importar', {
  filas: [{ documento: '9001', nombre: 'Con plan ajeno', planId: mensual.id, venceEl: dia(3) }],
});
verificar('plan de otra empresa → 400', r.estado === 400);

// Permisos
const rol = (await a('POST', '/roles', { nombre: 'Solo ver', permisos: ['afiliados.ver'] })).datos;
await a('POST', '/usuarios', {
  nombre: 'Lector',
  email: 'lector@999.co',
  password: 'una-clave-segura',
  rolId: rol.id,
});
const s = sesion();
await s('POST', '/auth/login', { email: 'lector@999.co', password: 'una-clave-segura' });
verificar(
  'sin afiliados.editar → 403',
  (await s('POST', '/afiliados/importar', { filas: [{ documento: '9002', nombre: 'No' }] }))
    .estado === 403,
);
terminar();
