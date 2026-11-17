// Segunda barrera entre empresas (RLS): políticas en la base, el pool que aplica la empresa de la
// petición y la única consulta legítima a otras empresas (usuario con acceso a varias).
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { BASE, nuevaEmpresa, sesion, sql, terminar, verificar } from './comun.mjs';

const require = createRequire(import.meta.url);
const { contextoBd, PoolConEmpresa } = require('../dist/prisma/contexto-bd.js');

/** Ejecuta una consulta como kip_app con la empresa dada; devuelve la última fila o el error. */
function comoApp(empresaId, consulta) {
  try {
    const salida = execFileSync(
      'psql',
      [
        BASE,
        '-tAq',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `SET ROLE kip_app; SET app.empresa_id = '${empresaId}';`,
        '-c',
        consulta,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { ok: true, valor: salida.trim().split('\n').pop() };
  } catch (e) {
    return { ok: false, error: String(e.stderr) };
  }
}

const A = await nuevaEmpresa('900111221');
const B = await nuevaEmpresa('900333441');
const idA = A.perfil.empresa.id;
const idB = B.perfil.empresa.id;
const pA = (await A.a('GET', '/sucursales')).datos[0];
const pB = (await B.a('GET', '/sucursales')).datos[0];
verificar('cada empresa ve sus sucursales', Boolean(pA?.id && pB?.id && pA.id !== pB.id));

// Cobertura: toda tabla con empresa_id (salvo sesion) tiene RLS, y también empresa.
const sinRls = sql(`
  SELECT string_agg(c.relname, ', ') FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r' AND NOT c.relrowsecurity AND c.relname <> 'sesion'
    AND (c.relname = 'empresa' OR EXISTS (SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attname = 'empresa_id' AND NOT a.attisdropped))`);
verificar('toda tabla con empresa_id tiene RLS', sinRls === '', sinRls);

let r = comoApp(idA, `SELECT count(*) FROM sucursal WHERE id = '${pB.id}'`);
verificar('kip_app con A no ve la sucursal de B', r.ok && r.valor === '0', JSON.stringify(r));
r = comoApp(idA, "SELECT count(DISTINCT empresa_id) || '-' || min(empresa_id::text) FROM sucursal");
verificar(
  'kip_app con A solo ve sucursales de A',
  r.ok && r.valor === `1-${idA}`,
  JSON.stringify(r),
);
r = comoApp(idA, 'SELECT count(*) FROM empresa');
verificar('kip_app con A solo ve su empresa', r.ok && r.valor === '1', JSON.stringify(r));
r = comoApp(idA, `UPDATE sucursal SET nombre = 'X' WHERE id = '${pB.id}' RETURNING id`);
verificar('kip_app con A no modifica filas de B', r.ok && !r.valor, JSON.stringify(r));
r = comoApp(idA, `UPDATE sucursal SET empresa_id = '${idB}' WHERE id = '${pA.id}'`);
verificar(
  'kip_app no pasa una fila a otra empresa',
  !r.ok && r.error.includes('row-level security'),
  r.error,
);
r = comoApp('', 'SELECT (SELECT count(*) FROM sucursal) + (SELECT count(*) FROM empresa)');
verificar('kip_app sin empresa no ve nada', r.ok && r.valor === '0', JSON.stringify(r));

// El pool de la API: aplica la empresa del contexto y la quita al salir de él.
const pool = new PoolConEmpresa({ connectionString: BASE, max: 1 });
const ver = async () =>
  (
    await pool.query(
      "SELECT current_user AS rol, current_setting('app.empresa_id', true) AS empresa, (SELECT count(*) FROM sucursal)::int AS sucursales",
    )
  ).rows[0];
const conA = await contextoBd.run({ empresaId: idA }, ver);
const sinCtx = await ver();
await pool.end();
const totalSucursales = Number(sql('SELECT count(*) FROM sucursal'));
verificar(
  'pool: con empresa usa kip_app y solo ve esa empresa',
  conA.rol === 'kip_app' && conA.empresa === idA && conA.sucursales < totalSucursales,
  JSON.stringify(conA),
);
verificar(
  'pool: sin empresa vuelve al rol de la conexión',
  sinCtx.rol !== 'kip_app' && sinCtx.empresa === '' && sinCtx.sucursales === totalSucursales,
  JSON.stringify(sinCtx),
);

// La API sigue aislando y funcionando con RLS.
verificar(
  'B no ve la sucursal de A por la API',
  (await B.a('PUT', `/sucursales/${pA.id}`, { codigo: '09', nombre: 'Intruso' })).estado === 404,
);

// Usuario con acceso a dos empresas: el administrador de A no puede cambiarle la contraseña.
const rolesA = (await A.a('GET', '/roles')).datos;
const recepcion = rolesA.find((x) => x.nombre === 'Recepción').id;
r = await A.a('POST', '/usuarios', {
  nombre: 'Admin B',
  email: 'admin@900333441.co',
  rolId: recepcion,
  sucursalIds: [],
});
verificar('A agrega al usuario que ya entra a B', r.estado === 201, JSON.stringify(r.datos));
r = await A.a('POST', `/usuarios/${r.datos.id}/password`, { password: 'otra-clave-segura' });
verificar(
  'A no restablece la contraseña de quien entra a otra empresa (403)',
  r.estado === 403 && String(r.datos.message).includes('otras empresas'),
  JSON.stringify(r),
);
const soloA = await A.a('POST', '/usuarios', {
  nombre: 'Solo A',
  email: 'solo@a.co',
  password: 'una-clave-segura',
  rolId: recepcion,
  sucursalIds: [],
});
r = await A.a('POST', `/usuarios/${soloA.datos.id}/password`, { password: 'otra-clave-segura' });
verificar('A sí restablece la de un usuario solo suyo (204)', r.estado === 204, JSON.stringify(r));
const s = sesion();
verificar(
  'el usuario entra con la contraseña nueva',
  (await s('POST', '/auth/login', { email: 'solo@a.co', password: 'otra-clave-segura' })).estado ===
    200,
);

terminar();
