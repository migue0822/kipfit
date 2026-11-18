// Foto del afiliado: guardar, ver versión en lista/ingreso, validar contenido, quitar y aislar por empresa.
import { nuevaEmpresa, sesion, sql, terminar, verificar } from './comun.mjs';

const { a } = await nuevaEmpresa('900888001');
const { a: b } = await nuevaEmpresa('900888002');
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const plan = (
  await a('POST', '/planes', { nombre: 'Mensual', tipo: 'MENSUAL', precio: '80000', dias: 30 })
).datos;
const ana = (
  await a('POST', '/afiliados', { documento: '5001', nombre: 'Ana Foto', planId: plan.id })
).datos;

verificar(
  'sin foto: fotoVersion null y GET 404',
  ana.fotoVersion === null && (await a('GET', `/afiliados/${ana.id}/foto`)).estado === 404,
);

let r = await a('PUT', `/afiliados/${ana.id}/foto`, { foto: PNG });
verificar(
  'guardar foto devuelve la versión',
  r.estado === 200 && typeof r.datos.fotoVersion === 'number',
  JSON.stringify(r.datos?.fotoVersion),
);
verificar(
  'se guardó como PNG por sus bytes',
  sql(
    `SELECT tipo || ':' || octet_length(contenido) FROM afiliado_foto WHERE afiliado_id = '${ana.id}'`,
  ).startsWith('image/png:'),
);
verificar('GET foto 200', (await a('GET', `/afiliados/${ana.id}/foto`)).estado === 200);
r = await a('GET', '/afiliados?buscar=ana');
verificar('la lista trae fotoVersion', r.datos.datos[0].fotoVersion !== null);
r = await a('POST', '/ingresos', { documento: '5001' });
verificar(
  'el ingreso trae fotoVersion',
  r.estado === 201 && r.datos.fotoVersion !== null,
  JSON.stringify(r.datos),
);

// Validaciones: lo que dice ser imagen pero no lo es, tamaño y formato.
const falso = 'data:image/png;base64,' + Buffer.from('esto no es una imagen').toString('base64');
verificar(
  'bytes que no son imagen → 400',
  (await a('PUT', `/afiliados/${ana.id}/foto`, { foto: falso })).estado === 400,
);
verificar(
  'formato no permitido → 400',
  (await a('PUT', `/afiliados/${ana.id}/foto`, { foto: 'data:image/svg+xml;base64,PHN2Zy8+' }))
    .estado === 400,
);
const grande =
  'data:image/png;base64,' +
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(320 * 1024),
  ]).toString('base64');
verificar(
  'más de 300 KB → 400',
  (await a('PUT', `/afiliados/${ana.id}/foto`, { foto: grande })).estado === 400,
);

// Aislamiento
verificar(
  'otra empresa no ve ni cambia la foto (404)',
  (await b('GET', `/afiliados/${ana.id}/foto`)).estado === 404 &&
    (await b('PUT', `/afiliados/${ana.id}/foto`, { foto: PNG })).estado === 404,
);

// Permisos: Recepción puede (afiliados.editar); un rol sin permisos de afiliados no.
const roles = (await a('GET', '/roles')).datos;
const rolVacio = (
  await a('POST', '/roles', { nombre: 'Solo informes', permisos: ['informes.ver'] })
).datos;
await a('POST', '/usuarios', {
  nombre: 'Sin acceso',
  email: 'sinacceso@888.co',
  password: 'una-clave-segura',
  rolId: rolVacio.id,
});
const s = sesion();
await s('POST', '/auth/login', { email: 'sinacceso@888.co', password: 'una-clave-segura' });
verificar(
  'sin permisos de afiliados: 403 al ver y al cambiar',
  (await s('GET', `/afiliados/${ana.id}/foto`)).estado === 403 &&
    (await s('PUT', `/afiliados/${ana.id}/foto`, { foto: PNG })).estado === 403,
);
void roles;

// Quitar
r = await a('PUT', `/afiliados/${ana.id}/foto`, { foto: null });
verificar(
  'quitar foto',
  r.estado === 200 &&
    r.datos.fotoVersion === null &&
    sql(`SELECT count(*) FROM afiliado_foto WHERE afiliado_id = '${ana.id}'`) === '0',
);
verificar(
  'auditoría de la foto',
  sql(
    `SELECT count(*) FROM auditoria WHERE entidad = 'afiliado' AND entidad_id = '${ana.id}' AND accion IN ('cambiar_foto','quitar_foto')`,
  ) === '2',
);
terminar();
