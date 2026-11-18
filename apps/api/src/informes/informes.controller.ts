import { Controller, Get, Query } from '@nestjs/common';
import { PERMISOS, periodoSchema, vencimientosQuerySchema, type PeriodoInforme } from '@kip/shared';
import type { ContextoEmpresa } from '../auth/contexto';
import { Contexto, RequierePermiso } from '../auth/decoradores';
import { ZodPipe } from '../comun/zod.pipe';
import { InformesService } from './informes.service';

/** Informes de la sucursal de la sesión. Todos con `informes.ver`. */
@Controller('informes')
export class InformesController {
  constructor(private readonly informes: InformesService) {}

  @Get('cobros')
  @RequierePermiso(PERMISOS.INFORMES_VER)
  cobros(@Contexto() ctx: ContextoEmpresa, @Query(new ZodPipe(periodoSchema)) p: PeriodoInforme) {
    return this.informes.cobros(ctx, p);
  }

  @Get('ingresos')
  @RequierePermiso(PERMISOS.INFORMES_VER)
  ingresos(@Contexto() ctx: ContextoEmpresa, @Query(new ZodPipe(periodoSchema)) p: PeriodoInforme) {
    return this.informes.ingresos(ctx, p);
  }

  @Get('vencimientos')
  @RequierePermiso(PERMISOS.INFORMES_VER)
  vencimientos(
    @Contexto() ctx: ContextoEmpresa,
    @Query(new ZodPipe(vencimientosQuerySchema)) q: { dias: number; vencidasDias: number },
  ) {
    return this.informes.vencimientos(ctx, q.dias, q.vencidasDias);
  }

  @Get('cajas')
  @RequierePermiso(PERMISOS.INFORMES_VER)
  cajas(@Contexto() ctx: ContextoEmpresa, @Query(new ZodPipe(periodoSchema)) p: PeriodoInforme) {
    return this.informes.cajas(ctx, p);
  }
}
