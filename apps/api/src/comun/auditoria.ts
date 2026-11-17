import type { Prisma } from '../generated/prisma/client';
import type { ContextoEmpresa } from '../auth/contexto';

/** Convierte a JSON plano (Decimal → texto, Date → ISO) para guardarlo en auditoría. */
export function aJson(valor: unknown): Prisma.InputJsonValue | undefined {
  return valor === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue);
}

/** Registra quién cambió qué, dentro de la misma transacción del cambio. */
export function registrarAuditoria(
  tx: Prisma.TransactionClient,
  ctx: ContextoEmpresa,
  cambio: {
    entidad: string;
    entidadId: string;
    accion: string;
    antes?: unknown;
    despues?: unknown;
  },
) {
  return tx.auditoria.create({
    data: {
      empresaId: ctx.empresaId,
      sucursalId: ctx.sucursalId,
      usuarioId: ctx.usuarioId,
      entidad: cambio.entidad,
      entidadId: cambio.entidadId,
      accion: cambio.accion,
      antes: aJson(cambio.antes),
      despues: aJson(cambio.despues),
    },
  });
}
