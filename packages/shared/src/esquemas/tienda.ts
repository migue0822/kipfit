import { z } from 'zod';
import { decimalSchema, ESTADOS_FILTRO, opcional } from '../comun.js';

// ───────────── Productos ─────────────

export const productoSchema = z.object({
  /** Código de barras o interno (opcional); único por empresa. Se guarda en mayúsculas y sin espacios. */
  codigo: opcional(
    z
      .string()
      .trim()
      .max(30, 'Máximo 30 caracteres')
      .transform((c) => c.replace(/\s+/g, '').toUpperCase()),
  ),
  nombre: z.string().trim().min(2, 'Indique el nombre del producto').max(80),
  categoria: opcional(z.string().trim().max(40)),
  precioVenta: decimalSchema({ enteros: 12, decimales: 2, nombre: 'El precio' }),
});
export type ProductoDatos = z.output<typeof productoSchema>;

export const productosQuerySchema = z.object({
  buscar: opcional(z.string().trim().max(100)),
  estado: z.enum(ESTADOS_FILTRO).default('activos'),
});

export type ProductoVista = {
  id: string;
  codigo: string | null;
  nombre: string;
  categoria: string | null;
  precioVenta: string;
  activo: boolean;
  /** Unidades en la sucursal de la sesión. */
  existencia: number;
  /** Costo promedio y valor de la existencia; null sin `tienda.costos`. */
  costoPromedio: string | null;
  valorInventario: string | null;
};

// ───────────── Documentos de inventario ─────────────

export const TIPOS_DOCUMENTO_TIENDA = ['ENTRADA', 'AJUSTE', 'VENTA', 'DEVOLUCION'] as const;
export type TipoDocumentoTienda = (typeof TIPOS_DOCUMENTO_TIENDA)[number];
export const ETIQUETA_DOCUMENTO_TIENDA: Record<TipoDocumentoTienda, string> = {
  ENTRADA: 'Entrada de mercancía',
  AJUSTE: 'Ajuste de inventario',
  VENTA: 'Venta',
  DEVOLUCION: 'Devolución',
};

const unidades = (nombre: string, min: number) =>
  z.coerce
    .number({ error: `${nombre} debe ser un número` })
    .int(`${nombre} debe ser un número entero`)
    .min(min, min === 0 ? `${nombre} no puede ser negativa` : `${nombre}: mínimo ${min}`)
    .max(1_000_000, `${nombre} es demasiado grande`);

const sinRepetidos = (lineas: { productoId: string }[], ctx: z.RefinementCtx) => {
  const vistos = new Set<string>();
  lineas.forEach((l, i) => {
    if (vistos.has(l.productoId))
      ctx.addIssue({
        code: 'custom',
        path: [i, 'productoId'],
        message: 'Ese producto ya está en la lista: súmele la cantidad',
      });
    vistos.add(l.productoId);
  });
};

export const entradaSchema = z.object({
  /** Factura o remisión del proveedor. */
  referencia: opcional(z.string().trim().max(40)),
  proveedor: opcional(z.string().trim().max(80)),
  observaciones: opcional(z.string().trim().max(300)),
  lineas: z
    .array(
      z.object({
        productoId: z.uuid('Producto inválido'),
        cantidad: unidades('La cantidad', 1),
        /** Costo de cada unidad, sin decimales raros: hasta 4. */
        costoUnitario: decimalSchema({ enteros: 12, decimales: 4, nombre: 'El costo' }),
      }),
    )
    .min(1, 'Agregue al menos un producto')
    .max(200, 'Máximo 200 productos por entrada')
    .superRefine(sinRepetidos),
});
export type EntradaDatos = z.output<typeof entradaSchema>;

export const MOTIVOS_AJUSTE = ['CONTEO', 'MERMA', 'DANADO', 'VENCIDO', 'CONSUMO', 'OTRO'] as const;
export type MotivoAjuste = (typeof MOTIVOS_AJUSTE)[number];
export const ETIQUETA_MOTIVO_AJUSTE: Record<MotivoAjuste, string> = {
  CONTEO: 'Conteo físico',
  MERMA: 'Merma (pérdida)',
  DANADO: 'Producto dañado',
  VENCIDO: 'Producto vencido',
  CONSUMO: 'Consumo interno',
  OTRO: 'Otro',
};

export const ajusteSchema = z
  .object({
    motivo: z.enum(MOTIVOS_AJUSTE, { error: 'Seleccione el motivo' }),
    observaciones: opcional(z.string().trim().max(300)),
    lineas: z
      .array(
        z.object({
          productoId: z.uuid('Producto inválido'),
          /** Lo que decía el sistema cuando se cargó la pantalla (si cambió, 409). */
          sistema: unidades('La existencia del sistema', 0),
          /** Lo que hay (o quedó) realmente. */
          contado: unidades('La cantidad contada', 0),
        }),
      )
      .min(1, 'Agregue al menos un producto')
      .max(500, 'Máximo 500 productos por ajuste')
      .superRefine(sinRepetidos),
  })
  .superRefine((a, ctx) => {
    if (a.motivo !== 'CONTEO' && !a.observaciones)
      ctx.addIssue({
        code: 'custom',
        path: ['observaciones'],
        message: 'Explique brevemente qué pasó (queda en la auditoría)',
      });
    if (!a.lineas.some((l) => l.sistema !== l.contado))
      ctx.addIssue({
        code: 'custom',
        path: ['lineas'],
        message: 'No hay diferencias que ajustar',
      });
  });
export type AjusteDatos = z.output<typeof ajusteSchema>;

export const anularDocumentoSchema = z.object({
  motivo: z.string().trim().min(3, 'Indique el motivo de la anulación').max(200),
});
export type AnularDocumentoDatos = z.output<typeof anularDocumentoSchema>;

export const documentosQuerySchema = z.object({
  tipo: z.enum(TIPOS_DOCUMENTO_TIENDA).optional(),
  desde: opcional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  hasta: opcional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

export const kardexQuerySchema = z.object({
  productoId: z.uuid(),
  desde: opcional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  hasta: opcional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

export type DocumentoResumen = {
  id: string;
  numero: string;
  tipo: TipoDocumentoTienda;
  fecha: string;
  anulado: boolean;
  referencia: string | null;
  proveedor: string | null;
  motivo: string | null;
  /** null sin `tienda.costos`. */
  valorTotal: string | null;
  unidades: number;
  creadoPor: string | null;
};

export type LineaDocumentoVista = {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  sistema: number | null;
  costoUnitario: string | null;
  valor: string | null;
};

export type DocumentoDetalle = DocumentoResumen & {
  observaciones: string | null;
  motivoAnulacion: string | null;
  anuladoEn: string | null;
  lineas: LineaDocumentoVista[];
};

export type FilaKardex = {
  id: string;
  fecha: string;
  documento: string;
  tipo: TipoDocumentoTienda;
  anulacion: boolean;
  cantidad: number;
  saldoCantidad: number;
  /** null sin `tienda.costos`. */
  costoUnitario: string | null;
  valor: string | null;
  saldoValor: string | null;
  costoPromedio: string | null;
};
