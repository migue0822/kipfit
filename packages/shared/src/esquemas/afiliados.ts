import { z } from 'zod';
import { decimalSchema, listadoQuerySchema, opcional } from '../comun.js';
import { pagosSchema } from './caja.js';

// ───────────── Planes ─────────────

export const TIPOS_PLAN = ['MENSUAL', 'TIQUETERA'] as const;
export type TipoPlan = (typeof TIPOS_PLAN)[number];
export const ETIQUETA_TIPO_PLAN: Record<TipoPlan, string> = {
  MENSUAL: 'Mensual (por días)',
  TIQUETERA: 'Tiquetera (por sesiones)',
};

export const planGimnasioSchema = z
  .object({
    nombre: z.string().trim().min(2, 'Indique el nombre del plan').max(60),
    tipo: z.enum(TIPOS_PLAN, { error: 'Seleccione el tipo de plan' }),
    precio: decimalSchema({ enteros: 12, decimales: 2, nombre: 'El precio' }),
    dias: z.coerce
      .number({ error: 'Indique los días' })
      .int('Los días deben ser un número entero')
      .min(1, 'Mínimo 1 día')
      .max(3660, 'Máximo 3660 días'),
    /** Solo la tiquetera. */
    sesiones: opcional(
      z.coerce
        .number({ error: 'Indique las sesiones' })
        .int('Las sesiones deben ser un número entero')
        .min(1, 'Mínimo 1 sesión')
        .max(1000, 'Máximo 1000 sesiones'),
    ),
  })
  .superRefine((p, ctx) => {
    if (p.tipo === 'TIQUETERA' && p.sesiones === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['sesiones'],
        message: 'Indique cuántas sesiones trae',
      });
    }
  })
  .transform((p) => ({ ...p, sesiones: p.tipo === 'TIQUETERA' ? p.sesiones : undefined }));
export type PlanGimnasioEntrada = z.input<typeof planGimnasioSchema>;
export type PlanGimnasioDatos = z.output<typeof planGimnasioSchema>;

export type PlanGimnasio = {
  id: string;
  nombre: string;
  tipo: TipoPlan;
  precio: string;
  dias: number;
  sesiones: number | null;
  activo: boolean;
};

// ───────────── Afiliados ─────────────

/** Documento sin espacios ni puntos, en mayúsculas (así se compara y se busca). */
export function normalizarDocumento(texto: string): string {
  return texto.replace(/[\s.\-]/g, '').toUpperCase();
}

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)');

export const afiliadoSchema = z.object({
  documento: z
    .string()
    .transform(normalizarDocumento)
    .pipe(
      z
        .string()
        .min(4, 'Indique el documento (mínimo 4 caracteres)')
        .max(20, 'Máximo 20 caracteres')
        .regex(/^[A-Z0-9]+$/, 'El documento solo lleva letras y números'),
    ),
  nombre: z.string().trim().min(2, 'Indique el nombre').max(100),
  telefono: opcional(
    z
      .string()
      .trim()
      .max(30)
      .regex(/^[0-9+()\-\s]{7,30}$/, 'Teléfono inválido'),
  ),
  fechaNacimiento: opcional(fecha),
  referidoPorId: opcional(z.uuid()),
  notas: opcional(z.string().trim().max(500)),
});
export type AfiliadoEntrada = z.input<typeof afiliadoSchema>;
export type AfiliadoDatos = z.output<typeof afiliadoSchema>;

/** Alta de afiliado: opcionalmente ya con su primera membresía. */
export const afiliadoNuevoSchema = afiliadoSchema.safeExtend({
  planId: opcional(z.uuid()),
  fechaInicio: opcional(fecha),
});
export type AfiliadoNuevoEntrada = z.input<typeof afiliadoNuevoSchema>;
export type AfiliadoNuevoDatos = z.output<typeof afiliadoNuevoSchema>;

export const ESTADOS_MEMBRESIA = [
  'SIN_MEMBRESIA',
  'VIGENTE',
  'POR_VENCER',
  'CONGELADA',
  'VENCIDA',
  'AGOTADA',
] as const;
export type EstadoMembresia = (typeof ESTADOS_MEMBRESIA)[number];

export const ETIQUETA_ESTADO_MEMBRESIA: Record<EstadoMembresia, string> = {
  SIN_MEMBRESIA: 'Sin membresía',
  VIGENTE: 'Vigente',
  POR_VENCER: 'Por vencer',
  CONGELADA: 'Congelada',
  VENCIDA: 'Vencida',
  AGOTADA: 'Sesiones agotadas',
};

/** Días antes del vencimiento en que la membresía se marca "por vencer". */
export const DIAS_POR_VENCER = 7;

export const FILTROS_MEMBRESIA = ['todas', 'vigentes', 'por_vencer', 'vencidas', 'sin'] as const;
export type FiltroMembresia = (typeof FILTROS_MEMBRESIA)[number];

export const afiliadosQuerySchema = listadoQuerySchema.safeExtend({
  membresia: z.enum(FILTROS_MEMBRESIA).default('todas'),
});

export type SuscripcionDatos = {
  tipo: string;
  fechaInicio: string; // AAAA-MM-DD
  fechaFin: string;
  sesionesTotal: number | null;
  sesionesUsadas: number;
  congeladaDesde: string | null;
};

/** Suma días a una fecha AAAA-MM-DD. */
export function sumarDiasFecha(f: string, dias: number): string {
  return new Date(new Date(`${f}T00:00:00Z`).getTime() + dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Días entre dos fechas AAAA-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/**
 * Estado de una membresía en el día `hoy` (AAAA-MM-DD). La congelada no vence mientras esté
 * congelada; la tiquetera sin sesiones queda agotada aunque no haya vencido.
 */
export function estadoMembresia(s: SuscripcionDatos | null, hoy: string): EstadoMembresia {
  if (!s) return 'SIN_MEMBRESIA';
  if (s.congeladaDesde) return 'CONGELADA';
  if (s.fechaFin < hoy) return 'VENCIDA';
  if (s.sesionesTotal !== null && s.sesionesUsadas >= s.sesionesTotal) return 'AGOTADA';
  if (diasEntre(hoy, s.fechaFin) <= DIAS_POR_VENCER) return 'POR_VENCER';
  return 'VIGENTE';
}

/** Día en que arranca una membresía nueva: hoy, o el día siguiente al fin de la vigente. */
export function inicioRenovacion(finActual: string | null, hoy: string): string {
  return finActual && finActual >= hoy ? sumarDiasFecha(finActual, 1) : hoy;
}

/** Último día de una membresía que empieza en `inicio` y dura `dias` días (el inicio cuenta). */
export function finMembresia(inicio: string, dias: number): string {
  return sumarDiasFecha(inicio, dias - 1);
}

export type SuscripcionVista = {
  id: string;
  planId: string;
  planNombre: string;
  tipo: TipoPlan;
  precio: string;
  fechaInicio: string;
  fechaFin: string;
  sesionesTotal: number | null;
  sesionesUsadas: number;
  congeladaDesde: string | null;
  diasCongelados: number;
  estado: 'VIGENTE' | 'ANULADA';
  motivoAnulacion: string | null;
  creadoEn: string;
  /** Cobro de la membresía (null = sin cobro registrado). */
  recibo: { id: string; numero: string; anulado: boolean } | null;
};

export type AfiliadoResumen = {
  id: string;
  documento: string;
  nombre: string;
  telefono: string | null;
  activo: boolean;
  estadoMembresia: EstadoMembresia;
  planNombre: string | null;
  fechaFin: string | null;
  /** Días que faltan (negativo = vencida hace tantos días). */
  diasRestantes: number | null;
  sesionesRestantes: number | null;
  /** Versión de la foto (para la dirección `?v=`); null = sin foto. */
  fotoVersion: number | null;
};

export type AfiliadoDetalle = AfiliadoResumen & {
  fechaNacimiento: string | null;
  notas: string | null;
  referidoPor: { id: string; nombre: string } | null;
  sucursalNombre: string;
  creadoEn: string;
  suscripciones: SuscripcionVista[];
};

// ───────────── Importación desde Excel ─────────────

export const MAX_FILAS_IMPORTAR_AFILIADOS = 2000;

/**
 * Una fila de la plantilla. La membresía se carga como estaba (plan + día en que vence), sin cobro ni caja:
 * sirve para pasar los afiliados de otro programa, incluso los que ya vencieron.
 */
export const afiliadoImportarFilaSchema = afiliadoSchema
  .omit({ referidoPorId: true })
  .safeExtend({
    planId: opcional(z.uuid()),
    venceEl: opcional(fecha),
    /** Solo tiquetera: sesiones que le quedan. */
    sesionesRestantes: opcional(
      z.coerce
        .number({ error: 'Las sesiones restantes deben ser un número' })
        .int('Las sesiones restantes deben ser un número entero')
        .min(0)
        .max(1000),
    ),
  })
  .superRefine((f, ctx) => {
    if (f.planId && !f.venceEl)
      ctx.addIssue({ code: 'custom', path: ['venceEl'], message: 'Indique hasta cuándo vence' });
    if (!f.planId && f.venceEl)
      ctx.addIssue({ code: 'custom', path: ['planId'], message: 'Indique el plan' });
    if (!f.planId && f.sesionesRestantes !== undefined)
      ctx.addIssue({ code: 'custom', path: ['planId'], message: 'Indique el plan' });
  });
export type AfiliadoImportarFila = z.output<typeof afiliadoImportarFilaSchema>;

export const importarAfiliadosSchema = z.object({
  filas: z
    .array(afiliadoImportarFilaSchema)
    .min(1, 'No hay filas para importar')
    .max(MAX_FILAS_IMPORTAR_AFILIADOS, `Máximo ${MAX_FILAS_IMPORTAR_AFILIADOS} filas por archivo`),
});
export type ImportarAfiliadosDatos = z.output<typeof importarAfiliadosSchema>;

export type ResultadoImportarAfiliados = {
  creados: number;
  conMembresia: number;
  /** Documentos que ya existían: se dejaron como estaban. */
  omitidos: string[];
};

// ───────────── Foto ─────────────

/** Tamaño máximo de la foto ya reducida por el navegador (el servidor valida los bytes, no solo el tipo). */
export const MAX_BYTES_FOTO = 300 * 1024;

export const fotoSchema = z.object({
  /** `data:image/jpeg;base64,…` (PNG y WebP también); null quita la foto. */
  foto: z
    .string()
    .regex(
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/,
      'La foto debe ser JPEG, PNG o WebP',
    )
    .max(Math.ceil((MAX_BYTES_FOTO * 4) / 3) + 64, 'La foto es muy pesada (máximo 300 KB)')
    .nullable(),
});
export type FotoDatos = z.output<typeof fotoSchema>;

// ───────────── Membresías ─────────────

export const membresiaNuevaSchema = z.object({
  planId: z.uuid('Seleccione el plan'),
  /** Por defecto: hoy, o el día siguiente al fin de la vigente. */
  fechaInicio: opcional(fecha),
  /**
   * Cómo se pagó (deben sumar el precio del plan; exige caja abierta y genera el recibo). Sin pagos la
   * membresía queda sin cobro (cortesía o dato de antes): no hay recibo ni movimiento de caja.
   */
  pagos: pagosSchema.optional(),
});
export type MembresiaNuevaEntrada = z.input<typeof membresiaNuevaSchema>;
export type MembresiaNuevaDatos = z.output<typeof membresiaNuevaSchema>;

export const anularMembresiaSchema = z.object({
  motivo: z.string().trim().min(3, 'Indique el motivo').max(200),
});
export type AnularMembresiaDatos = z.output<typeof anularMembresiaSchema>;
