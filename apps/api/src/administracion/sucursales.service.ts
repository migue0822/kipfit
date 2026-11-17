import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CambiarEstado, Sucursal, SucursalDatos } from '@kip/shared';
import type { ContextoEmpresa } from '../auth/contexto';
import { registrarAuditoria } from '../comun/auditoria';
import { crearNumeraciones } from '../comun/numeracion';
import { esViolacionUnica } from '../comun/pipes';
import { exigirCupoPlan } from './comun';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SELECT = {
  id: true,
  codigo: true,
  nombre: true,
  direccion: true,
  telefono: true,
  activa: true,
} satisfies Prisma.SucursalSelect;

const aSucursal = (s: Prisma.SucursalGetPayload<{ select: typeof SELECT }>): Sucursal => s;

@Injectable()
export class SucursalesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(ctx: ContextoEmpresa): Promise<Sucursal[]> {
    const filas = await this.prisma.sucursal.findMany({
      where: { empresaId: ctx.empresaId },
      select: SELECT,
      orderBy: { codigo: 'asc' },
    });
    return filas.map(aSucursal);
  }

  /** Sucursal nueva con sus numeraciones (RC + código). */
  async crear(ctx: ContextoEmpresa, d: SucursalDatos): Promise<Sucursal> {
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sucursales:${ctx.empresaId}`}))`;
        await exigirCupoPlan(tx, ctx.empresaId, 'sucursales');
        const s = await tx.sucursal.create({
          data: {
            empresaId: ctx.empresaId,
            codigo: d.codigo,
            nombre: d.nombre,
            direccion: d.direccion,
            telefono: d.telefono,
          },
          select: { id: true, empresaId: true, codigo: true },
        });
        await crearNumeraciones(tx, s);
        await registrarAuditoria(tx, ctx, {
          entidad: 'sucursal',
          entidadId: s.id,
          accion: 'crear',
          despues: d,
        });
        return s.id;
      });
      return this.obtener(ctx, id);
    } catch (e) {
      if (esViolacionUnica(e)) throw new ConflictException('Ya existe una sucursal con ese código');
      throw e;
    }
  }

  /** El código no cambia: hace parte de los prefijos de numeración (VT02, CJ02…). */
  async editar(ctx: ContextoEmpresa, id: string, d: SucursalDatos): Promise<Sucursal> {
    await this.prisma.$transaction(async (tx) => {
      const antes = await tx.sucursal.findFirst({
        where: { id, empresaId: ctx.empresaId },
        select: {
          codigo: true,
          nombre: true,
          direccion: true,
          telefono: true,
        },
      });
      if (!antes) throw new NotFoundException('Sucursal no encontrada');
      if (antes.codigo !== d.codigo) {
        throw new BadRequestException(
          'El código no se puede cambiar porque hace parte de la numeración de los documentos',
        );
      }
      const datos = {
        nombre: d.nombre,
        direccion: d.direccion ?? null,
        telefono: d.telefono ?? null,
      };
      await tx.sucursal.update({ where: { id }, data: datos });
      await registrarAuditoria(tx, ctx, {
        entidad: 'sucursal',
        entidadId: id,
        accion: 'editar',
        antes,
        despues: datos,
      });
    });
    return this.obtener(ctx, id);
  }

  /**
   * Inactivar: quienes estén trabajando en ella pierden el acceso en su siguiente
   * petición. No se permite la última activa, la propia ni una con caja abierta.
   */
  async cambiarEstado(ctx: ContextoEmpresa, id: string, d: CambiarEstado): Promise<Sucursal> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sucursales:${ctx.empresaId}`}))`;
      const s = await tx.sucursal.findFirst({
        where: { id, empresaId: ctx.empresaId },
        select: { nombre: true, activa: true },
      });
      if (!s) throw new NotFoundException('Sucursal no encontrada');
      if (d.activo && !s.activa) await exigirCupoPlan(tx, ctx.empresaId, 'sucursales');
      if (!d.activo) {
        if (id === ctx.sucursalId) {
          throw new BadRequestException(
            'Está trabajando en esta sucursal: cámbiese a otra antes de inactivarla',
          );
        }
        const activas = await tx.sucursal.count({
          where: { empresaId: ctx.empresaId, activa: true, id: { not: id } },
        });
        if (activas === 0)
          throw new BadRequestException('La empresa debe tener al menos una sucursal activa');
        // Cuando exista la caja: no inactivar una sucursal con turnos abiertos.
      }
      await tx.sucursal.update({ where: { id }, data: { activa: d.activo } });
      await registrarAuditoria(tx, ctx, {
        entidad: 'sucursal',
        entidadId: id,
        accion: d.activo ? 'reactivar' : 'inactivar',
        despues: { nombre: s.nombre },
      });
    });
    return this.obtener(ctx, id);
  }

  private async obtener(ctx: ContextoEmpresa, id: string): Promise<Sucursal> {
    const s = await this.prisma.sucursal.findFirst({
      where: { id, empresaId: ctx.empresaId },
      select: SELECT,
    });
    if (!s) throw new NotFoundException('Sucursal no encontrada');
    return aSucursal(s);
  }
}
