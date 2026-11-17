import { Controller, Get } from '@nestjs/common';
import { Publico } from '../auth/decoradores';
import { PrismaService } from '../prisma/prisma.service';

@Publico()
@Controller('salud')
export class SaludController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/v1/salud — estado de la API y de la base de datos. */
  @Get()
  async estado() {
    let baseDatos: 'ok' | 'error' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      baseDatos = 'error';
    }
    return { estado: 'ok', baseDatos, hora: new Date().toISOString() };
  }
}
