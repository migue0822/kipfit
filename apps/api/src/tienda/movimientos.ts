import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { calcularMovimiento, Decimal } from './costo';

/** Un paso del kardex: entra (unidades > 0) o sale (unidades < 0) de la sucursal. */
export type Paso = {
  productoId: string;
  unidades: number;
  /** Valor exacto de una entrada (compras: cantidad × costo del panal) o a mover (anulaciones). */
  valor?: Decimal;
  /** Entra exactamente el valor que salió en el paso anterior (huevo apartado). */
  valorDelPasoAnterior?: boolean;
};

export type PasoAplicado = Paso & { costoUnitario: Decimal; valor: Decimal };

type Contexto = { empresaId: string; sucursalId: string };

/**
 * Única vía para mover existencias. Dentro de la transacción del documento: bloquea las existencias
 * de los productos (en orden de id, para que dos documentos simultáneos se apliquen uno tras otro y
 * no haya bloqueos cruzados), valida que ninguna quede negativa, actualiza cantidad, valor y costo
 * promedio, y deja la fila del kardex con los saldos resultantes.
 */
export async function aplicarPasos(
  tx: Prisma.TransactionClient,
  ctx: Contexto,
  documento: { id: string; fecha: Date },
  pasos: Paso[],
  opciones: { esAnulacion?: boolean } = {},
): Promise<PasoAplicado[]> {
  const saldos = await bloquearExistencias(
    tx,
    ctx,
    pasos.map((p) => p.productoId),
  );

  const aplicados: PasoAplicado[] = [];
  for (const paso of pasos) {
    const s = saldos.get(paso.productoId);
    if (!s) throw new BadRequestException('Producto no encontrado');
    const cantidad = new Decimal(paso.unidades);
    if (s.cantidad + paso.unidades < 0) {
      throw new BadRequestException(
        `${opciones.esAnulacion ? 'No se puede anular: no alcanza' : 'No alcanza'} la existencia de ${s.nombre}. Hay ${s.cantidad} y se necesitan ${cantidad.abs().toString()}.`,
      );
    }
    const anterior = aplicados.at(-1);
    const valorFijo = paso.valorDelPasoAnterior && anterior ? anterior.valor.neg() : paso.valor;
    const r = calcularMovimiento({
      saldoCantidad: new Decimal(s.cantidad),
      saldoValor: s.valor,
      promedioAntes: s.promedio,
      cantidad,
      valor: valorFijo,
      // Una entrada sin valor (conteo que encontró de más) entra al costo promedio.
      costoUnitario: valorFijo || cantidad.lt(0) ? undefined : s.promedio,
    });
    s.cantidad = r.saldoCantidad.toNumber();
    s.valor = r.saldoValor;
    s.promedio = r.costoPromedio;

    await tx.existencia.update({
      where: { sucursalId_productoId: { sucursalId: ctx.sucursalId, productoId: paso.productoId } },
      data: {
        cantidad: r.saldoCantidad.toNumber(),
        valor: r.saldoValor,
        costoPromedio: r.costoPromedio,
      },
    });
    await tx.movimientoInventario.create({
      data: {
        empresaId: ctx.empresaId,
        sucursalId: ctx.sucursalId,
        productoId: paso.productoId,
        documentoId: documento.id,
        fecha: documento.fecha,
        cantidad: paso.unidades,
        costoUnitario: r.costoUnitario,
        valor: r.valor,
        saldoCantidad: r.saldoCantidad.toNumber(),
        saldoValor: r.saldoValor,
        costoPromedio: r.costoPromedio,
        esAnulacion: opciones.esAnulacion ?? false,
      },
    });
    aplicados.push({ ...paso, costoUnitario: r.costoUnitario, valor: r.valor });
  }
  return aplicados;
}

/**
 * Reversa los movimientos de un documento (anulación): cada unidad vuelve con el valor exacto que
 * movió, en orden inverso. Falla si alguna existencia quedaría negativa.
 */
export async function revertirMovimientos(
  tx: Prisma.TransactionClient,
  ctx: Contexto,
  documentoId: string,
  fecha: Date,
) {
  const originales = await tx.movimientoInventario.findMany({
    where: { documentoId, esAnulacion: false },
    orderBy: { id: 'desc' },
    select: { productoId: true, cantidad: true, valor: true },
  });
  if (originales.length === 0) return;
  await aplicarPasos(
    tx,
    ctx,
    { id: documentoId, fecha },
    originales.map((m) => ({
      productoId: m.productoId,
      unidades: -m.cantidad,
      valor: m.valor.neg(),
    })),
    { esAnulacion: true },
  );
}

/** Saldo de un producto en la sucursal, bloqueado hasta el final de la transacción. */
export type SaldoBloqueado = {
  cantidad: number;
  valor: Decimal;
  promedio: Decimal;
  nombre: string;
};

/**
 * Bloquea (FOR UPDATE) las existencias de los productos en la sucursal, en orden de id, creando
 * las filas que falten. Devuelve los saldos actuales.
 */
export async function bloquearExistencias(
  tx: Prisma.TransactionClient,
  ctx: Contexto,
  productoIds: string[],
): Promise<Map<string, SaldoBloqueado>> {
  const ids = [...new Set(productoIds)].sort();
  await tx.existencia.createMany({
    data: ids.map((productoId) => ({
      empresaId: ctx.empresaId,
      sucursalId: ctx.sucursalId,
      productoId,
    })),
    skipDuplicates: true,
  });
  const filas = await tx.$queryRaw<
    {
      producto_id: string;
      cantidad: number;
      valor: Decimal;
      costo_promedio: Decimal;
      nombre: string;
    }[]
  >`
    SELECT e.producto_id, e.cantidad, e.valor, e.costo_promedio, p.nombre
    FROM existencia e JOIN producto p ON p.id = e.producto_id
    WHERE e.empresa_id = ${ctx.empresaId}::uuid AND e.sucursal_id = ${ctx.sucursalId}::uuid
      AND e.producto_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY e.producto_id
    FOR UPDATE OF e`;
  return new Map(
    filas.map((f) => [
      f.producto_id,
      {
        cantidad: Number(f.cantidad),
        valor: new Decimal(f.valor),
        promedio: new Decimal(f.costo_promedio),
        nombre: f.nombre,
      },
    ]),
  );
}
