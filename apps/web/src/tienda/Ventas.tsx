import {
  ETIQUETA_MEDIO,
  ETIQUETA_MEDIO_DEVOLUCION,
  MEDIOS_DEVOLUCION,
  PERMISOS,
  tienePermiso,
  type MedioDevolucion,
  type Perfil,
  type VentaDetalle,
  type VentaResumen,
} from '@kip/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import {
  CajaBusqueda,
  EncabezadoPagina,
  Insignia,
  Panel,
  Tabla,
  useRetardado,
} from '../componentes';
import { formatoFechaHora, formatoPesos, hoyBogota } from '../formato';
import { Aviso, Boton, Campo, Selector } from '../ui';

/** Ventas de la tienda: consulta, reimpresión, devoluciones y anulación. */
export function Ventas({ perfil }: { perfil: Perfil }) {
  const [desde, setDesde] = useState(hoyBogota());
  const [hasta, setHasta] = useState(hoyBogota());
  const [buscar, setBuscar] = useState('');
  const b = useRetardado(buscar);
  const [abierta, setAbierta] = useState<string | null>(null);
  const lista = useQuery({
    queryKey: ['tienda/ventas', desde, hasta, b],
    queryFn: () =>
      api<VentaResumen[]>(
        `/tienda/ventas?desde=${desde}&hasta=${hasta}&buscar=${encodeURIComponent(b)}`,
      ),
  });
  const total = (lista.data ?? [])
    .filter((v) => !v.anulada)
    .reduce((s, v) => s + Number(v.total) - Number(v.devuelto), 0);
  return (
    <>
      <EncabezadoPagina
        titulo="Ventas de la tienda"
        descripcion="De la sucursal que tiene seleccionada. Tóquela para ver el detalle, imprimir, devolver o anular."
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Campo
            etiqueta="Desde"
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Campo
            etiqueta="Hasta"
            type="date"
            value={hasta}
            min={desde}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
        <CajaBusqueda valor={buscar} onCambio={setBuscar} placeholder="Número o cliente" />
        <p className="ml-auto text-sm text-stone-600">
          Vendido neto: <strong>{formatoPesos(total.toFixed(2))}</strong>
        </p>
      </div>
      {lista.isError && <Aviso>{lista.error.message}</Aviso>}
      <Tabla
        cargando={lista.isPending}
        filas={lista.data}
        vacio="No hay ventas en ese período."
        onAbrir={(v) => setAbierta(v.id)}
        columnas={[
          { titulo: 'Venta', celda: (v) => <span className="font-medium">{v.numero}</span> },
          { titulo: 'Fecha', celda: (v) => formatoFechaHora(v.fecha) },
          { titulo: 'Cliente', celda: (v) => v.afiliado ?? 'Mostrador' },
          { titulo: 'Unid.', celda: (v) => v.unidades, clase: 'text-right' },
          {
            titulo: 'Total',
            clase: 'text-right tabular-nums',
            celda: (v) => formatoPesos(v.total),
          },
          {
            titulo: 'Estado',
            celda: (v) =>
              v.anulada ? (
                <Insignia tono="peligro">Anulada</Insignia>
              ) : Number(v.devuelto) > 0 ? (
                <Insignia tono="acento">Devuelto {formatoPesos(v.devuelto)}</Insignia>
              ) : (
                <Insignia tono="exito">Vigente</Insignia>
              ),
          },
        ]}
      />
      <Panel titulo="Venta" abierto={!!abierta} onCerrar={() => setAbierta(null)} amplio>
        {abierta && <Detalle id={abierta} perfil={perfil} />}
      </Panel>
    </>
  );
}

function Detalle({ id, perfil }: { id: string; perfil: Perfil }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['tienda/ventas', 'detalle', id],
    queryFn: () => api<VentaDetalle>(`/tienda/ventas/${id}`),
  });
  const [modo, setModo] = useState<'devolver' | 'anular' | null>(null);
  const puedeVender = tienePermiso(perfil.permisos, PERMISOS.TIENDA_VENDER);
  const puedeAnular = tienePermiso(perfil.permisos, PERMISOS.TIENDA_ANULAR);
  const refrescar = (v: VentaDetalle) => {
    qc.setQueryData(['tienda/ventas', 'detalle', id], v);
    void qc.invalidateQueries({ queryKey: ['tienda'] });
    void qc.invalidateQueries({ queryKey: ['tienda/productos'] });
    void qc.invalidateQueries({ queryKey: ['tienda/ventas'] });
    void qc.invalidateQueries({ queryKey: ['caja'] });
    setModo(null);
  };
  if (q.isPending) return <p className="text-sm text-stone-500">Cargando…</p>;
  if (q.isError) return <Aviso>{q.error.message}</Aviso>;
  const v = q.data;
  const hayQueDevolver = v.lineas.some((l) => l.devueltas < l.cantidad);
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-base font-semibold">
          {v.numero} {v.anulada && <Insignia tono="peligro">Anulada</Insignia>}
        </p>
        <p className="text-stone-500">
          {formatoFechaHora(v.fecha)} · {v.cajero ?? ''} · {v.afiliado ?? 'Mostrador'}
          {v.reciboNumero && <> · Recibo {v.reciboNumero}</>}
        </p>
        {v.motivoAnulacion && <p className="mt-1 text-red-700">Motivo: {v.motivoAnulacion}</p>}
      </div>
      <table className="w-full">
        <thead className="text-left text-xs text-stone-500">
          <tr>
            <th className="py-1">Producto</th>
            <th className="text-right">Cant.</th>
            <th className="text-right">Precio</th>
            <th className="text-right">Total</th>
            {v.lineas[0]?.costo !== null && <th className="text-right">Costo</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {v.lineas.map((l) => (
            <tr key={l.productoId}>
              <td className="py-1">
                {l.productoNombre}
                {l.devueltas > 0 && (
                  <span className="block text-xs text-amber-800">Devueltas: {l.devueltas}</span>
                )}
              </td>
              <td className="text-right tabular-nums">{l.cantidad}</td>
              <td className="text-right tabular-nums">{formatoPesos(l.precio)}</td>
              <td className="text-right tabular-nums">{formatoPesos(l.total)}</td>
              {l.costo !== null && (
                <td className="text-right tabular-nums">{formatoPesos(l.costo)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="space-y-0.5 border-t border-stone-200 pt-2">
        <p className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatoPesos(v.total)}</span>
        </p>
        {v.pagos.map((p) => (
          <p key={p.medio} className="flex justify-between text-stone-600">
            <span>{ETIQUETA_MEDIO[p.medio]}</span>
            <span className="tabular-nums">{formatoPesos(p.valor)}</span>
          </p>
        ))}
        {v.recibido && (
          <p className="flex justify-between text-stone-600">
            <span>Recibido / cambio</span>
            <span className="tabular-nums">
              {formatoPesos(v.recibido)} / {formatoPesos(v.cambio ?? '0')}
            </span>
          </p>
        )}
      </div>

      {v.devoluciones.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Devoluciones</h3>
          {v.devoluciones.map((d) => (
            <DevolucionFila key={d.id} d={d} puedeAnular={puedeAnular} onListo={refrescar} />
          ))}
        </div>
      )}

      {modo === null && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <a
            className="rounded-md border border-stone-300 px-4 py-2 font-medium text-stone-700 hover:bg-stone-50"
            href={`#/venta?id=${v.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Imprimir tirilla
          </a>
          {!v.anulada && puedeVender && hayQueDevolver && (
            <Boton variante="secundario" onClick={() => setModo('devolver')}>
              Devolver productos
            </Boton>
          )}
          {v.anulable && puedeAnular && (
            <Boton variante="secundario" onClick={() => setModo('anular')}>
              Anular venta
            </Boton>
          )}
        </div>
      )}
      {!v.anulada && !v.anulable && puedeAnular && modo === null && (
        <p className="text-xs text-stone-500">
          Solo se anula una venta sin devoluciones y cuya caja siga abierta; si no, use una
          devolución.
        </p>
      )}
      {modo === 'devolver' && (
        <FormDevolver v={v} onListo={refrescar} onCancelar={() => setModo(null)} />
      )}
      {modo === 'anular' && (
        <FormMotivo
          titulo="Anular la venta"
          ruta={`/tienda/ventas/${v.id}/anular`}
          onListo={refrescar}
          onCancelar={() => setModo(null)}
        />
      )}
    </div>
  );
}

function DevolucionFila({
  d,
  puedeAnular,
  onListo,
}: {
  d: VentaDetalle['devoluciones'][number];
  puedeAnular: boolean;
  onListo: (v: VentaDetalle) => void;
}) {
  const [anulando, setAnulando] = useState(false);
  return (
    <div className="rounded-md border border-stone-200 p-3">
      <p className="flex justify-between font-medium">
        <span>
          {d.numero} {d.anulada && <Insignia tono="peligro">Anulada</Insignia>}
        </span>
        <span className="tabular-nums">{formatoPesos(d.total)}</span>
      </p>
      <p className="text-stone-500">
        {formatoFechaHora(d.fecha)} · {ETIQUETA_MEDIO_DEVOLUCION[d.medio]} · {d.motivo}
      </p>
      <p className="text-stone-600">
        {d.lineas.map((l) => `${l.cantidad} × ${l.productoNombre}`).join(', ')}
      </p>
      {!d.anulada && puedeAnular && !anulando && (
        <button
          type="button"
          className="mt-1 text-xs text-red-700"
          onClick={() => setAnulando(true)}
        >
          Anular devolución
        </button>
      )}
      {anulando && (
        <FormMotivo
          titulo="Anular la devolución"
          ruta={`/tienda/ventas/devoluciones/${d.id}/anular`}
          onListo={onListo}
          onCancelar={() => setAnulando(false)}
        />
      )}
    </div>
  );
}

function FormMotivo({
  titulo,
  ruta,
  onListo,
  onCancelar,
}: {
  titulo: string;
  ruta: string;
  onListo: (v: VentaDetalle) => void;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const m = useMutation({
    mutationFn: () => api<VentaDetalle>(ruta, { method: 'POST', body: { motivo: motivo.trim() } }),
    onSuccess: onListo,
  });
  return (
    <div className="space-y-2 rounded-md border border-red-200 bg-red-50/50 p-3">
      <p className="font-medium">{titulo}</p>
      {m.isError && <Aviso>{m.error.message}</Aviso>}
      <Campo
        etiqueta="Motivo"
        value={motivo}
        maxLength={300}
        onChange={(e) => setMotivo(e.target.value)}
      />
      <div className="flex gap-2">
        <Boton
          cargando={m.isPending}
          disabled={motivo.trim().length < 3}
          onClick={() => m.mutate()}
        >
          Confirmar
        </Boton>
        <Boton variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
    </div>
  );
}

function FormDevolver({
  v,
  onListo,
  onCancelar,
}: {
  v: VentaDetalle;
  onListo: (v: VentaDetalle) => void;
  onCancelar: () => void;
}) {
  const [cant, setCant] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState('');
  const [medio, setMedio] = useState<MedioDevolucion>('EFECTIVO');
  const lineas = v.lineas
    .map((l) => ({ productoId: l.productoId, cantidad: Number(cant[l.productoId] || 0) }))
    .filter((l) => l.cantidad > 0);
  const total = v.lineas.reduce(
    (s, l) => s + Number(cant[l.productoId] || 0) * Number(l.precio),
    0,
  );
  const m = useMutation({
    mutationFn: () =>
      api<VentaDetalle>(`/tienda/ventas/${v.id}/devolucion`, {
        method: 'POST',
        body: { motivo: motivo.trim(), medio, lineas },
      }),
    onSuccess: onListo,
  });
  return (
    <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-3">
      <p className="font-medium">Devolver productos</p>
      {m.isError && <Aviso>{m.error.message}</Aviso>}
      {v.lineas.map((l) => {
        const quedan = l.cantidad - l.devueltas;
        return (
          <div key={l.productoId} className="flex items-center gap-3">
            <span className="flex-1">
              {l.productoNombre}
              <span className="block text-xs text-stone-500">Se pueden devolver {quedan}</span>
            </span>
            <input
              type="number"
              min={0}
              max={quedan}
              disabled={quedan === 0}
              aria-label={`Cantidad a devolver de ${l.productoNombre}`}
              value={cant[l.productoId] ?? ''}
              onChange={(e) => setCant({ ...cant, [l.productoId]: e.target.value })}
              className="w-20 rounded-md border border-stone-300 px-2 py-1 text-right"
            />
          </div>
        );
      })}
      <Selector
        etiqueta="Cómo se devuelve el dinero"
        value={medio}
        onChange={(e) => setMedio(e.target.value as MedioDevolucion)}
      >
        {MEDIOS_DEVOLUCION.map((x) => (
          <option key={x} value={x}>
            {ETIQUETA_MEDIO_DEVOLUCION[x]}
          </option>
        ))}
      </Selector>
      <Campo
        etiqueta="Motivo de la devolución"
        value={motivo}
        maxLength={300}
        onChange={(e) => setMotivo(e.target.value)}
      />
      <p className="font-medium">A devolver: {formatoPesos(total.toFixed(2))}</p>
      <div className="flex gap-2">
        <Boton
          cargando={m.isPending}
          disabled={lineas.length === 0 || motivo.trim().length < 3}
          onClick={() => m.mutate()}
        >
          Registrar devolución
        </Boton>
        <Boton variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
    </div>
  );
}
