import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  abrirCajaSchema,
  anularMovimientoSchema,
  cerrarCajaSchema,
  movimientoCajaSchema,
  PERMISOS,
  turnosQuerySchema,
  type AbrirCajaDatos,
  type CerrarCajaDatos,
  type MovimientoCajaDatos,
} from '@kip/shared';
import type { ContextoEmpresa } from '../auth/contexto';
import { Contexto, PermitidoEnSoloLectura, RequierePermiso } from '../auth/decoradores';
import { IdPipe } from '../comun/pipes';
import { ZodPipe } from '../comun/zod.pipe';
import { CajaService } from './caja.service';

@Controller('caja')
export class CajaController {
  constructor(private readonly caja: CajaService) {}

  @Get('actual')
  @RequierePermiso(PERMISOS.CAJA_OPERAR)
  actual(@Contexto() ctx: ContextoEmpresa) {
    return this.caja.actual(ctx);
  }

  @Post('abrir')
  @HttpCode(201)
  @RequierePermiso(PERMISOS.CAJA_OPERAR)
  abrir(@Contexto() ctx: ContextoEmpresa, @Body(new ZodPipe(abrirCajaSchema)) d: AbrirCajaDatos) {
    return this.caja.abrir(ctx, d);
  }

  /** Cerrar siempre se permite, aun con la licencia vencida (no se puede dejar la caja abierta). */
  @Post('turnos/:id/cerrar')
  @HttpCode(200)
  @PermitidoEnSoloLectura()
  @RequierePermiso(PERMISOS.CAJA_OPERAR)
  cerrar(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(cerrarCajaSchema)) d: CerrarCajaDatos,
  ) {
    return this.caja.cerrar(ctx, id, d);
  }

  @Get('turnos')
  @RequierePermiso(PERMISOS.CAJA_OPERAR)
  turnos(
    @Contexto() ctx: ContextoEmpresa,
    @Query(new ZodPipe(turnosQuerySchema)) q: { desde?: string; hasta?: string },
  ) {
    return this.caja.listar(ctx, q.desde, q.hasta);
  }

  @Get('turnos/:id')
  @RequierePermiso(PERMISOS.CAJA_OPERAR)
  detalle(@Contexto() ctx: ContextoEmpresa, @Param('id', IdPipe) id: string) {
    return this.caja.detalle(ctx, id);
  }

  @Post('movimientos')
  @HttpCode(201)
  @RequierePermiso(PERMISOS.CAJA_OPERAR)
  crearMovimiento(
    @Contexto() ctx: ContextoEmpresa,
    @Body(new ZodPipe(movimientoCajaSchema)) d: MovimientoCajaDatos,
  ) {
    return this.caja.crearMovimiento(ctx, d);
  }

  @Post('movimientos/:id/anular')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.CAJA_OPERAR)
  anularMovimiento(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(anularMovimientoSchema)) d: { motivo: string },
  ) {
    return this.caja.anularMovimiento(ctx, id, d.motivo);
  }
}

@Controller('recibos')
export class RecibosController {
  constructor(private readonly caja: CajaService) {}

  /** Datos del recibo para imprimirlo (quien vende membresías puede reimprimir). */
  @Get(':id')
  @RequierePermiso(PERMISOS.AFILIADOS_VER)
  uno(@Contexto() ctx: ContextoEmpresa, @Param('id', IdPipe) id: string) {
    return this.caja.recibo(ctx, id);
  }
}
