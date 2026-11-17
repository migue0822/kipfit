import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import type pg from 'pg';

/**
 * El `pg` que usa `@prisma/adapter-pg`. PrismaPg solo trata como pool lo que sea `instanceof` su `pg.Pool`; si no,
 * lo toma como configuración y la conexión falla. En Windows, la misma carpeta escrita con otras mayúsculas
 * (`C:\proyectos` y `C:\Proyectos`) hace que Node cargue `pg` dos veces, así que se pide el `pg` del adaptador.
 */
const pgDelAdaptador: typeof pg = createRequire(require.resolve('@prisma/adapter-pg'))('pg');

/**
 * Segunda barrera entre empresas (RLS de PostgreSQL).
 *
 * Cada petición HTTP corre dentro de `contextoBd.run({}, …)` (middleware en main.ts). Cuando la ruta exige empresa,
 * `SesionGuard` pone `empresaId` en ese contexto. Cada vez que el pool entrega una conexión, la deja con:
 *   - empresa: `role = kip_app` (sin privilegios para saltarse RLS) y `app.empresa_id` = la empresa, así cada
 *     consulta solo ve y escribe filas de esa empresa aunque al código se le olvide el filtro;
 *   - sin empresa (ingreso, registro, procesos de fondo, demo): el rol de la conexión, sin restricción.
 * Las políticas están en la migración `rls`. `BD_RLS=no` desactiva el cambio de rol (solo para emergencias).
 */
export type ContextoBd = { empresaId?: string };

export const contextoBd = new AsyncLocalStorage<ContextoBd>();

/** Ejecuta `fn` fuera del contexto de la petición (procesos de fondo disparados desde una petición). */
export function sinEmpresa<T>(fn: () => T): T {
  return contextoBd.exit(fn);
}

export const ROL_APLICACION = 'kip_app';

type ClienteConContexto = pg.PoolClient & { contextoRls?: string };
type CallbackConexion = (err: Error | undefined, client?: pg.PoolClient, done?: () => void) => void;

/** Pool de `pg` que, al entregar cada conexión, aplica el contexto de empresa de quien la pide. */
export class PoolConEmpresa extends pgDelAdaptador.Pool {
  // pg-pool usa connect(callback) internamente en query(); se atienden las dos formas.
  override connect(): Promise<pg.PoolClient>;
  override connect(callback: CallbackConexion): void;
  override connect(callback?: CallbackConexion): Promise<pg.PoolClient> | void {
    // El contexto se lee ahora, en la cadena asíncrona de quien pidió la conexión.
    const empresaId = process.env.BD_RLS === 'no' ? undefined : contextoBd.getStore()?.empresaId;
    const promesa = super.connect().then(async (client: ClienteConContexto) => {
      const clave = empresaId ?? '';
      if (client.contextoRls !== clave) {
        try {
          await client.query(
            "SELECT set_config('role', $1, false), set_config('app.empresa_id', $2, false)",
            [empresaId ? ROL_APLICACION : 'none', clave],
          );
        } catch (e) {
          client.release(e as Error);
          throw e;
        }
        client.contextoRls = clave;
      }
      return client;
    });
    if (!callback) return promesa;
    promesa.then(
      (client) => callback(undefined, client, () => client.release()),
      (err: Error) => callback(err),
    );
  }
}
