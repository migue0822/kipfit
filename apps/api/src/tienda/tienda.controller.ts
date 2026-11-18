import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  ajusteSchema,
  anularDocumentoSchema,
  cambiarEstadoSchema,
  documentosQuerySchema,
  entradaSchema,
  kardexQuerySchema,
  PERMISOS,
  productoSchema,
  productosQuerySchema,
  type AjusteDatos,
  type AnularDocumentoDatos,
  type CambiarEstado,
  type EntradaDatos,
  type ProductoDatos,
} from '@kip/shared';
import type { z } from 'zod';
import type { ContextoEmpresa } from '../auth/contexto';
import { Contexto, RequierePermiso } from '../auth/decoradores';
import { IdPipe } from '../comun/pipes';
import { ZodPipe } from '../comun/zod.pipe';
import { InventarioService } from './inventario.service';
import { ProductosService } from './productos.service';

/** Productos de la tienda (maestro por empresa; la existencia es de la sucursal de la sesión). */
@Controller('tienda/productos')
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  @Get()
  @RequierePermiso(PERMISOS.TIENDA_VER)
  listar(
    @Contexto() ctx: ContextoEmpresa,
    @Query(new ZodPipe(productosQuerySchema)) q: z.output<typeof productosQuerySchema>,
  ) {
    return this.productos.listar(ctx, q);
  }

  @Get(':id')
  @RequierePermiso(PERMISOS.TIENDA_VER)
  obtener(@Contexto() ctx: ContextoEmpresa, @Param('id', IdPipe) id: string) {
    return this.productos.obtener(ctx, id);
  }

  @Post()
  @RequierePermiso(PERMISOS.TIENDA_PRODUCTOS)
  crear(@Contexto() ctx: ContextoEmpresa, @Body(new ZodPipe(productoSchema)) d: ProductoDatos) {
    return this.productos.crear(ctx, d);
  }

  @Put(':id')
  @RequierePermiso(PERMISOS.TIENDA_PRODUCTOS)
  editar(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(productoSchema)) d: ProductoDatos,
  ) {
    return this.productos.editar(ctx, id, d);
  }

  @Patch(':id/estado')
  @RequierePermiso(PERMISOS.TIENDA_PRODUCTOS)
  estado(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(cambiarEstadoSchema)) d: CambiarEstado,
  ) {
    return this.productos.cambiarEstado(ctx, id, d);
  }
}

/** Inventario de la tienda en la sucursal de la sesión. */
@Controller('tienda/inventario')
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  @Get('documentos')
  @RequierePermiso(PERMISOS.TIENDA_VER)
  documentos(
    @Contexto() ctx: ContextoEmpresa,
    @Query(new ZodPipe(documentosQuerySchema)) q: z.output<typeof documentosQuerySchema>,
  ) {
    return this.inventario.documentos(ctx, q);
  }

  @Get('documentos/:id')
  @RequierePermiso(PERMISOS.TIENDA_VER)
  documento(@Contexto() ctx: ContextoEmpresa, @Param('id', IdPipe) id: string) {
    return this.inventario.detalle(ctx, id);
  }

  @Get('kardex')
  @RequierePermiso(PERMISOS.TIENDA_VER)
  kardex(
    @Contexto() ctx: ContextoEmpresa,
    @Query(new ZodPipe(kardexQuerySchema)) q: z.output<typeof kardexQuerySchema>,
  ) {
    return this.inventario.kardex(ctx, q);
  }

  @Post('entradas')
  @RequierePermiso(PERMISOS.TIENDA_INVENTARIO)
  entrada(@Contexto() ctx: ContextoEmpresa, @Body(new ZodPipe(entradaSchema)) d: EntradaDatos) {
    return this.inventario.entrada(ctx, d);
  }

  @Post('ajustes')
  @RequierePermiso(PERMISOS.TIENDA_INVENTARIO)
  ajuste(@Contexto() ctx: ContextoEmpresa, @Body(new ZodPipe(ajusteSchema)) d: AjusteDatos) {
    return this.inventario.ajuste(ctx, d);
  }

  @Post('documentos/:id/anular')
  @RequierePermiso(PERMISOS.TIENDA_ANULAR)
  anular(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(anularDocumentoSchema)) d: AnularDocumentoDatos,
  ) {
    return this.inventario.anular(ctx, id, d);
  }
}
