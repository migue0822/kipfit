import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SaludController } from './salud.controller';

function crear(queryRaw: () => Promise<unknown>) {
  return Test.createTestingModule({
    controllers: [SaludController],
    providers: [{ provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
  })
    .compile()
    .then((m) => m.get(SaludController));
}

describe('SaludController', () => {
  it('reporta ok cuando la base responde', async () => {
    const c = await crear(async () => [{ '?column?': 1 }]);
    await expect(c.estado()).resolves.toMatchObject({ estado: 'ok', baseDatos: 'ok' });
  });

  it('reporta error de base sin tumbar la API', async () => {
    const c = await crear(async () => {
      throw new Error('sin conexión');
    });
    await expect(c.estado()).resolves.toMatchObject({ estado: 'ok', baseDatos: 'error' });
  });
});
