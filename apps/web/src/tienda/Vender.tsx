import {
  aCentavos,
  deCentavos,
  ETIQUETA_MEDIO,
  MEDIOS_PAGO,
  normalizarDecimal,
  type AfiliadoResumen,
  type MedioPago,
  type Paginado,
  type ProductoVista,
  type TurnoVista,
  type VentaDetalle,
} from '@kip/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api } from '../api';
import { CajaBusqueda, EncabezadoPagina, useRetardado } from '../componentes';
import { formatoPesos } from '../formato';
import { Aviso, Boton, Campo, Selector } from '../ui';
import { WhatsAppVenta } from './WhatsAppVenta';

type Item = { producto: ProductoVista; cantidad: number };
type Pago = { medio: MedioPago; valor: string };

const pesos = (c: bigint) => deCentavos(c);
const entero = (c: bigint) => pesos(c).replace(/\.00$/, '');

/** Punto de venta de la tienda: se cobra por la caja abierta del cajero. */
export function Vender({ empresa }: { empresa: string }) {
  const qc = useQueryClient();
  const caja = useQuery({
    queryKey: ['caja', 'actual'],
    queryFn: () => api<TurnoVista | null>('/caja/actual'),
  });
  const [buscar, setBuscar] = useState('');
  const q = useRetardado(buscar);
  const productos = useQuery({
    queryKey: ['tienda/productos', 'venta', q],
    queryFn: () =>
      api<ProductoVista[]>(`/tienda/productos?estado=activos&buscar=${encodeURIComponent(q)}`),
  });
  const [items, setItems] = useState<Item[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([{ medio: 'EFECTIVO', valor: '' }]);
  const [recibido, setRecibido] = useState('');
  const [obs, setObs] = useState('');
  const [afiliado, setAfiliado] = useState<AfiliadoResumen | null>(null);
  const [buscarAf, setBuscarAf] = useState('');
  const qa = useRetardado(buscarAf);
  const afiliados = useQuery({
    queryKey: ['afiliados', 'venta', qa],
    queryFn: () =>
      api<Paginado<AfiliadoResumen>>(
        `/afiliados?buscar=${encodeURIComponent(qa)}&estado=activos&porPagina=5`,
      ),
    enabled: qa.length >= 2,
  });
  const [hecha, setHecha] = useState<VentaDetalle | null>(null);
  const campoBusqueda = useRef<HTMLDivElement>(null);

  const total = items.reduce(
    (s, i) => s + aCentavos(i.producto.precioVenta) * BigInt(i.cantidad),
    0n,
  );
  const valorDe = (p: Pago, i: number) =>
    pagos.length === 1 && i === 0 ? total : aCentavos(normalizarDecimal(p.valor) ?? '0');
  const suma = pagos.reduce((a, p, i) => a + valorDe(p, i), 0n);
  const efectivo = pagos.reduce((a, p, i) => (p.medio === 'EFECTIVO' ? a + valorDe(p, i) : a), 0n);
  const recibidoC = recibido ? aCentavos(normalizarDecimal(recibido) ?? '0') : efectivo;
  const cambio = recibidoC - efectivo;
  const usados = new Set(pagos.map((p) => p.medio));
  const cuadra = total > 0n && suma === total && (efectivo === 0n || recibidoC >= efectivo);
  const sinCaja = caja.data === null;

  function agregar(p: ProductoVista) {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.producto.id === p.id);
      if (i >= 0) return prev.map((x, k) => (k === i ? { ...x, cantidad: x.cantidad + 1 } : x));
      return [...prev, { producto: p, cantidad: 1 }];
    });
  }
  function alEnter() {
    // Lector de códigos: el código exacto se agrega y se limpia la búsqueda.
    const cod = buscar.trim().toUpperCase().replace(/\s/g, '');
    const p = (productos.data ?? []).find((x) => x.codigo === cod && x.precioVenta !== '0.00');
    if (p) {
      agregar(p);
      setBuscar('');
    }
  }
  function limpiar() {
    setItems([]);
    setPagos([{ medio: 'EFECTIVO', valor: '' }]);
    setRecibido('');
    setObs('');
    setAfiliado(null);
    setBuscarAf('');
    setBuscar('');
  }

  const vender = useMutation({
    mutationFn: () =>
      api<VentaDetalle>('/tienda/ventas', {
        method: 'POST',
        body: {
          afiliadoId: afiliado?.id ?? null,
          lineas: items.map((i) => ({ productoId: i.producto.id, cantidad: i.cantidad })),
          total: pesos(total),
          pagos: pagos.map((p, i) => ({ medio: p.medio, valor: pesos(valorDe(p, i)) })),
          ...(efectivo > 0n ? { recibido: pesos(recibidoC) } : {}),
          ...(obs.trim() ? { observaciones: obs.trim() } : {}),
        },
      }),
    onSuccess: (v) => {
      setHecha(v);
      limpiar();
      void qc.invalidateQueries({ queryKey: ['tienda'] });
      void qc.invalidateQueries({ queryKey: ['tienda/productos'] });
      void qc.invalidateQueries({ queryKey: ['caja'] });
    },
    onError: () => void qc.invalidateQueries({ queryKey: ['tienda/productos'] }),
  });

  const cambiarPago = (i: number, c: Partial<Pago>) =>
    setPagos(pagos.map((p, k) => (k === i ? { ...p, ...c } : p)));

  return (
    <>
      <EncabezadoPagina
        titulo="Vender"
        descripcion="La venta se cobra por su caja abierta: el efectivo entra al cuadre."
      />
      {sinCaja && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          No tiene la caja abierta.{' '}
          <a className="font-medium underline" href="#/caja">
            Abra su caja
          </a>{' '}
          para vender.
        </p>
      )}
      {hecha && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span>
            Venta {hecha.numero} por <strong>{formatoPesos(hecha.total)}</strong>
            {hecha.cambio && hecha.cambio !== '0.00' && (
              <>
                {' '}
                · Cambio: <strong>{formatoPesos(hecha.cambio)}</strong>
              </>
            )}
          </span>
          <span className="flex gap-2">
            <a
              className="rounded-md border border-emerald-300 px-3 py-1.5 font-medium hover:bg-emerald-100"
              href={`#/venta?id=${hecha.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Imprimir tirilla
            </a>
            <WhatsAppVenta key={hecha.id} v={hecha} empresa={empresa} />
            <button
              type="button"
              className="rounded-md px-3 py-1.5 font-medium hover:bg-emerald-100"
              onClick={() => setHecha(null)}
            >
              Cerrar
            </button>
          </span>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <section aria-label="Productos" className="space-y-3">
          <div
            ref={campoBusqueda}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), alEnter())}
          >
            <CajaBusqueda
              valor={buscar}
              onCambio={setBuscar}
              placeholder="Nombre o código (Enter agrega el código exacto)"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {(productos.data ?? []).map((p) => {
              const sinPrecio = aCentavos(p.precioVenta) <= 0n;
              const enCuenta = items.find((i) => i.producto.id === p.id)?.cantidad ?? 0;
              const agotado = p.existencia - enCuenta <= 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={sinPrecio || agotado}
                  onClick={() => agregar(p)}
                  className="rounded-lg border border-stone-200 bg-white p-3 text-left hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="block text-sm font-medium text-stone-900">{p.nombre}</span>
                  <span className="mt-1 block text-base font-semibold tabular-nums text-amber-800">
                    {formatoPesos(p.precioVenta)}
                  </span>
                  <span className="block text-xs text-stone-500">
                    {sinPrecio
                      ? 'Sin precio'
                      : agotado
                        ? 'Agotado'
                        : `Hay ${p.existencia - enCuenta}`}
                  </span>
                </button>
              );
            })}
          </div>
          {productos.data?.length === 0 && (
            <p className="text-sm text-stone-500">No hay productos con ese nombre o código.</p>
          )}
        </section>

        <section
          aria-label="Cuenta"
          className="space-y-3 self-start rounded-lg border border-stone-200 bg-white p-4"
        >
          {vender.isError && <Aviso>{vender.error.message}</Aviso>}
          {items.length === 0 ? (
            <p className="text-sm text-stone-500">Toque un producto para agregarlo a la cuenta.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {items.map((i) => (
                <li key={i.producto.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="flex-1">
                    {i.producto.nombre}
                    <span className="block text-xs text-stone-500">
                      {formatoPesos(i.producto.precioVenta)} c/u
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label="Quitar uno"
                    className="h-7 w-7 rounded border border-stone-300"
                    onClick={() =>
                      setItems(
                        items
                          .map((x) =>
                            x.producto.id === i.producto.id
                              ? { ...x, cantidad: x.cantidad - 1 }
                              : x,
                          )
                          .filter((x) => x.cantidad > 0),
                      )
                    }
                  >
                    −
                  </button>
                  <span className="w-6 text-center tabular-nums">{i.cantidad}</span>
                  <button
                    type="button"
                    aria-label="Sumar uno"
                    disabled={i.cantidad >= i.producto.existencia}
                    className="h-7 w-7 rounded border border-stone-300 disabled:opacity-40"
                    onClick={() => agregar(i.producto)}
                  >
                    +
                  </button>
                  <span className="w-24 text-right tabular-nums">
                    {formatoPesos(pesos(aCentavos(i.producto.precioVenta) * BigInt(i.cantidad)))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between border-t border-stone-200 pt-3 text-lg font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatoPesos(pesos(total))}</span>
          </div>

          <div className="space-y-1 text-sm">
            {afiliado ? (
              <p className="flex items-center justify-between rounded bg-stone-50 px-3 py-2">
                <span>
                  Cliente: <strong>{afiliado.nombre}</strong> ({afiliado.documento})
                </span>
                <button
                  type="button"
                  className="text-xs text-red-700"
                  onClick={() => setAfiliado(null)}
                >
                  Quitar
                </button>
              </p>
            ) : (
              <>
                <Campo
                  etiqueta="Cliente (opcional: documento o nombre del afiliado)"
                  value={buscarAf}
                  onChange={(e) => setBuscarAf(e.target.value)}
                />
                {(afiliados.data?.datos ?? []).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="block w-full rounded border border-stone-200 px-3 py-1.5 text-left hover:bg-amber-50"
                    onClick={() => {
                      setAfiliado(a);
                      setBuscarAf('');
                    }}
                  >
                    {a.nombre} · {a.documento}
                  </button>
                ))}
              </>
            )}
          </div>

          {total > 0n && (
            <div className="space-y-2 rounded-md border border-stone-200 p-3">
              {pagos.map((p, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="w-36">
                    <Selector
                      etiqueta={i === 0 ? 'Medio de pago' : 'Otro medio'}
                      value={p.medio}
                      onChange={(e) => cambiarPago(i, { medio: e.target.value as MedioPago })}
                    >
                      {MEDIOS_PAGO.filter((m) => m === p.medio || !usados.has(m)).map((m) => (
                        <option key={m} value={m}>
                          {ETIQUETA_MEDIO[m]}
                        </option>
                      ))}
                    </Selector>
                  </div>
                  <div className="flex-1">
                    <Campo
                      etiqueta="Valor"
                      inputMode="decimal"
                      value={pagos.length === 1 ? entero(total) : p.valor}
                      disabled={pagos.length === 1}
                      onChange={(e) => cambiarPago(i, { valor: e.target.value })}
                    />
                  </div>
                  {pagos.length > 1 && (
                    <button
                      type="button"
                      className="pb-2 text-xs text-red-700"
                      onClick={() => setPagos(pagos.filter((_, k) => k !== i))}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
              {pagos.length < MEDIOS_PAGO.length && (
                <button
                  type="button"
                  className="text-xs font-medium text-amber-800 hover:underline"
                  onClick={() => {
                    const libre = MEDIOS_PAGO.find((m) => !usados.has(m))!;
                    setPagos(
                      pagos.length === 1
                        ? [
                            { ...pagos[0]!, valor: entero(total) },
                            { medio: libre, valor: '' },
                          ]
                        : [...pagos, { medio: libre, valor: '' }],
                    );
                  }}
                >
                  + Pago combinado (otro medio)
                </button>
              )}
              {pagos.length > 1 && (
                <p className={`text-xs ${suma === total ? 'text-emerald-700' : 'text-red-700'}`}>
                  {suma === total
                    ? 'Los pagos suman el total.'
                    : suma < total
                      ? `Faltan ${formatoPesos(pesos(total - suma))}`
                      : `Sobran ${formatoPesos(pesos(suma - total))}`}
                </p>
              )}
              {efectivo > 0n && (
                <>
                  <Campo
                    etiqueta="Efectivo recibido"
                    inputMode="decimal"
                    placeholder={entero(efectivo)}
                    value={recibido}
                    onChange={(e) => setRecibido(e.target.value)}
                  />
                  <p
                    className={`text-sm font-medium ${cambio < 0n ? 'text-red-700' : 'text-stone-700'}`}
                  >
                    {cambio < 0n
                      ? `Faltan ${formatoPesos(pesos(-cambio))}`
                      : `Cambio: ${formatoPesos(pesos(cambio))}`}
                  </p>
                </>
              )}
            </div>
          )}
          <Campo
            etiqueta="Observaciones (opcional)"
            value={obs}
            maxLength={300}
            onChange={(e) => setObs(e.target.value)}
          />
          <div className="flex gap-2">
            <Boton
              className="flex-1"
              disabled={!cuadra || sinCaja}
              cargando={vender.isPending}
              onClick={() => vender.mutate()}
            >
              Cobrar {total > 0n ? formatoPesos(pesos(total)) : ''}
            </Boton>
            {items.length > 0 && (
              <Boton variante="secundario" type="button" onClick={limpiar}>
                Vaciar
              </Boton>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
