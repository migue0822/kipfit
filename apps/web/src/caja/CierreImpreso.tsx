import { ETIQUETA_MEDIO, type DetalleTurno, type MedioPago } from '@kip/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { formatoFechaHora, formatoPesos } from '../formato';

export type FormatoCierre = 'resumido' | 'completo';

const Fila = ({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) => (
  <div className={`flex justify-between gap-2 ${fuerte ? 'font-semibold' : ''}`}>
    <span>{k}</span>
    <span className="tabular-nums">{v}</span>
  </div>
);

const Titulo = ({ children }: { children: string }) => (
  <p className="mt-4 border-t border-dashed border-stone-400 pt-2 text-xs font-semibold uppercase tracking-wide">
    {children}
  </p>
);

/** Botones para imprimir el cierre de una caja (resumido o completo), en otra pestaña. */
export function ImprimirCierre({ id }: { id: string }) {
  const clase =
    'rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50';
  return (
    <span className="inline-flex flex-wrap gap-2">
      <a
        className={clase}
        href={`#/cierre?id=${id}&formato=resumido`}
        target="_blank"
        rel="noreferrer"
      >
        Imprimir cierre resumido
      </a>
      <a
        className={clase}
        href={`#/cierre?id=${id}&formato=completo`}
        target="_blank"
        rel="noreferrer"
      >
        Imprimir cierre completo
      </a>
    </span>
  );
}

/** Tirilla del cierre de caja (#/cierre?id=…&formato=resumido|completo). */
export function CierreImpreso({ id, formato }: { id: string; formato: FormatoCierre }) {
  const q = useQuery({
    queryKey: ['caja', 'detalle', id],
    queryFn: () => api<DetalleTurno>(`/caja/turnos/${id}`),
  });
  if (q.isPending) return <p className="p-6 text-sm text-stone-500">Cargando…</p>;
  if (q.isError) return <p className="p-6 text-sm text-red-700">{q.error.message}</p>;
  const t = q.data;
  const r = t.resumen;
  const completo = formato === 'completo';
  const cerrada = t.estado === 'CERRADO';
  const otros = Object.entries(r.otrosMedios) as [MedioPago, string][];
  const dif = t.diferencia ?? '0.00';
  return (
    <div className="mx-auto my-6 max-w-sm bg-white p-6 text-sm text-stone-900 shadow print:my-0 print:shadow-none">
      <div className="text-center">
        <p className="text-lg font-semibold">{t.empresa}</p>
        <p className="text-stone-600">{t.sucursal}</p>
        <p className="mt-3 font-semibold tracking-wide">
          {cerrada ? 'CIERRE DE CAJA' : 'ESTADO DE CAJA (SIN CERRAR)'} {t.numero}
        </p>
        <p className="text-xs text-stone-500">{completo ? 'Completo' : 'Resumido'}</p>
      </div>
      <div className="mt-3 space-y-0.5">
        <p>Cajero: {t.cajeroNombre}</p>
        <p>Apertura: {formatoFechaHora(t.abiertoEn)}</p>
        {t.cerradoEn && <p>Cierre: {formatoFechaHora(t.cerradoEn)}</p>}
      </div>

      <Titulo>Cuadre de efectivo</Titulo>
      <div className="mt-1 space-y-0.5">
        <Fila k="Base" v={formatoPesos(r.base)} />
        <Fila k="+ Cobros en efectivo" v={formatoPesos(r.efectivoCobros)} />
        <Fila k="+ Ingresos" v={formatoPesos(r.ingresos)} />
        <Fila k="− Egresos" v={formatoPesos(r.egresos)} />
        <Fila k="Efectivo esperado" v={formatoPesos(r.esperado)} fuerte />
        {cerrada && t.contado && (
          <>
            <Fila k="Efectivo contado" v={formatoPesos(t.contado)} fuerte />
            <Fila
              k={Number(dif) < 0 ? 'Faltante' : Number(dif) > 0 ? 'Sobrante' : 'Diferencia'}
              v={formatoPesos(dif)}
              fuerte
            />
          </>
        )}
      </div>

      <Titulo>Cobros por medio (informativo)</Titulo>
      <div className="mt-1 space-y-0.5">
        <Fila k="Efectivo" v={formatoPesos(r.efectivoCobros)} />
        {otros.map(([m, v]) => (
          <Fila key={m} k={ETIQUETA_MEDIO[m]} v={formatoPesos(v)} />
        ))}
        <Fila k="Total cobrado" v={formatoPesos(r.totalCobros)} fuerte />
        <p className="text-xs text-stone-500">
          {r.recibos} recibos vigentes
          {r.recibosAnulados > 0 ? `, ${r.recibosAnulados} anulados` : ''}
        </p>
      </div>

      {t.observaciones && (
        <>
          <Titulo>Observaciones</Titulo>
          <p className="mt-1">{t.observaciones}</p>
        </>
      )}

      {completo && (
        <>
          <Titulo>Recibos</Titulo>
          <table className="mt-1 w-full text-xs">
            <tbody>
              {t.recibos.length === 0 && (
                <tr>
                  <td className="text-stone-500">Sin recibos.</td>
                </tr>
              )}
              {t.recibos.map((x) => (
                <tr key={x.id} className={x.anulado ? 'text-stone-400 line-through' : ''}>
                  <td className="py-0.5 pr-2 align-top">
                    {x.numero}
                    <span className="block text-stone-500">
                      {x.afiliadoNombre ?? x.concepto} ·{' '}
                      {x.pagos.map((p) => ETIQUETA_MEDIO[p.medio]).join(' + ')}
                    </span>
                  </td>
                  <td className="py-0.5 text-right align-top tabular-nums">
                    {formatoPesos(x.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {t.productos.length > 0 && (
            <>
              <Titulo>Tienda: vendido por producto</Titulo>
              <table className="mt-1 w-full text-xs">
                <tbody>
                  {t.productos.map((p) => (
                    <tr key={p.producto}>
                      <td className="py-0.5 pr-2">
                        {p.cantidad} × {p.producto}
                      </td>
                      <td className="py-0.5 text-right tabular-nums">{formatoPesos(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {t.devoluciones.length > 0 && (
            <>
              <Titulo>Devoluciones en efectivo</Titulo>
              <table className="mt-1 w-full text-xs">
                <tbody>
                  {t.devoluciones.map((d) => (
                    <tr key={d.numero} className={d.anulada ? 'text-stone-400 line-through' : ''}>
                      <td className="py-0.5 pr-2">
                        {d.numero}
                        <span className="block text-stone-500">{d.motivo}</span>
                      </td>
                      <td className="py-0.5 text-right tabular-nums">{formatoPesos(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <Titulo>Ingresos y egresos de efectivo</Titulo>
          <table className="mt-1 w-full text-xs">
            <tbody>
              {t.movimientos.length === 0 && (
                <tr>
                  <td className="text-stone-500">Sin movimientos.</td>
                </tr>
              )}
              {t.movimientos.map((m) => (
                <tr key={m.id} className={m.anulado ? 'text-stone-400 line-through' : ''}>
                  <td className="py-0.5 pr-2">
                    {m.numero} · {m.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'}
                    <span className="block text-stone-500">{m.concepto}</span>
                  </td>
                  <td className="py-0.5 text-right tabular-nums">
                    {m.tipo === 'INGRESO' ? '' : '−'}
                    {formatoPesos(m.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4 text-center text-xs text-stone-500">
        <p className="border-t border-stone-400 pt-1">Cajero</p>
        <p className="border-t border-stone-400 pt-1">Supervisor</p>
      </div>
      <div className="mt-5 flex gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex-1 rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
        >
          Imprimir
        </button>
        <a
          className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700"
          href={`#/cierre?id=${id}&formato=${completo ? 'resumido' : 'completo'}`}
        >
          Ver {completo ? 'resumido' : 'completo'}
        </a>
      </div>
    </div>
  );
}
