import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { estadoLicencia, type LicenciaEmpresa } from '@kip/shared';
import { deFechaDb, hoyBogota } from '../comun/fechas';
import { PrismaService } from '../prisma/prisma.service';
import type { ContextoSesion } from './contexto';
import { DURACION_SESION_MS } from './cookie';

export type MetaPeticion = { ip?: string; agente?: string };

/** Token aleatorio para la cookie; en la base solo se guarda su hash. */
export function generarToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SesionesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(
    usuarioId: string,
    contexto: { empresaId: string; sucursalId: string } | null,
    meta: MetaPeticion,
  ): Promise<{ token: string; sesionId: string }> {
    const token = generarToken();
    const sesionId = hashToken(token);
    await this.prisma.sesion.create({
      data: {
        id: sesionId,
        usuarioId,
        empresaId: contexto?.empresaId ?? null,
        sucursalId: contexto?.sucursalId ?? null,
        expiraEn: new Date(Date.now() + DURACION_SESION_MS),
        ip: meta.ip?.slice(0, 64),
        agente: meta.agente?.slice(0, 300),
      },
    });
    return { token, sesionId };
  }

  /**
   * Devuelve el contexto de una sesión vigente, o null si no existe, expiró,
   * fue revocada o el usuario está inactivo. `renovar` indica que conviene extenderla.
   */
  async validar(token: string): Promise<{ contexto: ContextoSesion; renovar: boolean } | null> {
    const sesion = await this.prisma.sesion.findUnique({
      where: { id: hashToken(token) },
      include: { usuario: { select: { activo: true } } },
    });
    const ahora = Date.now();
    if (
      !sesion ||
      sesion.revocadaEn ||
      sesion.expiraEn.getTime() <= ahora ||
      !sesion.usuario.activo
    ) {
      return null;
    }

    let { empresaId, sucursalId } = sesion;
    let permisos: string[] = [];
    let licencia: LicenciaEmpresa | null = null;
    if (empresaId && sucursalId) {
      const acceso = await this.accesoEn(sesion.usuarioId, empresaId, sucursalId);
      if (acceso) {
        permisos = acceso.permisos;
        licencia = acceso.licencia;
      } else {
        // Perdió el acceso (membresía o sucursal desactivada): se limpia la selección.
        await this.prisma.sesion.update({
          where: { id: sesion.id },
          data: { empresaId: null, sucursalId: null },
        });
        empresaId = null;
        sucursalId = null;
      }
    }

    return {
      contexto: {
        sesionId: sesion.id,
        usuarioId: sesion.usuarioId,
        empresaId,
        sucursalId,
        permisos,
        licencia,
      },
      renovar: sesion.expiraEn.getTime() - ahora < DURACION_SESION_MS / 2,
    };
  }

  /** Permisos del usuario en esa empresa y sucursal, o null si no tiene acceso. */
  async permisosEn(usuarioId: string, empresaId: string, sucursalId: string) {
    return (await this.accesoEn(usuarioId, empresaId, sucursalId))?.permisos ?? null;
  }

  /** Acceso del usuario a esa empresa y sucursal: permisos y licencia. Null si no tiene acceso. */
  async accesoEn(
    usuarioId: string,
    empresaId: string,
    sucursalId: string,
  ): Promise<{ permisos: string[]; licencia: LicenciaEmpresa } | null> {
    const membresia = await this.prisma.membresia.findUnique({
      where: { usuarioId_empresaId: { usuarioId, empresaId } },
      include: {
        rol: { select: { permisos: true } },
        sucursales: true,
        empresa: {
          select: {
            activa: true,
            pagadoHasta: true,
            licenciaEstado: true,
            plan: { select: { nombre: true } },
            // En demostración = con vencimiento y sin pagos vigentes.
            _count: { select: { pagosLicencia: { where: { anulado: false } } } },
          },
        },
      },
    });
    if (!membresia?.activa || !membresia.empresa.activa) return null;

    const sucursal = await this.prisma.sucursal.findFirst({
      where: { id: sucursalId, empresaId, activa: true },
      select: { id: true },
    });
    if (!sucursal) return null;

    const restringida = membresia.sucursales.length > 0;
    if (restringida && !membresia.sucursales.some((s) => s.sucursalId === sucursalId)) return null;

    const e = membresia.empresa;
    const pagadoHasta = e.pagadoHasta ? deFechaDb(e.pagadoHasta) : null;
    return {
      permisos: membresia.rol.permisos,
      licencia: {
        ...estadoLicencia({ estado: e.licenciaEstado, pagadoHasta, hoy: hoyBogota() }),
        pagadoHasta,
        enDemo: pagadoHasta !== null && e._count.pagosLicencia === 0,
        plan: e.plan?.nombre ?? null,
      },
    };
  }

  async cambiarContexto(sesionId: string, empresaId: string, sucursalId: string) {
    await this.prisma.sesion.update({ where: { id: sesionId }, data: { empresaId, sucursalId } });
  }

  async renovar(sesionId: string) {
    await this.prisma.sesion.update({
      where: { id: sesionId },
      data: { expiraEn: new Date(Date.now() + DURACION_SESION_MS) },
    });
  }

  async revocar(sesionId: string) {
    await this.prisma.sesion.update({ where: { id: sesionId }, data: { revocadaEn: new Date() } });
  }
}
