import { Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  anularPagoLicenciaSchema,
  cambiarEstadoPlanSchema,
  crearEmpresaPlataformaSchema,
  licenciaSchema,
  pagoLicenciaSchema,
  planSchema,
  type CrearEmpresaPlataforma,
  type LicenciaDatos,
  type PagoLicenciaDatos,
  type PlanDatos,
} from '@kip/shared';
import { Publico } from '../auth/decoradores';
import { IdPipe } from '../comun/pipes';
import { ZodPipe } from '../comun/zod.pipe';
import { ClavePlataformaGuard, quienPlataforma } from './clave.guard';
import { PlataformaService } from './plataforma.service';

/**
 * API de plataforma (empresas, licencias, pagos y planes) para la consola de OrdenKipu. Sin sesión de
 * Kipfit: la protege `ClavePlataformaGuard` y solo se alcanza por la red interna del servidor.
 */
@Controller('plataforma')
@Publico()
@UseGuards(ClavePlataformaGuard)
export class PlataformaController {
  constructor(private readonly plataforma: PlataformaService) {}

  @Get('empresas')
  empresas() {
    return this.plataforma.empresas();
  }

  @Get('empresas/:id')
  empresa(@Param('id', IdPipe) id: string) {
    return this.plataforma.empresa(id);
  }

  @Post('empresas')
  crearEmpresa(
    @Req() req: Request,
    @Body(new ZodPipe(crearEmpresaPlataformaSchema)) d: CrearEmpresaPlataforma,
  ) {
    return this.plataforma.crearEmpresa(quienPlataforma(req), d);
  }

  @Put('empresas/:id/licencia')
  licencia(
    @Req() req: Request,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(licenciaSchema)) d: LicenciaDatos,
  ) {
    return this.plataforma.cambiarLicencia(quienPlataforma(req), id, d);
  }

  @Post('empresas/:id/pagos')
  pagar(
    @Req() req: Request,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(pagoLicenciaSchema)) d: PagoLicenciaDatos,
  ) {
    return this.plataforma.registrarPago(quienPlataforma(req), id, d);
  }

  @Post('pagos/:id/anular')
  anularPago(
    @Req() req: Request,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(anularPagoLicenciaSchema)) d: { motivo: string },
  ) {
    return this.plataforma.anularPago(quienPlataforma(req), id, d.motivo);
  }

  @Get('planes')
  planes() {
    return this.plataforma.planes();
  }

  @Post('planes')
  crearPlan(@Body(new ZodPipe(planSchema)) d: PlanDatos) {
    return this.plataforma.crearPlan(d);
  }

  @Put('planes/:id')
  editarPlan(@Param('id', IdPipe) id: string, @Body(new ZodPipe(planSchema)) d: PlanDatos) {
    return this.plataforma.editarPlan(id, d);
  }

  @Patch('planes/:id/estado')
  estadoPlan(
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(cambiarEstadoPlanSchema)) d: { activo: boolean },
  ) {
    return this.plataforma.estadoPlan(id, d.activo);
  }
}
