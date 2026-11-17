import { PERMISOS, tienePermiso, type Perfil } from '@kip/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErrorApi } from './api';

const CLAVE = ['perfil'] as const;

/** Perfil de la sesión actual, o null si no hay sesión. */
export function usePerfil() {
  return useQuery({
    queryKey: CLAVE,
    queryFn: async () => {
      try {
        return await api<Perfil>('/auth/yo');
      } catch (e) {
        if (e instanceof ErrorApi && e.estado === 401) return null;
        throw e;
      }
    },
    retry: false,
  });
}

/**
 * Mutación que, al terminar, deja el perfil devuelto como sesión actual.
 * Descarta los datos en caché, que podían ser de otra empresa o sucursal.
 */
export function useAccion<E>(ruta: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: E) => api<Perfil>(ruta, { method: 'POST', body }),
    onSuccess: (perfil) => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== CLAVE[0] });
      qc.setQueryData(CLAVE, perfil);
    },
  });
}

export function useSalir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      // Primero se marca "sin sesión" en la misma consulta que observa la pantalla
      // (vaciar toda la caché la desconectaba y la salida no se veía hasta otro clic);
      // después se descartan los demás datos, que eran de esa sesión.
      qc.setQueryData(CLAVE, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== CLAVE[0] });
    },
  });
}
