import { z } from 'zod';

/** Texto en minúsculas y sin tildes, para buscar sin importar cómo se escriba. */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Campo opcional que además trata el texto vacío ("") de un formulario como ausente. */
export function opcional<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    schema.optional(),
  );
}

/**
 * Convierte un número escrito al estilo colombiano a formato con punto decimal.
 * "12.500" → "12500", "12.500,75" → "12500.75", "1500,5" → "1500.5", "19.5" → "19.5".
 * Devuelve null si el texto no es un número válido.
 */
export function normalizarDecimal(texto: string): string | null {
  let t = texto.trim().replace(/\s|\$/g, '');
  if (t === '') return null;
  const tienePunto = t.includes('.');
  const tieneComa = t.includes(',');

  if (tienePunto && tieneComa) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (tieneComa) {
    t =
      /^\d{1,3}(,\d{3})+$/.test(t) && t.split(',').length > 2
        ? t.replace(/,/g, '')
        : t.replace(',', '.');
  } else if (tienePunto && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    // Solo puntos de miles: 12.500 o 1.250.000
    t = t.replace(/\./g, '');
  }
  return /^\d+(\.\d+)?$/.test(t) ? t.replace(/^0+(?=\d)/, '') : null;
}

/**
 * Valor decimal exacto como texto (nunca float). Acepta formato colombiano
 * y lo devuelve normalizado, ej.: "12.500,5" → "12500.5".
 */
export function decimalSchema(opc: {
  enteros: number;
  decimales: number;
  max?: number;
  nombre?: string;
}) {
  const nombre = opc.nombre ?? 'El valor';
  return z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = normalizarDecimal(String(v));
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: `${nombre} debe ser un número` });
      return z.NEVER;
    }
    const [ent = '', dec = ''] = n.split('.');
    if (ent.length > opc.enteros) {
      ctx.addIssue({ code: 'custom', message: `${nombre} es demasiado grande` });
      return z.NEVER;
    }
    if (dec.length > opc.decimales) {
      ctx.addIssue({
        code: 'custom',
        message: `${nombre} admite máximo ${opc.decimales} decimales`,
      });
      return z.NEVER;
    }
    if (opc.max !== undefined && Number(n) > opc.max) {
      ctx.addIssue({ code: 'custom', message: `${nombre} no puede ser mayor que ${opc.max}` });
      return z.NEVER;
    }
    return n;
  });
}

export const ESTADOS_FILTRO = ['activos', 'inactivos', 'todos'] as const;

/** Parámetros comunes de los listados: búsqueda, estado y paginación. */
export const listadoQuerySchema = z.object({
  buscar: opcional(z.string().trim().max(100)),
  estado: z.enum(ESTADOS_FILTRO).default('activos'),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
});

export const cambiarEstadoSchema = z.object({ activo: z.boolean() });
export type CambiarEstado = z.output<typeof cambiarEstadoSchema>;

export type Paginado<T> = { datos: T[]; total: number; pagina: number; porPagina: number };
