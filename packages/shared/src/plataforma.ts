import { z } from 'zod';
import { decimalSchema } from './comun.js';
import { registroSchema } from './esquemas/auth.js';

/**
 * Licencias de Kipfit: planes, vencimiento, demostraciones y pagos de cada empresa. Se manejan desde la
 * consola de plataforma de OrdenKipu, que llama a la API de Kipfit por la red interna del servidor (con la
 * clave `PLATAFORMA_CLAVE`). Al vencer, la empresa queda en solo lectura; el plan limita usuarios y sucursales.
 * Las respuestas tienen la misma forma que las de OrdenKipu para que la consola las muestre igual.
 */

/** Quien vende y da soporte; sale en los avisos de licencia. */
export const CONTACTO_PLATAFORMA = {
  nombre: 'Ing. Miguel López',
  telefono: '+57 319 377 6896',
  whatsapp: '573193776896',
};

/** Días de demostración de una empresa registrada desde la página de ingreso (`DEMO_DIAS` cambia el número). */
export const DIAS_DEMO = 15;

/** ACTIVA (usa el programa mientras esté pagada), SUSPENDIDA (solo lectura) y RETIRADA (sin acceso, oculta). */
export const ESTADOS_LICENCIA = ['ACTIVA', 'SUSPENDIDA', 'RETIRADA'] as const;
export type EstadoLicencia = (typeof ESTADOS_LICENCIA)[number];

/** Días antes del vencimiento en que la empresa ve el aviso. */
export const DIAS_AVISO_LICENCIA = 5;

const DIA = 24 * 60 * 60 * 1000;
const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA);

/** Suma días a una fecha AAAA-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA).toISOString().slice(0, 10);
}

/** Licencia de la empresa como la ve quien entra (perfil). */
export type LicenciaEmpresa = {
  /** Puede consultar e imprimir, pero no registrar nada. */
  soloLectura: boolean;
  motivo: 'VENCIDA' | 'SUSPENDIDA' | null;
  /** Último día pagado (incluido); null = sin vencimiento. */
  pagadoHasta: string | null;
  /** Días que faltan para el vencimiento (0 = vence hoy); null = sin vencimiento. */
  diasRestantes: number | null;
  /** En demostración: con vencimiento y sin ningún pago vigente. */
  enDemo: boolean;
  plan: string | null;
};

/** Estado de la licencia hoy (fecha de Colombia AAAA-MM-DD). La empresa usa el programa hasta el día pagado inclusive. */
export function estadoLicencia(d: {
  estado: string;
  pagadoHasta: string | null;
  hoy: string;
}): Pick<LicenciaEmpresa, 'soloLectura' | 'motivo' | 'diasRestantes'> {
  const diasRestantes = d.pagadoHasta ? diasEntre(d.hoy, d.pagadoHasta) : null;
  if (d.estado === 'SUSPENDIDA') return { soloLectura: true, motivo: 'SUSPENDIDA', diasRestantes };
  if (diasRestantes !== null && diasRestantes < 0) {
    return { soloLectura: true, motivo: 'VENCIDA', diasRestantes };
  }
  return { soloLectura: false, motivo: null, diasRestantes };
}

/** Suma meses a una fecha AAAA-MM-DD; si el día no existe en el mes de llegada, queda el último (31-ene + 1 = 28/29-feb). */
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const total = a * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/**
 * Nuevo "pagado hasta" al registrar un pago de `meses`: continúa desde el vencimiento si aún no ha
 * pasado (no se pierden días) o desde la fecha del pago si ya venció o no tenía fecha.
 */
export function extenderLicencia(pagadoHasta: string | null, fechaPago: string, meses: number) {
  const base = pagadoHasta && pagadoHasta >= fechaPago ? pagadoHasta : fechaPago;
  return sumarMeses(base, meses);
}

/** Mensaje de la API cuando la empresa está en solo lectura. */
export function mensajeSoloLectura(
  l: Pick<LicenciaEmpresa, 'motivo' | 'pagadoHasta' | 'enDemo'>,
): string {
  const contacto = `Comuníquese con ${CONTACTO_PLATAFORMA.nombre} (${CONTACTO_PLATAFORMA.telefono}).`;
  if (l.motivo === 'SUSPENDIDA') {
    return `La cuenta de la empresa está suspendida: puede consultar e imprimir, pero no registrar. ${contacto}`;
  }
  return l.enDemo
    ? `La demostración terminó el ${l.pagadoHasta ?? ''}: puede consultar e imprimir, pero no registrar. ${contacto}`
    : `El plan de la empresa venció el ${l.pagadoHasta ?? ''}: puede consultar e imprimir, pero no registrar. ${contacto}`;
}

// ---------------------------------------------------------------- esquemas

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const limite = z
  .number()
  .int('Debe ser un número entero')
  .min(1, 'Mínimo 1')
  .max(1000)
  .nullable()
  .default(null);

/** Un plan de Kipfit no tiene módulos (si la consola los manda, se ignoran). */
export const planSchema = z.object({
  nombre: z.string().trim().min(2, 'Indique el nombre del plan').max(60),
  precioMensual: decimalSchema({ enteros: 12, decimales: 2, nombre: 'El precio' }),
  /** Usuarios activos permitidos (null = sin límite). */
  maxUsuarios: limite,
  /** Sucursales activas permitidas (null = sin límite). */
  maxSucursales: limite,
});
export type PlanDatos = z.output<typeof planSchema>;

export const licenciaSchema = z.object({
  /** null = sin plan: sin límites. */
  planId: z.uuid().nullable(),
  /** null = sin vencimiento. */
  pagadoHasta: fecha.nullable(),
  estado: z.enum(ESTADOS_LICENCIA),
  notas: z.string().trim().max(1000).optional(),
});
export type LicenciaDatos = z.output<typeof licenciaSchema>;

export const MEDIOS_PAGO_LICENCIA = [
  'TRANSFERENCIA',
  'NEQUI',
  'DAVIPLATA',
  'EFECTIVO',
  'CONSIGNACION',
  'OTRO',
] as const;

export const pagoLicenciaSchema = z.object({
  fecha,
  meses: z.number().int().min(1, 'Mínimo 1 mes').max(36, 'Máximo 36 meses'),
  valor: decimalSchema({ enteros: 14, decimales: 2, nombre: 'El valor' }),
  medio: z.enum(MEDIOS_PAGO_LICENCIA),
  referencia: z.string().trim().max(100).optional(),
  observaciones: z.string().trim().max(500).optional(),
});
export type PagoLicenciaDatos = z.output<typeof pagoLicenciaSchema>;

export const anularPagoLicenciaSchema = z.object({
  motivo: z.string().trim().min(3, 'Indique el motivo').max(300),
});

export const cambiarEstadoPlanSchema = z.object({ activo: z.boolean() });

/** La consola crea la empresa (el registro público puede estar cerrado). */
export const crearEmpresaPlataformaSchema = z.object({
  empresa: registroSchema.shape.empresa,
  sucursal: registroSchema.shape.sucursal,
  usuario: z.object({
    nombre: z.string().trim().min(2, 'Indique el nombre del administrador').max(100),
    email: z.string().trim().toLowerCase().pipe(z.email('Correo electrónico inválido')),
    /** Obligatoria si el correo no tiene cuenta; si ya la tiene, se ignora (no se cambia su contraseña). */
    password: z
      .string()
      .max(128)
      .optional()
      .transform((v) => (v ? v : undefined)),
  }),
  planId: z.uuid().nullable(),
  /** Fin de la demostración (o de lo ya pagado); null = sin vencimiento. */
  pagadoHasta: fecha.nullable(),
  notas: z.string().trim().max(1000).optional(),
});
export type CrearEmpresaPlataforma = z.output<typeof crearEmpresaPlataformaSchema>;

// ---------------------------------------------------------------- respuestas (iguales a OrdenKipu)

export type PlanPlataforma = {
  id: string;
  nombre: string;
  precioMensual: string;
  /** Siempre vacío en Kipfit (no tiene módulos). */
  modulos: string[];
  maxUsuarios: number | null;
  maxSucursales: number | null;
  activo: boolean;
  /** Empresas no retiradas con este plan. */
  empresas: number;
};

export type EmpresaPlataforma = {
  id: string;
  nit: string;
  dv: number;
  razonSocial: string;
  creadoEn: string;
  estado: EstadoLicencia;
  pagadoHasta: string | null;
  soloLectura: boolean;
  diasRestantes: number | null;
  enDemo: boolean;
  plan: { id: string; nombre: string; precioMensual: string } | null;
  notas: string | null;
  usuariosActivos: number;
  sucursalesActivas: number;
  /** Último ingreso de alguien a la empresa. */
  ultimoIngreso: string | null;
  /** Ventas vigentes del mes en curso (cantidad), para ver si de verdad la usan. */
  ventasMes: number;
  /** Primer administrador activo, para contactarlo. */
  administrador: { nombre: string; email: string } | null;
  telefono: string | null;
};

export type PagoLicencia = {
  id: string;
  fecha: string;
  meses: number;
  valor: string;
  medio: (typeof MEDIOS_PAGO_LICENCIA)[number];
  referencia: string | null;
  observaciones: string | null;
  pagadoHastaAnterior: string | null;
  pagadoHasta: string;
  registradoPor: string;
  anulado: boolean;
  motivoAnulacion: string | null;
  creadoEn: string;
};

export type DetalleEmpresaPlataforma = EmpresaPlataforma & { pagos: PagoLicencia[] };
