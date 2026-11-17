import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

function aQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Lista de un recurso con filtros; conserva la página anterior mientras carga la siguiente. */
export function useListado<T>(
  recurso: string,
  params: Record<string, string | number | undefined>,
) {
  return useQuery({
    queryKey: [recurso, params],
    queryFn: () => api<T>(`/${recurso}${aQuery(params)}`),
    placeholderData: keepPreviousData,
  });
}

/** Crear (sin id) o editar (con id) y refrescar los listados del recurso. */
export function useGuardar<E, R>(recurso: string, id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: E) =>
      api<R>(id ? `/${recurso}/${id}` : `/${recurso}`, { method: id ? 'PUT' : 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [recurso] }),
  });
}

export function useCambiarEstado<R>(recurso: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      api<R>(`/${recurso}/${id}/estado`, { method: 'PATCH', body: { activo } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [recurso] }),
  });
}
