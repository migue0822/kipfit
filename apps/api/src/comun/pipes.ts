import { normalizarBusqueda } from '@kip/shared';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/** Valida que un parámetro de ruta (`:id`) sea un UUID. */
export const IdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('Identificador inválido'),
});

/** Error de Prisma por valor repetido en una columna única. */
export function esViolacionUnica(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

/** Parte un texto de búsqueda en palabras (máximo 5) para buscar cada una. */
export function terminosBusqueda(texto: string | undefined): string[] {
  return normalizarBusqueda(texto ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 5);
}

export function filtroEstado(estado: 'activos' | 'inactivos' | 'todos') {
  return estado === 'todos' ? {} : { activo: estado === 'activos' };
}
