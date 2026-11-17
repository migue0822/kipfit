import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

/**
 * Prefijos de los consecutivos internos; el código de la sucursal se agrega al final (RC01-15).
 * Se crean todos al crear la sucursal, aunque el documento se programe después.
 */
export const PREFIJOS = {
  /** Recibo de un pago (membresía, tienda). */
  RECIBO: 'RC',
} as const;
export type TipoNumeracion = keyof typeof PREFIJOS;

/** Crea las numeraciones de una sucursal nueva (o las que le falten). */
export function crearNumeraciones(
  tx: Prisma.TransactionClient,
  sucursal: { id: string; empresaId: string; codigo: string },
) {
  return tx.numeracion.createMany({
    data: Object.entries(PREFIJOS).map(([tipo, base]) => ({
      empresaId: sucursal.empresaId,
      sucursalId: sucursal.id,
      tipoDocumento: tipo,
      prefijo: `${base}${sucursal.codigo}`,
    })),
    skipDuplicates: true,
  });
}

/**
 * Toma el siguiente consecutivo dentro de la transacción del documento.
 * La fila de la numeración queda bloqueada (FOR UPDATE) hasta que la
 * transacción termine, así dos documentos simultáneos nunca reciben el mismo número.
 */
export async function tomarConsecutivo(
  tx: Prisma.TransactionClient,
  p: { empresaId: string; sucursalId: string; tipo: TipoNumeracion },
): Promise<{ prefijo: string; numero: bigint }> {
  const filas = await tx.$queryRaw<{ id: string; prefijo: string; actual: bigint }[]>`
    SELECT id, prefijo, actual
    FROM numeracion
    WHERE empresa_id = ${p.empresaId}::uuid
      AND sucursal_id = ${p.sucursalId}::uuid
      AND tipo_documento = ${p.tipo}
      AND activa = true
    FOR UPDATE`;
  const n = filas[0];
  if (!n) throw new BadRequestException('La sucursal no tiene numeración para este documento');
  const numero = BigInt(n.actual) + 1n;
  await tx.numeracion.update({ where: { id: n.id }, data: { actual: numero } });
  return { prefijo: n.prefijo, numero };
}
