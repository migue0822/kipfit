import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CambiarEstado, PlanGimnasio, PlanGimnasioDatos, TipoPlan } from '@kip/shared';
import type { ContextoEmpresa } from '../auth/contexto';
import { registrarAuditoria } from '../comun/auditoria';
import { esViolacionUnica } from '../comun/pipes';
import { PrismaService } from '../prisma/prisma.service';

const REPETIDO = 'Ya existe un plan con ese nombre';

type FilaPlan = {
  id: string;
  nombre: string;
  tipo: string;
  precio: { toFixed(n: number): string };
  dias: number;
  sesiones: number | null;
  activo: boolean;
};

export const aPlan = (p: FilaPlan): PlanGimnasio => ({
  id: p.id,
  nombre: p.nombre,
  tipo: p.tipo as TipoPlan,
  precio: p.precio.toFixed(2),
  dias: p.dias,
  sesiones: p.sesiones,
  activo: p.activo,
});

@Injectable()
export class PlanesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(ctx: ContextoEmpresa): Promise<PlanGimnasio[]> {
    const planes = await this.prisma.planGimnasio.findMany({
      where: { empresaId: ctx.empresaId },
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
    return planes.map(aPlan);
  }

  async crear(ctx: ContextoEmpresa, d: PlanGimnasioDatos): Promise<PlanGimnasio> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const p = await tx.planGimnasio.create({
          data: {
            empresaId: ctx.empresaId,
            nombre: d.nombre,
            tipo: d.tipo,
            precio: d.precio,
            dias: d.dias,
            sesiones: d.sesiones ?? null,
          },
        });
        await registrarAuditoria(tx, ctx, {
          entidad: 'plan_gimnasio',
          entidadId: p.id,
          accion: 'crear',
          despues: d,
        });
        return aPlan(p);
      });
    } catch (e) {
      if (esViolacionUnica(e)) throw new ConflictException(REPETIDO);
      throw e;
    }
  }

  /** Editar un plan no cambia las membresías ya vendidas: guardan la foto de su plan y su precio. */
  async editar(ctx: ContextoEmpresa, id: string, d: PlanGimnasioDatos): Promise<PlanGimnasio> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const antes = await tx.planGimnasio.findFirst({ where: { id, empresaId: ctx.empresaId } });
        if (!antes) throw new NotFoundException('Plan no encontrado');
        const p = await tx.planGimnasio.update({
          where: { id },
          data: {
            nombre: d.nombre,
            tipo: d.tipo,
            precio: d.precio,
            dias: d.dias,
            sesiones: d.sesiones ?? null,
          },
        });
        await registrarAuditoria(tx, ctx, {
          entidad: 'plan_gimnasio',
          entidadId: id,
          accion: 'editar',
          antes: aPlan(antes),
          despues: aPlan(p),
        });
        return aPlan(p);
      });
    } catch (e) {
      if (esViolacionUnica(e)) throw new ConflictException(REPETIDO);
      throw e;
    }
  }

  async cambiarEstado(ctx: ContextoEmpresa, id: string, d: CambiarEstado): Promise<PlanGimnasio> {
    return this.prisma.$transaction(async (tx) => {
      const existe = await tx.planGimnasio.findFirst({
        where: { id, empresaId: ctx.empresaId },
        select: { nombre: true },
      });
      if (!existe) throw new NotFoundException('Plan no encontrado');
      const p = await tx.planGimnasio.update({ where: { id }, data: { activo: d.activo } });
      await registrarAuditoria(tx, ctx, {
        entidad: 'plan_gimnasio',
        entidadId: id,
        accion: d.activo ? 'reactivar' : 'inactivar',
        despues: { nombre: existe.nombre },
      });
      return aPlan(p);
    });
  }
}
