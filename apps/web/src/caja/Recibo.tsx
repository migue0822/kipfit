import { ETIQUETA_MEDIO, type ReciboVista } from '@kip/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { formatoFechaHora, formatoPesos } from '../formato';

/** Recibo de cobro para imprimir (se abre en otra pestaña: #/recibo?id=…). */
export function Recibo({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['recibo', id],
    queryFn: () => api<ReciboVista>(`/recibos/${id}`),
  });
  if (q.isPending) return <p className="p-6 text-sm text-stone-500">Cargando…</p>;
  if (q.isError) return <p className="p-6 text-sm text-red-700">{q.error.message}</p>;
  const r = q.data;
  return (
    <div className="mx-auto my-6 max-w-sm bg-white p-6 text-stone-900 shadow print:my-0 print:shadow-none">
      <div className="text-center">
        <p className="text-lg font-semibold">{r.empresa}</p>
        <p className="text-sm text-stone-600">{r.sucursal}</p>
        <p className="mt-3 text-sm font-semibold tracking-wide">RECIBO DE CAJA {r.numero}</p>
        {r.anulado && <p className="mt-1 text-sm font-bold text-red-700">ANULADO</p>}
      </div>
      <dl className="mt-4 space-y-1 text-sm">
        <Fila k="Fecha" v={formatoFechaHora(r.fechaHora)} />
        {r.afiliadoNombre && <Fila k="Afiliado" v={r.afiliadoNombre} />}
        {r.afiliadoDocumento && <Fila k="Documento" v={r.afiliadoDocumento} />}
        <Fila k="Concepto" v={r.concepto} />
      </dl>
      <div className="mt-4 border-t border-dashed border-stone-400 pt-3 text-sm">
        {r.pagos.map((p) => (
          <div key={p.medio} className="flex justify-between">
            <span>{ETIQUETA_MEDIO[p.medio]}</span>
            <span className="tabular-nums">{formatoPesos(p.valor)}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatoPesos(r.valor)}</span>
        </div>
      </div>
      {r.motivoAnulacion && (
        <p className="mt-3 text-xs text-stone-600">Anulado: {r.motivoAnulacion}</p>
      )}
      {r.cajero && <p className="mt-4 text-center text-xs text-stone-500">Atendió: {r.cajero}</p>}
      <button
        type="button"
        onClick={() => window.print()}
        className="mt-5 w-full rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 print:hidden"
      >
        Imprimir
      </button>
    </div>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-stone-500">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
