import { z } from 'zod';
import type { EstadoMembresia } from './afiliados.js';
import type { MedioPago } from './caja.js';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const DIA = 86_400_000;
export const MAX_DIAS_INFORME = 366;

/** Período de un informe: días de Colombia, de `desde` a `hasta` inclusive, máximo 366 días. */
export const periodoSchema = z
  .object({ desde: fecha, hasta: fecha })
  .refine((p) => p.desde <= p.hasta, {
    message: 'La fecha inicial no puede ser posterior a la final',
  })
  .refine(
    (p) =>
      (Date.parse(`${p.hasta}T00:00:00Z`) - Date.parse(`${p.desde}T00:00:00Z`)) / DIA <
      MAX_DIAS_INFORME,
    { message: 'El período máximo es de 366 días' },
  );
export type PeriodoInforme = z.output<typeof periodoSchema>;

export const vencimientosQuerySchema = z.object({
  /** Membresías que vencen en los próximos N días. */
  dias: z.coerce.number().int().min(1).max(90).default(15),
  /** Membresías vencidas en los últimos N días. */
  vencidasDias: z.coerce.number().int().min(1).max(365).default(30),
});

// ───────────── Respuestas ─────────────

export type InformeCobros = {
  desde: string;
  hasta: string;
  total: string;
  recibos: number;
  anulados: number;
  porMedio: { medio: MedioPago; valor: string }[];
  porDia: { fecha: string; recibos: number; valor: string }[];
  porPlan: { plan: string; cantidad: number; valor: string }[];
};

export type InformeIngresos = {
  desde: string;
  hasta: string;
  total: number;
  /** Personas distintas que entraron. */
  afiliados: number;
  alertas: number;
  porDia: { fecha: string; total: number; alertas: number }[];
  /** Ingresos por hora del día (0–23, hora de Colombia): sirve para ver la hora pico. */
  porHora: { hora: number; total: number }[];
  masAsiduos: { afiliadoId: string; nombre: string; documento: string; ingresos: number }[];
};

export type FilaVencimiento = {
  afiliadoId: string;
  nombre: string;
  documento: string;
  telefono: string | null;
  plan: string;
  fechaFin: string;
  /** Positivo = faltan; negativo = lleva vencida. */
  dias: number;
  estado: EstadoMembresia;
  sesionesRestantes: number | null;
};

export type InformeVencimientos = {
  hoy: string;
  porVencer: FilaVencimiento[];
  vencidas: FilaVencimiento[];
};

export type FilaCaja = {
  id: string;
  numero: string;
  cajero: string;
  abiertoEn: string;
  cerradoEn: string | null;
  estado: 'ABIERTO' | 'CERRADO';
  base: string;
  cobrosEfectivo: string;
  otrosMedios: string;
  ingresos: string;
  egresos: string;
  esperado: string;
  contado: string | null;
  diferencia: string | null;
  observaciones: string | null;
};

export type InformeCajas = {
  desde: string;
  hasta: string;
  turnos: FilaCaja[];
  abiertas: number;
  /** Suma de las diferencias de las cajas cerradas (faltante en negativo). */
  diferenciaTotal: string;
  cobrosTotal: string;
};

// ───────────── WhatsApp ─────────────

/** Celular colombiano (10 dígitos que empiezan por 3) → con el prefijo 57; si ya lo trae, lo deja; si no es celular, null. */
export function celularWhatsApp(telefono: string | null | undefined): string | null {
  const d = (telefono ?? '').replace(/\D/g, '');
  if (/^3\d{9}$/.test(d)) return `57${d}`;
  if (/^573\d{9}$/.test(d)) return d;
  return null;
}

/** Enlace de WhatsApp con el mensaje escrito (quien atiende solo pulsa "Enviar"). */
export function enlaceWhatsApp(
  telefono: string | null | undefined,
  mensaje: string,
): string | null {
  const n = celularWhatsApp(telefono);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(mensaje)}` : null;
}

export function mensajeVencimiento(
  nombre: string,
  empresa: string,
  fechaFin: string,
  dias: number,
): string {
  const primero = nombre.trim().split(/\s+/)[0] ?? nombre;
  const [a, m, d] = fechaFin.split('-');
  const fecha = `${d}/${m}/${a}`;
  if (dias < 0) {
    return `Hola ${primero}, le escribimos de ${empresa}. Su membresía venció el ${fecha}. ¡Lo esperamos para renovarla y seguir entrenando!`;
  }
  if (dias === 0) {
    return `Hola ${primero}, le escribimos de ${empresa}. Su membresía vence hoy (${fecha}). ¡Renuévela para no perder días de entrenamiento!`;
  }
  return `Hola ${primero}, le escribimos de ${empresa}. Su membresía vence el ${fecha} (en ${dias} ${dias === 1 ? 'día' : 'días'}). ¡Lo esperamos para renovarla!`;
}
