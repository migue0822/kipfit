/**
 * Utilidades de las pruebas de punta a punta: hablan con la API real (HTTP) sobre una base
 * vacía. Las corre `pnpm --filter @kip/api e2e` (ver correr.sh); necesitan PostgreSQL y psql.
 */
import { execFileSync } from 'node:child_process';

export { calcularDV } from '@kip/shared';

const URL = process.env.E2E_URL ?? 'http://localhost:3999/api/v1';
export const BASE = process.env.E2E_DB ?? 'postgresql://kip:kip@localhost:5434/kipfit_e2e';

let fallas = 0;
let total = 0;

export function verificar(nombre, ok, detalle = '') {
  total++;
  if (ok) console.log(`OK    ${nombre}`);
  else {
    fallas++;
    console.log(`FALLA ${nombre}${detalle ? `\n      ${detalle}` : ''}`);
  }
}

/** Una sesión de navegador: guarda la cookie y devuelve { estado, datos }. */
export function sesion() {
  let cookie = '';
  return async (metodo, ruta, cuerpo) => {
    const r = await fetch(URL + ruta, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
    const nueva = r.headers.get('set-cookie');
    if (nueva) cookie = nueva.split(';')[0];
    const texto = await r.text();
    let datos = texto;
    try {
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      /* respuesta sin JSON */
    }
    return { estado: r.status, datos };
  };
}

/** Consulta directa a la base (una sola columna/fila como texto). */
export function sql(consulta) {
  return execFileSync('psql', [BASE, '-tAc', consulta], { encoding: 'utf8' }).trim();
}

/** Registra una empresa nueva con su administrador y deja la sesión dentro de ella. */
export async function nuevaEmpresa(nit, empresa = {}, correo = `admin@${nit}.co`) {
  const { calcularDV } = await import('@kip/shared');
  const a = sesion();
  const r = await a('POST', '/auth/registro', {
    empresa: { nit, dv: calcularDV(nit), razonSocial: `Gimnasio ${nit}`, ...empresa },
    usuario: { nombre: 'Administrador', email: correo, password: 'una-clave-segura' },
  });
  if (r.estado !== 201) throw new Error(`No se pudo registrar ${nit}: ${JSON.stringify(r.datos)}`);
  return { a, perfil: r.datos };
}

export function terminar() {
  console.log(fallas ? `\n${fallas} de ${total} FALLARON` : `\nTodo OK (${total})`);
  process.exit(fallas ? 1 : 0);
}
