import { PrismaPg } from '@prisma/adapter-pg';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { PoolConEmpresa } from './contexto-bd';

describe('PoolConEmpresa', () => {
  it('es un pool del mismo pg que usa el adaptador de Prisma (si no, lo tomaría como configuración)', async () => {
    const pool = new PoolConEmpresa({ connectionString: 'postgresql://x:y@localhost:1/z' });
    const pgAdaptador = createRequire(require.resolve('@prisma/adapter-pg'))('pg');
    expect(pool).toBeInstanceOf(pgAdaptador.Pool);
    // PrismaPg guarda el pool como externo, no lo convierte en uno nuevo.
    const adaptador = new PrismaPg(pool) as unknown as { externalPool?: unknown };
    expect(adaptador.externalPool).toBe(pool);
    await pool.end();
  });
});
