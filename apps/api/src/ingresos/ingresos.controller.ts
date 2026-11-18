import {
  Body,
  Controller,
  Get,
  HttpCode,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import {
  anularIngresoSchema,
  ingresoNuevoSchema,
  ingresosQuerySchema,
  PERMISOS,
  type IngresoNuevoDatos,
} from '@kip/shared';
import { filter, interval, map, merge, Observable } from 'rxjs';
import type { ContextoEmpresa } from '../auth/contexto';
import { Contexto, RequierePermiso } from '../auth/decoradores';
import { IdPipe } from '../comun/pipes';
import { ZodPipe } from '../comun/zod.pipe';
import { IngresosService } from './ingresos.service';

@Controller('ingresos')
export class IngresosController {
  constructor(private readonly ingresos: IngresosService) {}

  /** Entrada del gimnasio (tablet) o recepción: registra el ingreso por documento. */
  @Post()
  @HttpCode(201)
  @RequierePermiso(PERMISOS.INGRESOS_REGISTRAR)
  registrar(
    @Contexto() ctx: ContextoEmpresa,
    @Body(new ZodPipe(ingresoNuevoSchema)) d: IngresoNuevoDatos,
  ) {
    return this.ingresos.registrar(ctx, d);
  }

  @Get()
  @RequierePermiso(PERMISOS.INGRESOS_REGISTRAR)
  listar(
    @Contexto() ctx: ContextoEmpresa,
    @Query(new ZodPipe(ingresosQuerySchema)) q: { fecha?: string },
  ) {
    return this.ingresos.listar(ctx, q.fecha);
  }

  /** Aviso en tiempo real (Server-Sent Events) de los ingresos de la sucursal; un latido cada 25 s. */
  @Sse('eventos')
  @RequierePermiso(PERMISOS.INGRESOS_REGISTRAR)
  eventos(@Contexto() ctx: ContextoEmpresa): Observable<MessageEvent> {
    const datos = this.ingresos.eventos.pipe(
      filter((e) => e.empresaId === ctx.empresaId && e.sucursalId === ctx.sucursalId),
      map((e): MessageEvent => ({ type: e.tipo, data: e.ingreso })),
    );
    const latido = interval(25_000).pipe(map((): MessageEvent => ({ type: 'latido', data: {} })));
    return merge(datos, latido);
  }

  @Get('afiliado/:id')
  @RequierePermiso(PERMISOS.AFILIADOS_VER)
  deAfiliado(@Contexto() ctx: ContextoEmpresa, @Param('id', IdPipe) id: string) {
    return this.ingresos.deAfiliado(ctx, id);
  }

  @Patch(':id/revisar')
  @RequierePermiso(PERMISOS.INGRESOS_REGISTRAR)
  revisar(@Contexto() ctx: ContextoEmpresa, @Param('id', IdPipe) id: string) {
    return this.ingresos.revisar(ctx, id);
  }

  @Post(':id/anular')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.INGRESOS_REGISTRAR)
  anular(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(anularIngresoSchema)) d: { motivo: string },
  ) {
    return this.ingresos.anular(ctx, id, d.motivo);
  }
}
