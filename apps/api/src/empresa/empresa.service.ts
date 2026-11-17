import { Injectable } from '@nestjs/common';
import type { EmpresaConfiguracion, EmpresaDatos } from '@kip/shared';
import type { ContextoEmpresa } from '../auth/contexto';
import { registrarAuditoria } from '../comun/auditoria';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SELECT = {
  id: true,
  nit: true,
  dv: true,
  razonSocial: true,
  nombreComercial: true,
  direccion: true,
  telefono: true,
  email: true,
} satisfies Prisma.EmpresaSelect;

@Injectable()
export class EmpresaService {
  constructor(private readonly prisma: PrismaService) {}

  obtener(ctx: ContextoEmpresa): Promise<EmpresaConfiguracion> {
    return this.prisma.empresa.findUniqueOrThrow({ where: { id: ctx.empresaId }, select: SELECT });
  }

  /** Datos generales. El NIT no cambia. */
  editar(ctx: ContextoEmpresa, d: EmpresaDatos): Promise<EmpresaConfiguracion> {
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.empresa.findUniqueOrThrow({
        where: { id: ctx.empresaId },
        select: SELECT,
      });
      const datos = {
        razonSocial: d.razonSocial,
        nombreComercial: d.nombreComercial ?? null,
        direccion: d.direccion ?? null,
        telefono: d.telefono ?? null,
        email: d.email ?? null,
      };
      const despues = await tx.empresa.update({
        where: { id: ctx.empresaId },
        data: datos,
        select: SELECT,
      });
      await registrarAuditoria(tx, ctx, {
        entidad: 'empresa',
        entidadId: ctx.empresaId,
        accion: 'editar',
        antes,
        despues: datos,
      });
      return despues;
    });
  }
}
