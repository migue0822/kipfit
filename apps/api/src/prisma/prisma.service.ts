import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PoolConEmpresa } from './contexto-bd';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  /** El pool de conexiones (con el contexto de empresa), para leer con cursores sin pasar por Prisma. */
  readonly pool: PoolConEmpresa;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'Falta DATABASE_URL. Copie .env.example a apps/api/.env (en Windows: copy .env.example apps\\api\\.env).',
      );
    }
    // El pool aplica en cada conexión la empresa de la petición (RLS, ver contexto-bd.ts).
    const pool = new PoolConEmpresa({ connectionString: url });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
