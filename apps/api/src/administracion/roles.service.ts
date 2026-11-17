import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PERMISO_TOTAL, type CambiarEstado, type Rol, type RolDatos } from '@kip/shared';
import type { ContextoEmpresa } from '../auth/contexto';
import { registrarAuditoria } from '../comun/auditoria';
import { esViolacionUnica } from '../comun/pipes';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { bloquearAdministracion } from './comun';

const REPETIDO = 'Ya existe un rol con ese nombre';
const ADMIN_FIJO = 'El rol Administrador tiene acceso total y no se puede modificar';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(ctx: ContextoEmpresa): Promise<Rol[]> {
    const roles = await this.prisma.rol.findMany({
      where: { empresaId: ctx.empresaId },
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        permisos: true,
        activo: true,
        _count: { select: { membresias: { where: { activa: true } } } },
      },
    });
    return roles
      .map((r) => ({
        id: r.id,
        nombre: r.nombre,
        permisos: r.permisos,
        activo: r.activo,
        esAdministrador: r.permisos.includes(PERMISO_TOTAL),
        usuarios: r._count.membresias,
      }))
      .sort((a, b) => Number(b.esAdministrador) - Number(a.esAdministrador));
  }

  async crear(ctx: ContextoEmpresa, d: RolDatos): Promise<Rol> {
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const r = await tx.rol.create({
          data: { empresaId: ctx.empresaId, nombre: d.nombre, permisos: d.permisos },
          select: { id: true },
        });
        await registrarAuditoria(tx, ctx, {
          entidad: 'rol',
          entidadId: r.id,
          accion: 'crear',
          despues: d,
        });
        return r.id;
      });
      return this.obtener(ctx, id);
    } catch (e) {
      if (esViolacionUnica(e)) throw new ConflictException(REPETIDO);
      throw e;
    }
  }

  async editar(ctx: ContextoEmpresa, id: string, d: RolDatos): Promise<Rol> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await bloquearAdministracion(tx, ctx.empresaId);
        const antes = await this.rolEditable(tx, ctx, id);
        await tx.rol.update({ where: { id }, data: { nombre: d.nombre, permisos: d.permisos } });
        await registrarAuditoria(tx, ctx, {
          entidad: 'rol',
          entidadId: id,
          accion: 'editar',
          antes: { nombre: antes.nombre, permisos: antes.permisos },
          despues: d,
        });
      });
    } catch (e) {
      if (esViolacionUnica(e)) throw new ConflictException(REPETIDO);
      throw e;
    }
    return this.obtener(ctx, id);
  }

  /** Inactivar solo si ningún usuario activo lo tiene asignado. */
  async cambiarEstado(ctx: ContextoEmpresa, id: string, d: CambiarEstado): Promise<Rol> {
    await this.prisma.$transaction(async (tx) => {
      await bloquearAdministracion(tx, ctx.empresaId);
      const rol = await this.rolEditable(tx, ctx, id);
      if (!d.activo) {
        const usuarios = await tx.membresia.count({ where: { rolId: id, activa: true } });
        if (usuarios > 0) {
          throw new ConflictException(
            `${usuarios === 1 ? 'Un usuario activo tiene' : `${usuarios} usuarios activos tienen`} este rol; asígneles otro antes de inactivarlo`,
          );
        }
      }
      await tx.rol.update({ where: { id }, data: { activo: d.activo } });
      await registrarAuditoria(tx, ctx, {
        entidad: 'rol',
        entidadId: id,
        accion: d.activo ? 'reactivar' : 'inactivar',
        despues: { nombre: rol.nombre },
      });
    });
    return this.obtener(ctx, id);
  }

  private async obtener(ctx: ContextoEmpresa, id: string): Promise<Rol> {
    const r = (await this.listar(ctx)).find((x) => x.id === id);
    if (!r) throw new NotFoundException('Rol no encontrado');
    return r;
  }

  private async rolEditable(tx: Prisma.TransactionClient, ctx: ContextoEmpresa, id: string) {
    const rol = await tx.rol.findFirst({
      where: { id, empresaId: ctx.empresaId },
      select: { nombre: true, permisos: true },
    });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    if (rol.permisos.includes(PERMISO_TOTAL)) throw new BadRequestException(ADMIN_FIJO);
    return rol;
  }
}
