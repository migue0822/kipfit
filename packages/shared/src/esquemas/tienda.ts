import { z } from 'zod';
import { decimalSchema, ESTADOS_FILTRO, opcional } from '../comun.js';
import { aCentavos, pagosSchema, type MedioPago } from './caja.js';

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

// ───────────── Ventas y devoluciones ─────────────

const fechaDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ventaSchema = z
  .object({
    /** Afiliado que compra; sin él es una venta de mostrador. */
    afiliadoId: z
      .uuid('Afiliado inválido')
      .nullish()
      .transform((v) => v ?? null),
    lineas: z
      .array(
        z.object({
          productoId: z.uuid('Producto inválido'),
          cantidad: unidades('La cantidad', 1),
        }),
      )
      .min(1, 'Agregue al menos un producto')
      .max(100, 'Máximo 100 productos por venta')
      .superRefine(sinRepetidos),
    /** Total que vio el cajero: si los precios cambiaron mientras tanto, 409. */
    total: decimalSchema({ enteros: 12, decimales: 2, nombre: 'El total' }),
    pagos: pagosSchema,
    /** Efectivo que entregó el cliente (para el cambio); por defecto, lo cobrado en efectivo. */
    recibido: opcional(decimalSchema({ enteros: 12, decimales: 2, nombre: 'El valor recibido' })),
    observaciones: opcional(z.string().trim().max(300)),
  })
  .superRefine((v, ctx) => {
    const efectivo = v.pagos
      .filter((p) => p.medio === 'EFECTIVO')
      .reduce((a, p) => a + aCentavos(p.valor), 0n);
    if (v.recibido && aCentavos(v.recibido) < efectivo) {
      ctx.addIssue({
        code: 'custom',
        path: ['recibido'],
        message: 'El valor recibido es menor que el efectivo a cobrar',
      });
    }
  });
export type VentaDatos = z.output<typeof ventaSchema>;

export const MEDIOS_DEVOLUCION = ['EFECTIVO', 'OTRO'] as const;
export type MedioDevolucion = (typeof MEDIOS_DEVOLUCION)[number];
export const ETIQUETA_MEDIO_DEVOLUCION: Record<MedioDevolucion, string> = {
  EFECTIVO: 'Efectivo (sale de la caja)',
  OTRO: 'Otro medio (transferencia, tarjeta…)',
};

export const devolucionSchema = z.object({
  motivo: z.string().trim().min(3, 'Escriba el motivo de la devolución').max(300),
  medio: z.enum(MEDIOS_DEVOLUCION, { error: 'Indique cómo se devuelve el dinero' }),
  lineas: z
    .array(
      z.object({
        productoId: z.uuid('Producto inválido'),
        cantidad: unidades('La cantidad', 1),
      }),
    )
    .min(1, 'Indique qué se devuelve')
    .max(100)
    .superRefine(sinRepetidos),
});
export type DevolucionDatos = z.output<typeof devolucionSchema>;

export const ventasQuerySchema = z.object({
  desde: opcional(fechaDia),
  hasta: opcional(fechaDia),
  buscar: opcional(z.string().trim().max(60)),
});

export type VentaResumen = {
  id: string;
  numero: string;
  fecha: string;
  anulada: boolean;
  total: string;
  /** Lo ya devuelto en dinero (devoluciones vigentes). */
  devuelto: string;
  unidades: number;
  afiliado: string | null;
  cajero: string | null;
  medios: MedioPago[];
};

export type LineaVentaVista = {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precio: string;
  total: string;
  devueltas: number;
  /** null sin `tienda.costos`. */
  costo: string | null;
};

export type DevolucionVista = {
  id: string;
  numero: string;
  fecha: string;
  anulada: boolean;
  motivo: string | null;
  medio: MedioDevolucion;
  total: string;
  lineas: { productoNombre: string; cantidad: number; total: string }[];
};

export type VentaDetalle = VentaResumen & {
  observaciones: string | null;
  motivoAnulacion: string | null;
  reciboId: string | null;
  reciboNumero: string | null;
  afiliadoDocumento: string | null;
  /** Celular del afiliado (para enviar el recibo por WhatsApp). */
  afiliadoTelefono: string | null;
  pagos: { medio: MedioPago; valor: string }[];
  recibido: string | null;
  cambio: string | null;
  lineas: LineaVentaVista[];
  devoluciones: DevolucionVista[];
  empresa: string;
  sucursal: string;
  /** La venta se cobró en una caja que sigue abierta: aún se puede anular. */
  anulable: boolean;
};

export type InformeTienda = {
  desde: string;
  hasta: string;
  ventas: number;
  devoluciones: number;
  unidades: number;
  /** Vendido menos devuelto. */
  neto: string;
  /** null sin `tienda.costos`. */
  costo: string | null;
  utilidad: string | null;
  margen: string | null;
  porDia: { fecha: string; neto: string; costo: string | null }[];
  porProducto: { producto: string; unidades: number; neto: string; costo: string | null }[];
  porMedio: { medio: MedioPago | 'DEVOLUCIONES'; valor: string }[];
};

const pesosTexto = (v: string) => {
  const [e = '0', d = '00'] = v.split('.');
  const miles = e.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${miles}${d === '00' ? '' : `,${d}`}`;
};

/** Texto del recibo de una venta para WhatsApp (WhatsApp web solo manda texto). */
export function mensajeVenta(
  v: {
    numero: string;
    fecha: string;
    total: string;
    afiliado: string | null;
    lineas: { cantidad: number; productoNombre: string; total: string }[];
    pagos: { medio: MedioPago; valor: string }[];
  },
  empresa: string,
  nombreMedio: (m: MedioPago) => string,
): string {
  const primero = v.afiliado?.trim().split(/\s+/)[0];
  const detalle = v.lineas
    .map((l) => `• ${l.cantidad} × ${l.productoNombre}: ${pesosTexto(l.total)}`)
    .join('\n');
  const pagos = v.pagos.map((p) => `${nombreMedio(p.medio)} ${pesosTexto(p.valor)}`).join(', ');
  return [
    `${primero ? `Hola ${primero}, g` : 'G'}racias por su compra en ${empresa}.`,
    `Recibo ${v.numero} (${v.fecha.slice(0, 10).split('-').reverse().join('/')})`,
    detalle,
    `*Total: ${pesosTexto(v.total)}*`,
    `Pago: ${pagos}`,
  ].join('\n');
}
