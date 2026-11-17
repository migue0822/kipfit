/** Colombia no tiene horario de verano: siempre UTC−5. */
const BOGOTA = '-05:00';
const DIA = 24 * 60 * 60 * 1000;

/** Fecha AAAA-MM-DD en hora de Colombia → instante UTC del inicio de ese día. */
export function inicioDiaBogota(fecha: string): Date {
  return new Date(`${fecha}T00:00:00${BOGOTA}`);
}

/** Inicio del día siguiente (para filtrar con `lt`). */
export function finDiaBogota(fecha: string): Date {
  return new Date(inicioDiaBogota(fecha).getTime() + DIA);
}

/** La fecha de hoy en Colombia, AAAA-MM-DD. */
export function hoyBogota(ahora = new Date()): string {
  return new Date(ahora.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Suma días a una fecha AAAA-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  return new Date(new Date(`${fecha}T00:00:00Z`).getTime() + dias * DIA).toISOString().slice(0, 10);
}

/** AAAA-MM-DD → valor para una columna `date` de Prisma. */
export const aFechaDb = (fecha: string) => new Date(`${fecha}T00:00:00Z`);
/** Columna `date` de Prisma → AAAA-MM-DD. */
export const deFechaDb = (d: Date) => d.toISOString().slice(0, 10);
