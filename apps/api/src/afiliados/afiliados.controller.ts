import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  afiliadoNuevoSchema,
  afiliadoSchema,
  afiliadosQuerySchema,
  anularMembresiaSchema,
  cambiarEstadoSchema,
  membresiaNuevaSchema,
  planGimnasioSchema,
  PERMISOS,
  type AfiliadoDatos,
  type AfiliadoNuevoDatos,
  type AnularMembresiaDatos,
  type CambiarEstado,
  type MembresiaNuevaDatos,
  type PlanGimnasioDatos,
} from '@kip/shared';
import type { z } from 'zod';
import type { ContextoEmpresa } from '../auth/contexto';
import { Contexto, RequierePermiso } from '../auth/decoradores';
import { IdPipe } from '../comun/pipes';
import { ZodPipe } from '../comun/zod.pipe';
import { AfiliadosService } from './afiliados.service';
import { PlanesService } from './planes.service';

const estado = new ZodPipe(cambiarEstadoSchema);

@Controller('planes')
export class PlanesController {
  constructor(private readonly planes: PlanesService) {}

  /** Recepción necesita ver los planes para vender membresías. */
  @Get()
  @RequierePermiso(PERMISOS.AFILIADOS_VER)
  listar(@Contexto() ctx: ContextoEmpresa) {
    return this.planes.listar(ctx);
  }

  @Post()
  @RequierePermiso(PERMISOS.AFILIADOS_EDITAR)
  crear(
    @Contexto() ctx: ContextoEmpresa,
    @Body(new ZodPipe(planGimnasioSchema)) d: PlanGimnasioDatos,
  ) {
    return this.planes.crear(ctx, d);
  }

  @Put(':id')
  @RequierePermiso(PERMISOS.AFILIADOS_EDITAR)
  editar(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(planGimnasioSchema)) d: PlanGimnasioDatos,
  ) {
    return this.planes.editar(ctx, id, d);
  }

  @Patch(':id/estado')
  @RequierePermiso(PERMISOS.AFILIADOS_EDITAR)
  cambiarEstado(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(estado) d: CambiarEstado,
  ) {
    return this.planes.cambiarEstado(ctx, id, d);
  }
}

@Controller('afiliados')
export class AfiliadosController {
  constructor(private readonly afiliados: AfiliadosService) {}

  @Get()
  @RequierePermiso(PERMISOS.AFILIADOS_VER)
  listar(
    @Contexto() ctx: ContextoEmpresa,
    @Query(new ZodPipe(afiliadosQuerySchema)) q: z.output<typeof afiliadosQuerySchema>,
  ) {
    return this.afiliados.listar(ctx, q);
  }

  @Get(':id')
  @RequierePermiso(PERMISOS.AFILIADOS_VER)
  obtener(@Contexto() ctx: ContextoEmpresa, @Param('id', IdPipe) id: string) {
    return this.afiliados.obtener(ctx, id);
  }

  @Post()
  @RequierePermiso(PERMISOS.AFILIADOS_EDITAR)
  crear(
    @Contexto() ctx: ContextoEmpresa,
    @Body(new ZodPipe(afiliadoNuevoSchema)) d: AfiliadoNuevoDatos,
  ) {
    return this.afiliados.crear(ctx, d);
  }

  @Put(':id')
  @RequierePermiso(PERMISOS.AFILIADOS_EDITAR)
  editar(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(afiliadoSchema)) d: AfiliadoDatos,
  ) {
    return this.afiliados.editar(ctx, id, d);
  }

  @Patch(':id/estado')
  @RequierePermiso(PERMISOS.AFILIADOS_EDITAR)
  cambiarEstado(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(estado) d: CambiarEstado,
  ) {
    return this.afiliados.cambiarEstado(ctx, id, d);
  }

  /** POST /afiliados/:id/membresias { planId, fechaInicio? }: vender o renovar. */
  @Post(':id/membresias')
  @RequierePermiso(PERMISOS.AFILIADOS_EDITAR)
  vender(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(membresiaNuevaSchema)) d: MembresiaNuevaDatos,
  ) {
    return this.afiliados.vender(ctx, id, d);
  }

  @Post(':id/membresias/:membresiaId/congelar')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.AFILIADOS_EDITAR)
  congelar(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Param('membresiaId', IdPipe) membresiaId: string,
  ) {
    return this.afiliados.congelar(ctx, id, membresiaId);
  }

  @Post(':id/membresias/:membresiaId/descongelar')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.AFILIADOS_EDITAR)
  descongelar(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Param('membresiaId', IdPipe) membresiaId: string,
  ) {
    return this.afiliados.descongelar(ctx, id, membresiaId);
  }

  @Post(':id/membresias/:membresiaId/anular')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.AFILIADOS_EDITAR)
  anular(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Param('membresiaId', IdPipe) membresiaId: string,
    @Body(new ZodPipe(anularMembresiaSchema)) d: AnularMembresiaDatos,
  ) {
    return this.afiliados.anular(ctx, id, membresiaId, d.motivo);
  }
}
