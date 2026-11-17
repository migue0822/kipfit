import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PERMISO_TOTAL,
  type CambiarEstado,
  type RestablecerPasswordDatos,
  type UsuarioCreado,
  type UsuarioEdicionDatos,
  type UsuarioEmpresa,
  type UsuarioNuevoDatos,
} from '@kip/shared';
import { hashPassword } from '../auth/password';
import type { ContextoEmpresa } from '../auth/contexto';
import { registrarAuditoria } from '../comun/auditoria';
import { esViolacionUnica } from '../comun/pipes';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { bloquearAdministracion, exigirCupoPlan, exigirOtroAdministrador } from './comun';

const SELECT = {
  activa: true,
  usuario: {
    select: {
      id: true,
      nombre: true,
      email: true,
      _count: { select: { membresias: true } },
    },
  },
  rol: { select: { id: true, nombre: true, permisos: true } },
  sucursales: {
    select: { sucursal: { select: { id: true, nombre: true, codigo: true } } },
  },
} satisfies Prisma.MembresiaSelect;

type Fila = Prisma.MembresiaGetPayload<{ select: typeof SELECT }>;

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(ctx: ContextoEmpresa): Promise<UsuarioEmpresa[]> {
    const filas = await this.prisma.membresia.findMany({
      where: { empresaId: ctx.empresaId },
      select: SELECT,
      orderBy: [{ activa: 'desc' }, { usuario: { nombre: 'asc' } }],
    });
    return filas.map((f) => this.aUsuario(ctx, f));
  }

  /**
   * Da acceso a la empresa. Si el correo no tiene cuenta, la crea con la
   * contraseña indicada; si ya la tiene (en otra empresa), solo agrega el acceso
   * y la persona entra con su contraseña de siempre.
   */
  async crear(ctx: ContextoEmpresa, d: UsuarioNuevoDatos): Promise<UsuarioCreado> {
    const hash = d.password ? await hashPassword(d.password) : null;
    let cuentaExistente = false;
    let usuarioId: string;
    try {
      usuarioId = await this.prisma.$transaction(async (tx) => {
        await bloquearAdministracion(tx, ctx.empresaId);
        await exigirCupoPlan(tx, ctx.empresaId, 'usuarios');
        await this.rolAsignable(tx, ctx, d.rolId);
        await this.sucursalesValidas(tx, ctx, d.sucursalIds);

        let usuario = await tx.usuario.findUnique({
          where: { email: d.email },
          select: { id: true },
        });
        if (usuario) {
          cuentaExistente = true;
          const ya = await tx.membresia.findUnique({
            where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId: ctx.empresaId } },
            select: { activa: true },
          });
          if (ya) {
            throw new ConflictException(
              ya.activa
                ? 'Ese correo ya es usuario de la empresa'
                : 'Ese correo ya es usuario de la empresa pero está inactivo; reactívelo en la lista',
            );
          }
        } else {
          if (!hash)
            throw new BadRequestException('Indique una contraseña inicial para el usuario');
          usuario = await tx.usuario.create({
            data: { email: d.email, nombre: d.nombre, hashPassword: hash },
            select: { id: true },
          });
        }
        await tx.membresia.create({
          data: {
            usuarioId: usuario.id,
            empresaId: ctx.empresaId,
            rolId: d.rolId,
            sucursales: { create: d.sucursalIds.map((sucursalId) => ({ sucursalId })) },
          },
        });
        await registrarAuditoria(tx, ctx, {
          entidad: 'usuario',
          entidadId: usuario.id,
          accion: 'crear',
          despues: {
            email: d.email,
            rolId: d.rolId,
            sucursalIds: d.sucursalIds,
            cuentaExistente,
          },
        });
        return usuario.id;
      });
    } catch (e) {
      // Dos altas simultáneas del mismo correo.
      if (esViolacionUnica(e)) throw new ConflictException('Ese correo ya está registrado');
      throw e;
    }
    return { ...(await this.obtener(ctx, usuarioId)), cuentaExistente };
  }

  /** Cambia el rol y las sucursales. Nadie se edita a sí mismo (evita quedar sin acceso). */
  async editar(ctx: ContextoEmpresa, usuarioId: string, d: UsuarioEdicionDatos) {
    this.noUstedMismo(ctx, usuarioId, 'No puede cambiar su propio rol ni sus sucursales');
    await this.prisma.$transaction(async (tx) => {
      await bloquearAdministracion(tx, ctx.empresaId);
      const m = await this.membresia(tx, ctx, usuarioId);
      const nuevo = await this.rolAsignable(tx, ctx, d.rolId);
      await this.sucursalesValidas(tx, ctx, d.sucursalIds);
      if (m.rol.permisos.includes(PERMISO_TOTAL) && !nuevo.permisos.includes(PERMISO_TOTAL)) {
        await exigirOtroAdministrador(tx, ctx.empresaId, usuarioId);
      }
      await tx.membresiaSucursal.deleteMany({ where: { membresiaId: m.id } });
      await tx.membresia.update({
        where: { id: m.id },
        data: {
          rolId: d.rolId,
          sucursales: { create: d.sucursalIds.map((sucursalId) => ({ sucursalId })) },
        },
      });
      await registrarAuditoria(tx, ctx, {
        entidad: 'usuario',
        entidadId: usuarioId,
        accion: 'editar',
        antes: { rolId: m.rol.id, sucursalIds: m.sucursales.map((s) => s.sucursalId) },
        despues: d,
      });
    });
    return this.obtener(ctx, usuarioId);
  }

  /** Inactivar quita el acceso a esta empresa de inmediato (las sesiones lo verifican en cada petición). */
  async cambiarEstado(ctx: ContextoEmpresa, usuarioId: string, d: CambiarEstado) {
    this.noUstedMismo(ctx, usuarioId, 'No puede inactivarse a sí mismo');
    await this.prisma.$transaction(async (tx) => {
      await bloquearAdministracion(tx, ctx.empresaId);
      const m = await this.membresia(tx, ctx, usuarioId);
      if (!d.activo && m.rol.permisos.includes(PERMISO_TOTAL)) {
        await exigirOtroAdministrador(tx, ctx.empresaId, usuarioId);
      }
      if (d.activo && !m.activa) await exigirCupoPlan(tx, ctx.empresaId, 'usuarios');
      if (d.activo) {
        const rol = await tx.rol.findUniqueOrThrow({
          where: { id: m.rol.id },
          select: { activo: true },
        });
        if (!rol.activo) {
          throw new BadRequestException(
            'Su rol está inactivo: asígnele otro rol antes de reactivarlo',
          );
        }
      }
      await tx.membresia.update({ where: { id: m.id }, data: { activa: d.activo } });
      await registrarAuditoria(tx, ctx, {
        entidad: 'usuario',
        entidadId: usuarioId,
        accion: d.activo ? 'reactivar' : 'inactivar',
      });
    });
    return this.obtener(ctx, usuarioId);
  }

  /**
   * Un administrador asigna una contraseña nueva (olvido). Solo para cuentas que
   * pertenecen únicamente a esta empresa: así nadie toma el control de una cuenta
   * que también entra a otras empresas. Cierra las sesiones abiertas del usuario.
   */
  async restablecerPassword(ctx: ContextoEmpresa, usuarioId: string, d: RestablecerPasswordDatos) {
    this.noUstedMismo(ctx, usuarioId, 'Para cambiar su propia contraseña use Mi cuenta');
    const hash = await hashPassword(d.password);
    await this.prisma.$transaction(async (tx) => {
      await this.membresia(tx, ctx, usuarioId);
      // Con RLS esta transacción solo ve la empresa propia: la pregunta va por una función de la base.
      const [fila] = await tx.$queryRaw<{ otras: boolean }[]>`
        SELECT usuario_en_otras_empresas(${usuarioId}::uuid, ${ctx.empresaId}::uuid) AS otras`;
      if (fila?.otras) {
        throw new ForbiddenException(
          'Este usuario también tiene acceso a otras empresas: solo él puede cambiar su contraseña',
        );
      }
      await tx.usuario.update({ where: { id: usuarioId }, data: { hashPassword: hash } });
      await tx.sesion.updateMany({
        where: { usuarioId, revocadaEn: null },
        data: { revocadaEn: new Date() },
      });
      await registrarAuditoria(tx, ctx, {
        entidad: 'usuario',
        entidadId: usuarioId,
        accion: 'restablecer_password',
      });
    });
  }

  // ───────────── Apoyo ─────────────

  private async obtener(ctx: ContextoEmpresa, usuarioId: string): Promise<UsuarioEmpresa> {
    const f = await this.prisma.membresia.findUnique({
      where: { usuarioId_empresaId: { usuarioId, empresaId: ctx.empresaId } },
      select: SELECT,
    });
    if (!f) throw new NotFoundException('Usuario no encontrado');
    return this.aUsuario(ctx, f);
  }

  private aUsuario(ctx: ContextoEmpresa, f: Fila): UsuarioEmpresa {
    return {
      id: f.usuario.id,
      nombre: f.usuario.nombre,
      email: f.usuario.email,
      rol: { id: f.rol.id, nombre: f.rol.nombre },
      sucursales: f.sucursales
        .map((s) => s.sucursal)
        .sort((a, b) => a.codigo.localeCompare(b.codigo))
        .map(({ id, nombre }) => ({ id, nombre })),
      activo: f.activa,
      esUsted: f.usuario.id === ctx.usuarioId,
      otrasEmpresas: f.usuario._count.membresias > 1,
    };
  }

  private noUstedMismo(ctx: ContextoEmpresa, usuarioId: string, mensaje: string) {
    if (usuarioId === ctx.usuarioId) throw new BadRequestException(mensaje);
  }

  private async membresia(tx: Prisma.TransactionClient, ctx: ContextoEmpresa, usuarioId: string) {
    const m = await tx.membresia.findUnique({
      where: { usuarioId_empresaId: { usuarioId, empresaId: ctx.empresaId } },
      select: {
        id: true,
        activa: true,
        rol: { select: { id: true, permisos: true } },
        sucursales: { select: { sucursalId: true } },
      },
    });
    if (!m) throw new NotFoundException('Usuario no encontrado');
    return m;
  }

  private async rolAsignable(tx: Prisma.TransactionClient, ctx: ContextoEmpresa, rolId: string) {
    const rol = await tx.rol.findFirst({
      where: { id: rolId, empresaId: ctx.empresaId },
      select: { activo: true, permisos: true },
    });
    if (!rol) throw new BadRequestException('El rol no existe');
    if (!rol.activo) throw new BadRequestException('El rol está inactivo');
    return rol;
  }

  private async sucursalesValidas(
    tx: Prisma.TransactionClient,
    ctx: ContextoEmpresa,
    ids: string[],
  ) {
    if (ids.length === 0) return;
    const n = await tx.sucursal.count({
      where: { id: { in: ids }, empresaId: ctx.empresaId, activa: true },
    });
    if (n !== ids.length)
      throw new BadRequestException('Alguna sucursal no existe o está inactiva');
  }
}
