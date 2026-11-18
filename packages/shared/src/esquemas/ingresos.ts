import { z } from 'zod';
import {
  normalizarDocumento,
  estadoMembresia,
  type EstadoMembresia,
  type SuscripcionDatos,
} from './afiliados.js';

export const ORIGENES_INGRESO = ['RECEPCION', 'TABLET'] as const;
export type OrigenIngreso = (typeof ORIGENES_INGRESO)[number];

/** PERMITIDO = puede entrar; ALERTA = recepción debe revisar (vencida, congelada, agotada o sin membresía). */
export const RESULTADOS_INGRESO = ['PERMITIDO', 'ALERTA'] as const;
export type ResultadoIngreso = (typeof RESULTADOS_INGRESO)[number];

export const ingresoNuevoSchema = z.object({
  /** UUID del cliente: reenviar el mismo ingreso (sin conexión, doble toque) no lo duplica. */
  id: z.uuid().optional(),
  documento: z.string().trim().min(3, 'Digite el documento').max(30).transform(normalizarDocumento),
  origen: z.enum(ORIGENES_INGRESO).default('TABLET'),
});
export type IngresoNuevoEntrada = z.input<typeof ingresoNuevoSchema>;
export type IngresoNuevoDatos = z.output<typeof ingresoNuevoSchema>;

export const anularIngresoSchema = z.object({
  motivo: z.string().trim().min(3, 'Indique el motivo').max(200),
});

export const ingresosQuerySchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD')
    .optional(),
});

export type DecisionIngreso = {
  resultado: ResultadoIngreso;
  estado: EstadoMembresia;
  /** La tiquetera gasta una sesión, una vez por día. */
  descuentaSesion: boolean;
  /** Días de vencida (0 si no aplica). */
  diasVencido: number;
};

const DIA = 86_400_000;
const dias = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA);

/**
 * Decide qué pasa cuando alguien se presenta en la entrada. Vigente o por vencer entra; lo demás
 * genera alerta (no se le impide el paso: lo decide recepción). `yaIngresoHoy` = ya tiene un ingreso
 * vigente hoy (la tiquetera no gasta otra sesión el mismo día).
 */
export function decidirIngreso(
  s: SuscripcionDatos | null,
  hoy: string,
  yaIngresoHoy: boolean,
): DecisionIngreso {
  if (s && s.fechaInicio > hoy) {
    return { resultado: 'ALERTA', estado: 'SIN_MEMBRESIA', descuentaSesion: false, diasVencido: 0 };
  }
  const estado = estadoMembresia(s, hoy);
  const entra = estado === 'VIGENTE' || estado === 'POR_VENCER';
  return {
    resultado: entra ? 'PERMITIDO' : 'ALERTA',
    estado,
    descuentaSesion: entra && s!.sesionesTotal !== null && !yaIngresoHoy,
    diasVencido: estado === 'VENCIDA' && s ? Math.max(0, dias(s.fechaFin, hoy)) : 0,
  };
}

export type IngresoVista = {
  id: string;
  afiliadoId: string;
  afiliadoNombre: string;
  documento: string;
  /** Versión de la foto del afiliado; null = sin foto. */
  fotoVersion: number | null;
  fechaHora: string;
  origen: OrigenIngreso;
  resultado: ResultadoIngreso;
  estadoMembresia: EstadoMembresia;
  planNombre: string | null;
  venceEl: string | null;
  diasVencido: number;
  descuentaSesion: boolean;
  /** Sesiones que le quedan después de este ingreso (tiquetera). */
  sesionesRestantes: number | null;
  alertaPendiente: boolean;
  anulado: boolean;
  motivoAnulacion: string | null;
  /** true si el servidor ya lo tenía (reenvío del mismo id). */
  repetido?: boolean;
};

export type ResumenIngresos = {
  fecha: string;
  total: number;
  alertas: number;
  pendientes: number;
  ingresos: IngresoVista[];
};

export function mensajeIngreso(
  i: Pick<IngresoVista, 'resultado' | 'estadoMembresia' | 'diasVencido' | 'venceEl'>,
) {
  if (i.resultado === 'PERMITIDO') return 'Bienvenido';
  switch (i.estadoMembresia) {
    case 'VENCIDA':
      return `Membresía vencida${i.venceEl ? ` el ${i.venceEl}` : ''}. Pase por recepción`;
    case 'CONGELADA':
      return 'Membresía congelada. Pase por recepción';
    case 'AGOTADA':
      return 'Sesiones agotadas. Pase por recepción';
    default:
      return 'Sin membresía vigente. Pase por recepción';
  }
}
