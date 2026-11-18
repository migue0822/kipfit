import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  normalizarBusqueda,
  PERMISOS,
  tienePermiso,
  type CambiarEstado,
  type ProductoDatos,
  type ProductoVista,
} from '@kip/shared';
import type { z } from 'zod';
import type { productosQuerySchema } from '@kip/shared';
import type { ContextoEmpresa } from '../auth/contexto';
import { registrarAuditoria } from '../comun/auditoria';
import { esViolacionUnica, filtroEstado, terminosBusqueda } from '../comun/pipes';
import { PrismaService } from '../prisma/prisma.service';

type Fila = {
  id: string;
  codigo: string | null;
  nombre: string;
  categoria: string | null;
  precioVenta: { toFixed(n: number): string };
  activo: boolean;
  existencias: {
    cantidad: number;
    valor: { toFixed(n: number): string };
    costoPromedio: { toFixed(n: number): string };
  }[];
};

const aVista = (p: Fila, veCostos: boolean): ProductoVista => {
  const e = p.existencias[0];
  return {
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    categoria: p.categoria,
    precioVenta: p.precioVenta.toFixed(2),
    activo: p.activo,
    existencia: e?.cantidad ?? 0,
    costoPromedio: veCostos ? (e?.costoPromedio.toFixed(4) ?? '0.0000') : null,
    valorInventario: veCostos ? (e?.valor.toFixed(2) ?? '0.00') : null,
  };
};

const texto = (d: { nombre: string; codigo?: string; categoria?: string }) =>
  normalizarBusqueda([d.codigo, d.nombre, d.categoria].filter(Boolean).join(' '));

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  private incluirExistencia(ctx: ContextoEmpresa) {
    return { existencias: { where: { sucursalId: ctx.sucursalId } } };
  }

  async listar(
    ctx: ContextoEmpresa,
    q: z.output<typeof productosQuerySchema>,
  ): Promise<ProductoVista[]> {
    const veCostos = tienePermiso(ctx.permisos, PERMISOS.TIENDA_COSTOS);
    const filas = await this.prisma.producto.findMany({
      where: {
        empresaId: ctx.empresaId,
        ...filtroEstado(q.estado),
        AND: terminosBusqueda(q.buscar).map((t) => ({ textoBusqueda: { contains: t } })),
      },
      include: this.incluirExistencia(ctx),
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
      take: 1000,
    });
    return filas.map((f) => aVista(f, veCostos));
  }

  async obtener(ctx: ContextoEmpresa, id: string): Promise<ProductoVista> {
    const p = await this.prisma.producto.findFirst({
      where: { id, empresaId: ctx.empresaId },
      include: this.incluirExistencia(ctx),
    });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return aVista(p, tienePermiso(ctx.permisos, PERMISOS.TIENDA_COSTOS));
  }

  async crear(ctx: ContextoEmpresa, d: ProductoDatos): Promise<ProductoVista> {
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const p = await tx.producto.create({
          data: {
            empresaId: ctx.empresaId,
            codigo: d.codigo ?? null,
            nombre: d.nombre,
            categoria: d.categoria ?? null,
            precioVenta: d.precioVenta,
            textoBusqueda: texto(d),
          },
        });
        await registrarAuditoria(tx, ctx, {
          entidad: 'producto',
          entidadId: p.id,
          accion: 'crear',
          despues: d,
        });
        return p.id;
      });
      return this.obtener(ctx, id);
    } catch (e) {
      if (esViolacionUnica(e)) throw new ConflictException('Ya existe un producto con ese código');
      throw e;
    }
  }

  /** Editar el precio no cambia lo ya vendido: cada venta guarda el precio de su momento. */
  async editar(ctx: ContextoEmpresa, id: string, d: ProductoDatos): Promise<ProductoVista> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const antes = await tx.producto.findFirst({ where: { id, empresaId: ctx.empresaId } });
        if (!antes) throw new NotFoundException('Producto no encontrado');
        const p = await tx.producto.update({
          where: { id },
          data: {
            codigo: d.codigo ?? null,
            nombre: d.nombre,
            categoria: d.categoria ?? null,
            precioVenta: d.precioVenta,
            textoBusqueda: texto(d),
          },
        });
        await registrarAuditoria(tx, ctx, {
          entidad: 'producto',
          entidadId: id,
          accion: antes.precioVenta.equals(p.precioVenta) ? 'editar' : 'cambiar_precio',
          antes: {
            codigo: antes.codigo,
            nombre: antes.nombre,
            categoria: antes.categoria,
            precioVenta: antes.precioVenta.toFixed(2),
          },
          despues: { ...d },
        });
      });
      return this.obtener(ctx, id);
    } catch (e) {
      if (esViolacionUnica(e)) throw new ConflictException('Ya existe un producto con ese código');
      throw e;
    }
  }

  /** Nada se borra: se inactiva (deja de salir en la venta, conserva su historial y existencias). */
  async cambiarEstado(ctx: ContextoEmpresa, id: string, d: CambiarEstado): Promise<ProductoVista> {
    await this.prisma.$transaction(async (tx) => {
      const antes = await tx.producto.findFirst({ where: { id, empresaId: ctx.empresaId } });
      if (!antes) throw new NotFoundException('Producto no encontrado');
      if (antes.activo === d.activo) return;
      await tx.producto.update({ where: { id }, data: { activo: d.activo } });
      await registrarAuditoria(tx, ctx, {
        entidad: 'producto',
        entidadId: id,
        accion: d.activo ? 'reactivar' : 'inactivar',
      });
    });
    return this.obtener(ctx, id);
  }
}
