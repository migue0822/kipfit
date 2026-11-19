import { z } from 'zod';
import { decimalSchema, opcional } from '../comun.js';

export const MEDIOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'TARJETA'] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];
export const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  TARJETA: 'Tarjeta',
};

// ───────────── Dinero exacto en centavos ─────────────

/** "80000.50" → 8000050 (entero, sin errores de coma flotante). */
export function aCentavos(texto: string | number): bigint {
  const [ent = '0', dec = ''] = String(texto).trim().split('.');
  const signo = ent.startsWith('-') ? -1n : 1n;
  const e = BigInt(ent.replace('-', '') || '0');
  return signo * (e * 100n + BigInt((dec + '00').slice(0, 2)));
}

/** 8000050 → "80000.50". */
export function deCentavos(c: bigint): string {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
}

const dinero = (nombre: string) => decimalSchema({ enteros: 12, decimales: 2, nombre });

// ───────────── Esquemas ─────────────

export const pagoSchema = z.object({
  medio: z.enum(MEDIOS_PAGO, { error: 'Seleccione el medio de pago' }),
  valor: dinero('El valor del pago').refine(
    (v) => aCentavos(v) > 0n,
    'El pago debe ser mayor que cero',
  ),
});
export type PagoDatos = z.output<typeof pagoSchema>;

/** Pagos de un cobro: de 1 a 5 medios distintos. */
export const pagosSchema = z
  .array(pagoSchema)
  .min(1, 'Indique cómo se pagó')
  .max(MEDIOS_PAGO.length)
  .refine((p) => new Set(p.map((x) => x.medio)).size === p.length, 'No repita el medio de pago');

export const abrirCajaSchema = z.object({
  base: opcional(dinero('La base')),
});
export type AbrirCajaDatos = z.output<typeof abrirCajaSchema>;

export const cerrarCajaSchema = z.object({
  contado: dinero('El efectivo contado'),
  observaciones: opcional(z.string().trim().max(500)),
});
export type CerrarCajaDatos = z.output<typeof cerrarCajaSchema>;

export const TIPOS_MOVIMIENTO = ['INGRESO', 'EGRESO'] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const movimientoCajaSchema = z.object({
  tipo: z.enum(TIPOS_MOVIMIENTO, { error: 'Indique si es ingreso o egreso' }),
  concepto: z.string().trim().min(3, 'Indique el concepto').max(200),
  valor: dinero('El valor').refine((v) => aCentavos(v) > 0n, 'El valor debe ser mayor que cero'),
});
export type MovimientoCajaDatos = z.output<typeof movimientoCajaSchema>;

export const anularMovimientoSchema = z.object({
  motivo: z.string().trim().min(3, 'Indique el motivo').max(200),
});

export const turnosQuerySchema = z.object({
  desde: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

// ───────────── Cuadre ─────────────

export type ResumenCuadre = {
  base: string;
  /** Efectivo recibido por cobros vigentes. */
  efectivoCobros: string;
  /** Lo cobrado por los demás medios (se informa aparte, no está en la caja). */
  otrosMedios: Partial<Record<MedioPago, string>>;
  totalCobros: string;
  ingresos: string;
  egresos: string;
  /** base + efectivo de cobros + ingresos − egresos. */
  esperado: string;
  recibos: number;
  recibosAnulados: number;
};

export type EntradaCuadre = {
  base: string;
  recibos: { estado: string; pagos: { medio: string; valor: string }[] }[];
  movimientos: { tipo: string; estado: string; valor: string }[];
};

/** Cuadre de un turno con lo que tiene hoy. Solo cuenta lo vigente; todo en centavos exactos. */
export function calcularCuadre(e: EntradaCuadre): ResumenCuadre {
  let efectivo = 0n;
  let total = 0n;
  const otros = new Map<string, bigint>();
  let anulados = 0;
  let recibos = 0;
  for (const r of e.recibos) {
    if (r.estado !== 'VIGENTE') {
      anulados += 1;
      continue;
    }
    recibos += 1;
    for (const p of r.pagos) {
      const v = aCentavos(p.valor);
      total += v;
      if (p.medio === 'EFECTIVO') efectivo += v;
      else otros.set(p.medio, (otros.get(p.medio) ?? 0n) + v);
    }
  }
  let ingresos = 0n;
  let egresos = 0n;
  for (const m of e.movimientos) {
    if (m.estado !== 'VIGENTE') continue;
    if (m.tipo === 'INGRESO') ingresos += aCentavos(m.valor);
    else egresos += aCentavos(m.valor);
  }
  const base = aCentavos(e.base);
  return {
    base: deCentavos(base),
    efectivoCobros: deCentavos(efectivo),
    otrosMedios: Object.fromEntries([...otros].map(([k, v]) => [k, deCentavos(v)])),
    totalCobros: deCentavos(total),
    ingresos: deCentavos(ingresos),
    egresos: deCentavos(egresos),
    esperado: deCentavos(base + efectivo + ingresos - egresos),
    recibos,
    recibosAnulados: anulados,
  };
}

// ───────────── Respuestas ─────────────

export type TurnoVista = {
  id: string;
  numero: string;
  cajeroId: string;
  cajeroNombre: string;
  abiertoEn: string;
  base: string;
  estado: 'ABIERTO' | 'CERRADO';
  cerradoEn: string | null;
  contado: string | null;
  esperado: string | null;
  diferencia: string | null;
  observaciones: string | null;
  /** Abierto: calculado hoy. Cerrado: la foto del cierre. */
  resumen: ResumenCuadre;
};

export type MovimientoVista = {
  id: string;
  numero: string;
  tipo: TipoMovimiento;
  concepto: string;
  valor: string;
  fechaHora: string;
  anulado: boolean;
  motivoAnulacion: string | null;
};

export type ReciboVista = {
  id: string;
  numero: string;
  turnoId: string;
  /** null en una venta de mostrador de la tienda. */
  afiliadoId: string | null;
  afiliadoNombre: string | null;
  afiliadoDocumento: string | null;
  concepto: string;
  valor: string;
  fechaHora: string;
  anulado: boolean;
  motivoAnulacion: string | null;
  pagos: { medio: MedioPago; valor: string }[];
  empresa: string;
  sucursal: string;
  cajero: string | null;
};

export type DetalleTurno = TurnoVista & {
  recibos: ReciboVista[];
  movimientos: MovimientoVista[];
};
