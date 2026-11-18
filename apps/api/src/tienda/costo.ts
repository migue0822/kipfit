import { Prisma } from '../generated/prisma/client';

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

/** Redondeo de cantidades y costos (4 decimales) y de valores en pesos (2 decimales). */
export const a4 = (d: Decimal) => d.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
export const a2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

const CERO = new Decimal(0);

/**
 * Costo promedio ponderado llevando el **valor total** como dato principal.
 *
 * El valor de la existencia (en pesos, 2 decimales) es la fuente de verdad; el
 * costo promedio se deriva de él. Así el valor del inventario siempre cuadra
 * al peso con lo que costó, sin arrastrar diferencias de redondeo.
 *
 * - Entrada: suma cantidad × costo.
 * - Salida: resta la parte proporcional del valor (cantidad × valor / existencia).
 * - Si la existencia queda en cero, el valor queda exactamente en cero.
 * - `valor` explícito (traslados y anulaciones) mueve ese valor exacto.
 */
export function calcularMovimiento(p: {
  saldoCantidad: Decimal;
  saldoValor: Decimal;
  promedioAntes: Decimal;
  cantidad: Decimal;
  costoUnitario?: Decimal;
  valor?: Decimal;
}): {
  valor: Decimal;
  costoUnitario: Decimal;
  saldoCantidad: Decimal;
  saldoValor: Decimal;
  costoPromedio: Decimal;
} {
  const saldoCantidad = p.saldoCantidad.plus(p.cantidad);
  let valor: Decimal;

  if (saldoCantidad.isZero()) {
    // Sale todo lo que hay: se lleva exactamente el valor restante.
    valor = p.saldoValor.neg();
  } else if (p.valor) {
    valor = a2(p.valor);
  } else if (p.cantidad.gt(0)) {
    if (!p.costoUnitario) throw new Error('Una entrada necesita costo unitario');
    valor = a2(p.cantidad.times(p.costoUnitario));
  } else {
    const promedio = p.saldoCantidad.gt(0) ? p.saldoValor.div(p.saldoCantidad) : p.promedioAntes;
    valor = a2(p.cantidad.times(promedio));
  }

  const saldoValor = p.saldoValor.plus(valor);
  const costoUnitario =
    p.costoUnitario && !p.valor ? a4(p.costoUnitario) : a4(valor.abs().div(p.cantidad.abs()));
  const costoPromedio = saldoCantidad.gt(0)
    ? a4(Decimal.max(CERO, saldoValor.div(saldoCantidad)))
    : p.promedioAntes;

  return { valor, costoUnitario, saldoCantidad, saldoValor, costoPromedio };
}
