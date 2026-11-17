import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Palabras con tilde que aparecen en los nombres de los campos. */
const TILDES: Record<string, string> = {
  lineas: 'líneas',
  linea: 'línea',
  numero: 'número',
  telefono: 'teléfono',
  direccion: 'dirección',
  razon: 'razón',
  codigo: 'código',
  unidad: 'unidad',
  credito: 'crédito',
  periodo: 'período',
  categoria: 'categoría',
  dias: 'días',
};

/** Nombre legible de un campo: `lineas.2.cantidad` → "líneas 3 › cantidad"; `medioPago` → "medio pago". */
export function nombreCampo(ruta: PropertyKey[]): string {
  return ruta
    .map((p) =>
      typeof p === 'number'
        ? String(p + 1)
        : String(p)
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .toLowerCase()
            .split(' ')
            .map((w) => TILDES[w] ?? w)
            .join(' '),
    )
    .join(' › ')
    .replace(/ › (\d+)/g, ' $1');
}

/**
 * Valida el cuerpo de la petición con un esquema de @kip/shared.
 * Responde 400 con la lista de campos inválidos y sus mensajes; el mensaje general dice cuáles
 * (para las pantallas que no marcan el error en el campo).
 */
export class ZodPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(valor: unknown) {
    const r = this.schema.safeParse(valor);
    if (!r.success) {
      const errores = r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message }));
      const detalle = r.error.issues
        .slice(0, 3)
        .map((i) => (i.path.length ? `${nombreCampo(i.path)}: ${i.message}` : i.message))
        .join(' · ');
      const mas = r.error.issues.length > 3 ? ` (y ${r.error.issues.length - 3} más)` : '';
      throw new BadRequestException({
        mensaje: `Datos inválidos. ${detalle}${mas}`,
        errores,
      });
    }
    return r.data;
  }
}
