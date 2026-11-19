import { ETIQUETA_MEDIO, type VentaDetalle } from '@kip/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { formatoFechaHora, formatoPesos } from '../formato';

/** Tirilla de una venta para imprimir (se abre en otra pestaña: #/venta?id=…). */
export function VentaImpresa({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['tienda/ventas', 'impresa', id],
    queryFn: () => api<VentaDetalle>(`/tienda/ventas/${id}`),
  });
  if (q.isPending) return <p className="p-6 text-sm text-stone-500">Cargando…</p>;
  if (q.isError) return <p className="p-6 text-sm text-red-700">{q.error.message}</p>;
  const v = q.data;
  return (
    <div className="mx-auto my-6 max-w-sm bg-white p-6 text-stone-900 shadow print:my-0 print:shadow-none">
      <div className="text-center">
        <p className="text-lg font-semibold">{v.empresa}</p>
        <p className="text-sm text-stone-600">{v.sucursal}</p>
        <p className="mt-3 text-sm font-semibold tracking-wide">VENTA {v.numero}</p>
        {v.anulada && <p className="mt-1 text-sm font-bold text-red-700">ANULADA</p>}
        <p className="mt-1 text-xs text-stone-500">Documento interno, no es factura de venta</p>
      </div>
      <div className="mt-4 space-y-1 text-sm">
        <p>Fecha: {formatoFechaHora(v.fecha)}</p>
        {v.afiliado && <p>Cliente: {v.afiliado}</p>}
      </div>
      <table className="mt-3 w-full border-t border-dashed border-stone-400 text-sm">
        <tbody>
          {v.lineas.map((l) => (
            <tr key={l.productoId}>
              <td className="py-1 pr-2 align-top">
                {l.cantidad} × {l.productoNombre}
                <span className="block text-xs text-stone-500">{formatoPesos(l.precio)} c/u</span>
              </td>
              <td className="py-1 text-right align-top tabular-nums">{formatoPesos(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 border-t border-dashed border-stone-400 pt-3 text-sm">
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatoPesos(v.total)}</span>
        </div>
        {v.pagos.map((p) => (
          <div key={p.medio} className="flex justify-between">
            <span>{ETIQUETA_MEDIO[p.medio]}</span>
            <span className="tabular-nums">{formatoPesos(p.valor)}</span>
          </div>
        ))}
        {v.recibido && (
          <>
            <div className="flex justify-between">
              <span>Recibido</span>
              <span className="tabular-nums">{formatoPesos(v.recibido)}</span>
            </div>
            <div className="flex justify-between">
              <span>Cambio</span>
              <span className="tabular-nums">{formatoPesos(v.cambio ?? '0')}</span>
            </div>
          </>
        )}
      </div>
      {v.motivoAnulacion && (
        <p className="mt-3 text-xs text-stone-600">Anulada: {v.motivoAnulacion}</p>
      )}
      {v.cajero && <p className="mt-4 text-center text-xs text-stone-500">Atendió: {v.cajero}</p>}
      <p className="mt-2 text-center text-xs text-stone-500">¡Gracias por su compra!</p>
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
