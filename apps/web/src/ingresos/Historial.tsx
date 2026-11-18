import type { IngresoVista } from '@kip/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { InsigniaResultado, fechaHora } from './comun';

/** Últimos ingresos del afiliado (en la ficha). */
export function HistorialIngresos({ afiliadoId }: { afiliadoId: string }) {
  const q = useQuery({
    queryKey: ['ingresos', 'afiliado', afiliadoId],
    queryFn: () => api<IngresoVista[]>(`/ingresos/afiliado/${afiliadoId}`),
  });
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-stone-700">Últimos ingresos</h4>
      {q.isPending && <p className="text-sm text-stone-500">Cargando…</p>}
      {q.isError && <p className="text-sm text-red-700">{q.error.message}</p>}
      {q.data && q.data.length === 0 && (
        <p className="text-sm text-stone-500">Todavía no ha ingresado.</p>
      )}
      {q.data && q.data.length > 0 && (
        <ul className="divide-y divide-stone-100 rounded-md border border-stone-200">
          {q.data.slice(0, 15).map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span className="text-stone-700">{fechaHora(i.fechaHora)}</span>
              <span className="text-xs text-stone-500">{i.planNombre ?? 'Sin membresía'}</span>
              <span className="flex gap-2">
                <InsigniaResultado i={i} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
