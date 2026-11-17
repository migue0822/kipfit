import { Body, Controller, Get, Put } from '@nestjs/common';
import { empresaDatosSchema, PERMISOS, type EmpresaDatos } from '@kip/shared';
import type { ContextoEmpresa } from '../auth/contexto';
import { Contexto, RequiereEmpresa, RequierePermiso } from '../auth/decoradores';
import { ZodPipe } from '../comun/zod.pipe';
import { EmpresaService } from './empresa.service';

@Controller('empresa')
export class EmpresaController {
  constructor(private readonly empresa: EmpresaService) {}

  @Get()
  @RequiereEmpresa()
  obtener(@Contexto() ctx: ContextoEmpresa) {
    return this.empresa.obtener(ctx);
  }

  @Put()
  @RequierePermiso(PERMISOS.EMPRESA_CONFIGURAR)
  editar(@Contexto() ctx: ContextoEmpresa, @Body(new ZodPipe(empresaDatosSchema)) d: EmpresaDatos) {
    return this.empresa.editar(ctx, d);
  }
}
