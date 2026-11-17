import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DIAS_DEMO,
  PERMISO_TOTAL,
  type CambiarPasswordDatos,
  type LoginEntrada,
  type Perfil,
  type Registro,
  type SeleccionarContexto,
} from '@kip/shared';
import { hoyBogota, sumarDias } from '../comun/fechas';
import { PrismaService } from '../prisma/prisma.service';
import type { ContextoSesion } from './contexto';
import { crearEmpresaEnTx } from './crear-empresa';
import { hashDeRelleno, hashPassword, verificarPassword } from './password';
import { type MetaPeticion, SesionesService } from './sesiones.service';

const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos';

function esViolacionUnica(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

/** Días de demostración de una empresa registrada desde la página de ingreso. */
export function diasDemo(): number {
  const v = Number(process.env.DEMO_DIAS ?? DIAS_DEMO);
  return Number.isInteger(v) && v >= 0 ? v : DIAS_DEMO;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
  ) {}

  /**
   * Crea la empresa con su sucursal principal, los roles
   * y el primer usuario (administrador); todo en una transacción. Deja la sesión iniciada.
   */
  async registrar(datos: Registro, meta: MetaPeticion) {
    const [usuarioExiste, empresaExiste] = await Promise.all([
      this.prisma.usuario.findUnique({
        where: { email: datos.usuario.email },
        select: { id: true },
      }),
      this.prisma.empresa.findUnique({ where: { nit: datos.empresa.nit }, select: { id: true } }),
    ]);
    if (usuarioExiste) throw new ConflictException('Ya existe una cuenta con ese correo');
    if (empresaExiste) throw new ConflictException('Ya existe una empresa registrada con ese NIT');

    const hash = await hashPassword(datos.usuario.password);

    let ids: { usuarioId: string; empresaId: string; sucursalId: string };
    try {
      ids = await this.prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.create({
          data: { email: datos.usuario.email, nombre: datos.usuario.nombre, hashPassword: hash },
        });
        // Quien se registra desde la página de ingreso entra en demostración (`DEMO_DIAS`, 0 = sin vencimiento).
        const dias = diasDemo();
        const { empresaId, sucursalId } = await crearEmpresaEnTx(tx, datos, usuario.id, {
          pagadoHasta: dias > 0 ? sumarDias(hoyBogota(), dias) : null,
        });
        return { usuarioId: usuario.id, empresaId, sucursalId };
      });
    } catch (e) {
      // Dos registros simultáneos con el mismo correo o NIT.
      if (esViolacionUnica(e))
        throw new ConflictException('El correo o el NIT ya están registrados');
      throw e;
    }

    const { token, sesionId } = await this.sesiones.crear(
      ids.usuarioId,
      { empresaId: ids.empresaId, sucursalId: ids.sucursalId },
      meta,
    );
    const perfil = await this.perfil({
      sesionId,
      usuarioId: ids.usuarioId,
      empresaId: ids.empresaId,
      sucursalId: ids.sucursalId,
      permisos: [PERMISO_TOTAL],
    });
    return { token, perfil };
  }

  /**
   * Verifica credenciales y crea la sesión. Si el usuario pertenece a una sola
   * empresa, la deja seleccionada con su primera sucursal permitida.
   */
  async login(datos: LoginEntrada, meta: MetaPeticion) {
    const email = datos.email.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });

    if (!usuario) {
      await verificarPassword(await hashDeRelleno(), datos.password);
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }
    const valida = await verificarPassword(usuario.hashPassword, datos.password);
    if (!valida || !usuario.activo) throw new UnauthorizedException(CREDENCIALES_INVALIDAS);

    const empresas = await this.empresasAccesibles(usuario.id);
    const unica = empresas.length === 1 ? empresas[0] : undefined;
    const primeraSucursal = unica?.sucursales[0];
    const contexto =
      unica && primeraSucursal ? { empresaId: unica.id, sucursalId: primeraSucursal.id } : null;

    const { token, sesionId } = await this.sesiones.crear(usuario.id, contexto, meta);
    const permisos = contexto
      ? ((await this.sesiones.permisosEn(usuario.id, contexto.empresaId, contexto.sucursalId)) ??
        [])
      : [];
    const perfil = await this.perfil({
      sesionId,
      usuarioId: usuario.id,
      empresaId: contexto?.empresaId ?? null,
      sucursalId: contexto?.sucursalId ?? null,
      permisos,
    });
    return { token, perfil };
  }

  async seleccionar(ctx: ContextoSesion, datos: SeleccionarContexto): Promise<Perfil> {
    const permisos = await this.sesiones.permisosEn(
      ctx.usuarioId,
      datos.empresaId,
      datos.sucursalId,
    );
    if (!permisos) throw new ForbiddenException('No tiene acceso a esa empresa o sucursal');
    await this.sesiones.cambiarContexto(ctx.sesionId, datos.empresaId, datos.sucursalId);
    return this.perfil({ ...ctx, ...datos, permisos });
  }

  /** El usuario cambia su propia contraseña; se cierran sus otras sesiones. */
  async cambiarPassword(ctx: ContextoSesion, d: CambiarPasswordDatos) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: ctx.usuarioId },
      select: { hashPassword: true },
    });
    if (!(await verificarPassword(usuario.hashPassword, d.actual))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    const hash = await hashPassword(d.nueva);
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: ctx.usuarioId }, data: { hashPassword: hash } });
      await tx.sesion.updateMany({
        where: { usuarioId: ctx.usuarioId, revocadaEn: null, id: { not: ctx.sesionId } },
        data: { revocadaEn: new Date() },
      });
      if (ctx.empresaId) {
        await tx.auditoria.create({
          data: {
            empresaId: ctx.empresaId,
            sucursalId: ctx.sucursalId,
            usuarioId: ctx.usuarioId,
            entidad: 'usuario',
            entidadId: ctx.usuarioId,
            accion: 'cambiar_password',
          },
        });
      }
    });
  }

  async logout(ctx: ContextoSesion) {
    await this.sesiones.revocar(ctx.sesionId);
  }

  async perfil(ctx: ContextoSesion): Promise<Perfil> {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: ctx.usuarioId },
      select: { id: true, nombre: true, email: true },
    });
    const empresas = await this.empresasAccesibles(ctx.usuarioId);
    const empresa = empresas.find((e) => e.id === ctx.empresaId);
    const sucursal = empresa?.sucursales.find((s) => s.id === ctx.sucursalId);
    const acceso =
      empresa && sucursal
        ? await this.sesiones.accesoEn(ctx.usuarioId, empresa.id, sucursal.id)
        : null;

    return {
      usuario,
      empresa: empresa
        ? {
            id: empresa.id,
            razonSocial: empresa.razonSocial,
            nombreComercial: empresa.nombreComercial,
            nit: empresa.nit,
            dv: empresa.dv,
            licencia: acceso?.licencia ?? {
              soloLectura: false,
              motivo: null,
              pagadoHasta: null,
              diasRestantes: null,
              enDemo: false,
              plan: null,
            },
          }
        : null,
      sucursal: sucursal ?? null,
      permisos: ctx.permisos,
      empresas: empresas.map(({ id, razonSocial, sucursales }) => ({
        id,
        razonSocial,
        sucursales,
      })),
    };
  }

  /** Empresas activas del usuario con las sucursales a las que puede entrar. */
  private async empresasAccesibles(usuarioId: string) {
    const membresias = await this.prisma.membresia.findMany({
      where: { usuarioId, activa: true, empresa: { activa: true } },
      include: {
        empresa: {
          select: {
            id: true,
            razonSocial: true,
            nombreComercial: true,
            nit: true,
            dv: true,
            sucursales: {
              where: { activa: true },
              orderBy: { codigo: 'asc' },
              select: { id: true, nombre: true },
            },
          },
        },
        sucursales: { select: { sucursalId: true } },
      },
      orderBy: { empresa: { razonSocial: 'asc' } },
    });

    return membresias.map((m) => {
      const permitidas = new Set(m.sucursales.map((s) => s.sucursalId));
      const sucursales =
        permitidas.size === 0
          ? m.empresa.sucursales
          : m.empresa.sucursales.filter((s) => permitidas.has(s.id));
      return {
        id: m.empresa.id,
        razonSocial: m.empresa.razonSocial,
        nombreComercial: m.empresa.nombreComercial,
        nit: m.empresa.nit,
        dv: m.empresa.dv,
        sucursales,
      };
    });
  }
}
