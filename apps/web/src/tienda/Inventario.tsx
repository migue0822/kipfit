import {
  ajusteSchema,
  entradaSchema,
  ETIQUETA_DOCUMENTO_TIENDA,
  ETIQUETA_MOTIVO_AJUSTE,
  MOTIVOS_AJUSTE,
  PERMISOS,
  tienePermiso,
  type DocumentoDetalle,
  type DocumentoResumen,
  type FilaKardex,
  type Perfil,
  type ProductoVista,
} from '@kip/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, ErrorApi } from '../api';
import { EncabezadoPagina, Insignia, Panel, Segmentos, Tabla } from '../componentes';
import { formatoFechaHora, formatoPesos } from '../formato';
import { Aviso, Boton, Campo, Selector, erroresDeApi, validar, type Errores } from '../ui';

type Pestana = 'entrada' | 'ajuste' | 'movimientos';

const usarProductos = () =>
  useQuery({
    queryKey: ['tienda/productos', 'activos-todos'],
    queryFn: () => api<ProductoVista[]>('/tienda/productos?estado=activos'),
  });

/** Inventario de la tienda: entradas de mercancía, conteos y mermas, y movimientos con su kardex. */
export function Inventario({ perfil }: { perfil: Perfil }) {
  const puedeMover = tienePermiso(perfil.permisos, PERMISOS.TIENDA_INVENTARIO);
  const [pestana, setPestana] = useState<Pestana>(puedeMover ? 'entrada' : 'movimientos');
  const opciones = [
    ...(puedeMover
      ? [
          { valor: 'entrada' as const, texto: 'Entrada de mercancía' },
          { valor: 'ajuste' as const, texto: 'Conteo y mermas' },
        ]
      : []),
    { valor: 'movimientos' as const, texto: 'Movimientos' },
  ];
  return (
    <>
      <EncabezadoPagina
        titulo="Inventario de la tienda"
        descripcion="Todo movimiento queda en un documento con su consecutivo. De la sucursal que tiene seleccionada."
      />
      <div className="mb-4">
        <Segmentos etiqueta="Sección" valor={pestana} onCambio={setPestana} opciones={opciones} />
      </div>
      {pestana === 'entrada' && puedeMover && <Entrada onListo={() => setPestana('movimientos')} />}
      {pestana === 'ajuste' && puedeMover && <Ajuste onListo={() => setPestana('movimientos')} />}
      {pestana === 'movimientos' && <Movimientos perfil={perfil} />}
    </>
  );
}

function useRefrescar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['tienda/productos'] });
    void qc.invalidateQueries({ queryKey: ['tienda/inventario'] });
  };
}

// ───────────── Entrada ─────────────

type LineaEntrada = { productoId: string; cantidad: string; costoUnitario: string };

function Entrada({ onListo }: { onListo: () => void }) {
  const productos = usarProductos();
  const refrescar = useRefrescar();
  const [cab, setCab] = useState({ proveedor: '', referencia: '', observaciones: '' });
  const [lineas, setLineas] = useState<LineaEntrada[]>([
    { productoId: '', cantidad: '', costoUnitario: '' },
  ]);
  const [errores, setErrores] = useState<Errores>({});
  const guardar = useMutation({
    mutationFn: (body: unknown) =>
      api<DocumentoDetalle>('/tienda/inventario/entradas', { method: 'POST', body }),
    onSuccess: () => {
      refrescar();
      onListo();
    },
    onError: (e) => setErrores(erroresDeApi(e)),
  });
  const cambiar = (i: number, k: keyof LineaEntrada, v: string) =>
    setLineas(lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const total = lineas.reduce(
    (s, l) =>
      s +
      (Number(l.cantidad) || 0) *
        (Number(l.costoUnitario.replace(/\./g, '').replace(',', '.')) || 0),
    0,
  );

  function enviar(e: FormEvent) {
    e.preventDefault();
    const body = {
      ...cab,
      lineas: lineas.filter((l) => l.productoId || l.cantidad || l.costoUnitario),
    };
    const { datos, errores } = validar(entradaSchema, body);
    setErrores(errores);
    if (datos) guardar.mutate(body);
  }

  return (
    <form
      onSubmit={enviar}
      className="max-w-3xl space-y-4 rounded-lg border border-stone-200 bg-white p-4"
      noValidate
    >
      {guardar.isError && <Aviso>{guardar.error.message}</Aviso>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo
          etiqueta="Proveedor (opcional)"
          value={cab.proveedor}
          onChange={(e) => setCab({ ...cab, proveedor: e.target.value })}
        />
        <Campo
          etiqueta="Factura o remisión (opcional)"
          value={cab.referencia}
          onChange={(e) => setCab({ ...cab, referencia: e.target.value })}
        />
        <Campo
          etiqueta="Observaciones (opcional)"
          value={cab.observaciones}
          onChange={(e) => setCab({ ...cab, observaciones: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        {lineas.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_5.5rem_7rem_auto] items-end gap-2">
            <Selector
              etiqueta={i === 0 ? 'Producto' : ''}
              value={l.productoId}
              error={errores[`lineas.${i}.productoId`]}
              onChange={(e) => cambiar(i, 'productoId', e.target.value)}
            >
              <option value="">Escoja…</option>
              {(productos.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} (hay {p.existencia})
                </option>
              ))}
            </Selector>
            <Campo
              etiqueta={i === 0 ? 'Unidades' : ''}
              inputMode="numeric"
              value={l.cantidad}
              error={errores[`lineas.${i}.cantidad`]}
              onChange={(e) => cambiar(i, 'cantidad', e.target.value)}
            />
            <Campo
              etiqueta={i === 0 ? 'Costo c/u' : ''}
              inputMode="decimal"
              value={l.costoUnitario}
              error={errores[`lineas.${i}.costoUnitario`]}
              onChange={(e) => cambiar(i, 'costoUnitario', e.target.value)}
            />
            <Boton
              type="button"
              variante="secundario"
              aria-label="Quitar"
              disabled={lineas.length === 1}
              onClick={() => setLineas(lineas.filter((_, j) => j !== i))}
            >
              ✕
            </Boton>
          </div>
        ))}
        {errores.lineas && <p className="text-xs text-red-600">{errores.lineas}</p>}
        <Boton
          type="button"
          variante="secundario"
          onClick={() =>
            setLineas([...lineas, { productoId: '', cantidad: '', costoUnitario: '' }])
          }
        >
          + Agregar producto
        </Boton>
      </div>
      <div className="flex items-center justify-between border-t border-stone-200 pt-4">
        <p className="text-sm text-stone-600">
          Total aproximado: <b>{formatoPesos(total.toFixed(2))}</b>
        </p>
        <Boton type="submit" cargando={guardar.isPending}>
          Registrar entrada
        </Boton>
      </div>
      <p className="text-xs text-stone-500">
        El costo promedio de cada producto se recalcula con lo que entra. Para subir el precio de
        venta, use Productos.
      </p>
    </form>
  );
}

// ───────────── Ajuste (conteo, mermas) ─────────────

type LineaAjuste = { productoId: string; nombre: string; sistema: number; contado: string };

function Ajuste({ onListo }: { onListo: () => void }) {
  const productos = usarProductos();
  const refrescar = useRefrescar();
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState<string>('CONTEO');
  const [observaciones, setObservaciones] = useState('');
  const [lineas, setLineas] = useState<LineaAjuste[]>([]);
  const [errores, setErrores] = useState<Errores>({});
  const [aviso, setAviso] = useState('');
  const esConteo = motivo === 'CONTEO';

  const guardar = useMutation({
    mutationFn: (body: unknown) =>
      api<DocumentoDetalle>('/tienda/inventario/ajustes', { method: 'POST', body }),
    onSuccess: () => {
      refrescar();
      onListo();
    },
    onError: async (e) => {
      setErrores(erroresDeApi(e));
      if (e instanceof ErrorApi && e.estado === 409) {
        // La existencia cambió: se recarga lo que dice el sistema sin perder lo digitado.
        const nuevos = await qc.fetchQuery({
          queryKey: ['tienda/productos', 'activos-todos'],
          queryFn: () => api<ProductoVista[]>('/tienda/productos?estado=activos'),
          staleTime: 0,
        });
        setLineas((ls) =>
          ls.map((l) => ({
            ...l,
            sistema: nuevos.find((p) => p.id === l.productoId)?.existencia ?? l.sistema,
          })),
        );
        setAviso(e.message);
      }
    },
  });

  const agregar = (id: string) => {
    const p = productos.data?.find((x) => x.id === id);
    if (p && !lineas.some((l) => l.productoId === id))
      setLineas([
        ...lineas,
        { productoId: id, nombre: p.nombre, sistema: p.existencia, contado: '' },
      ]);
  };
  const cargarTodos = () =>
    setLineas(
      (productos.data ?? []).map((p) => ({
        productoId: p.id,
        nombre: p.nombre,
        sistema: p.existencia,
        contado: '',
      })),
    );

  function enviar(e: FormEvent) {
    e.preventDefault();
    setAviso('');
    const body = {
      motivo,
      observaciones,
      lineas: lineas
        .filter((l) => l.contado.trim() !== '')
        .map((l) => ({ productoId: l.productoId, sistema: l.sistema, contado: l.contado })),
    };
    const { datos, errores } = validar(ajusteSchema, body);
    setErrores(errores);
    if (datos) guardar.mutate(body);
  }

  return (
    <form
      onSubmit={enviar}
      className="max-w-3xl space-y-4 rounded-lg border border-stone-200 bg-white p-4"
      noValidate
    >
      {guardar.isError && !aviso && <Aviso>{guardar.error.message}</Aviso>}
      {aviso && <Aviso>{aviso}</Aviso>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Selector etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          {MOTIVOS_AJUSTE.map((m) => (
            <option key={m} value={m}>
              {ETIQUETA_MOTIVO_AJUSTE[m]}
            </option>
          ))}
        </Selector>
        <Campo
          etiqueta={esConteo ? 'Observaciones (opcional)' : 'Qué pasó'}
          value={observaciones}
          error={errores.observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Selector etiqueta="Agregar producto" value="" onChange={(e) => agregar(e.target.value)}>
            <option value="">Escoja…</option>
            {(productos.data ?? [])
              .filter((p) => !lineas.some((l) => l.productoId === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </Selector>
        </div>
        {esConteo && (
          <Boton type="button" variante="secundario" onClick={cargarTodos}>
            Cargar todos los productos
          </Boton>
        )}
      </div>
      {lineas.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-500">
            <tr>
              <th className="py-1 font-medium">Producto</th>
              <th className="py-1 text-right font-medium">Dice el sistema</th>
              <th className="w-32 py-1 text-right font-medium">
                {esConteo ? 'Contado' : 'Quedan'}
              </th>
              <th className="w-20 py-1 text-right font-medium">Diferencia</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {lineas.map((l, i) => {
              const dif = l.contado.trim() === '' ? null : Number(l.contado) - l.sistema;
              return (
                <tr key={l.productoId}>
                  <td className="py-1.5">{l.nombre}</td>
                  <td className="py-1.5 text-right tabular-nums">{l.sistema}</td>
                  <td className="py-1.5">
                    <input
                      inputMode="numeric"
                      aria-label={`Contado de ${l.nombre}`}
                      value={l.contado}
                      onChange={(e) =>
                        setLineas(
                          lineas.map((x, j) => (j === i ? { ...x, contado: e.target.value } : x)),
                        )
                      }
                      className="w-full rounded-md border border-stone-300 px-2 py-1 text-right outline-none focus:border-amber-600"
                    />
                  </td>
                  <td
                    className={`py-1.5 text-right tabular-nums ${dif ? (dif < 0 ? 'text-red-700' : 'text-emerald-700') : 'text-stone-400'}`}
                  >
                    {dif === null ? '—' : dif > 0 ? `+${dif}` : dif}
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label="Quitar"
                      className="text-stone-400 hover:text-stone-700"
                      onClick={() => setLineas(lineas.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {errores.lineas && <p className="text-xs text-red-600">{errores.lineas}</p>}
      <div className="flex items-center justify-between border-t border-stone-200 pt-4">
        <p className="text-xs text-stone-500">
          Solo se ajustan los productos con una cantidad escrita. Lo que sobra entra y lo que falta
          sale al costo promedio.
        </p>
        <Boton type="submit" cargando={guardar.isPending} disabled={lineas.length === 0}>
          Guardar ajuste
        </Boton>
      </div>
    </form>
  );
}

// ───────────── Movimientos ─────────────

function Movimientos({ perfil }: { perfil: Perfil }) {
  const puedeAnular = tienePermiso(perfil.permisos, PERMISOS.TIENDA_ANULAR);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [kardexDe, setKardexDe] = useState('');
  const docs = useQuery({
    queryKey: ['tienda/inventario', 'documentos'],
    queryFn: () => api<DocumentoResumen[]>('/tienda/inventario/documentos'),
  });
  const productos = usarProductos();
  const kardex = useQuery({
    queryKey: ['tienda/inventario', 'kardex', kardexDe],
    queryFn: () => api<FilaKardex[]>(`/tienda/inventario/kardex?productoId=${kardexDe}`),
    enabled: kardexDe !== '',
  });
  const conCostos = docs.data?.some((d) => d.valorTotal !== null) ?? false;

  return (
    <div className="space-y-6">
      {docs.isError && <Aviso>{docs.error.message}</Aviso>}
      <Tabla
        filas={docs.data}
        cargando={docs.isPending}
        vacio="Todavía no hay entradas ni ajustes en esta sucursal."
        onAbrir={(d) => setAbierto(d.id)}
        columnas={[
          {
            titulo: 'Documento',
            celda: (d) => (
              <>
                <span className="font-medium">{d.numero}</span>{' '}
                {d.anulado && <Insignia tono="apagado">Anulado</Insignia>}
              </>
            ),
          },
          {
            titulo: 'Tipo',
            celda: (d) =>
              ETIQUETA_DOCUMENTO_TIENDA[d.tipo] +
              (d.motivo
                ? ` · ${ETIQUETA_MOTIVO_AJUSTE[d.motivo as keyof typeof ETIQUETA_MOTIVO_AJUSTE] ?? d.motivo}`
                : ''),
          },
          { titulo: 'Fecha', celda: (d) => formatoFechaHora(d.fecha) },
          { titulo: 'Unidades', clase: 'text-right tabular-nums', celda: (d) => d.unidades },
          ...(conCostos
            ? [
                {
                  titulo: 'Valor',
                  clase: 'text-right tabular-nums',
                  celda: (d: DocumentoResumen) => formatoPesos(d.valorTotal ?? '0'),
                },
              ]
            : []),
          { titulo: 'Registró', celda: (d) => d.creadoPor ?? '—' },
        ]}
      />
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-stone-700">Kardex de un producto</h3>
        <div className="max-w-sm">
          <Selector
            etiqueta="Producto"
            value={kardexDe}
            onChange={(e) => setKardexDe(e.target.value)}
          >
            <option value="">Escoja…</option>
            {(productos.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Selector>
        </div>
        {kardexDe && (
          <Tabla
            filas={kardex.data?.map((k) => ({ ...k }))}
            cargando={kardex.isPending}
            vacio="Este producto todavía no tiene movimientos."
            columnas={[
              { titulo: 'Fecha', celda: (k) => formatoFechaHora(k.fecha) },
              {
                titulo: 'Documento',
                celda: (k) => k.documento + (k.anulacion ? ' (anulación)' : ''),
              },
              {
                titulo: 'Unidades',
                clase: 'text-right tabular-nums',
                celda: (k) => (k.cantidad > 0 ? `+${k.cantidad}` : k.cantidad),
              },
              { titulo: 'Saldo', clase: 'text-right tabular-nums', celda: (k) => k.saldoCantidad },
              ...(kardex.data?.some((k) => k.valor !== null)
                ? [
                    {
                      titulo: 'Valor',
                      clase: 'text-right tabular-nums',
                      celda: (k: FilaKardex) => formatoPesos(k.valor ?? '0'),
                    },
                    {
                      titulo: 'Costo promedio',
                      clase: 'text-right tabular-nums',
                      celda: (k: FilaKardex) => formatoPesos(k.costoPromedio ?? '0'),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </section>
      <Panel titulo="Documento" abierto={abierto !== null} onCerrar={() => setAbierto(null)}>
        {abierto && <DetalleDocumento id={abierto} puedeAnular={puedeAnular} />}
      </Panel>
    </div>
  );
}

function DetalleDocumento({ id, puedeAnular }: { id: string; puedeAnular: boolean }) {
  const refrescar = useRefrescar();
  const d = useQuery({
    queryKey: ['tienda/inventario', 'documento', id],
    queryFn: () => api<DocumentoDetalle>(`/tienda/inventario/documentos/${id}`),
  });
  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const anular = useMutation({
    mutationFn: () =>
      api<DocumentoDetalle>(`/tienda/inventario/documentos/${id}/anular`, {
        method: 'POST',
        body: { motivo },
      }),
    onSuccess: () => {
      refrescar();
      setConfirmando(false);
    },
  });
  if (d.isPending) return <p className="text-sm text-stone-500">Cargando…</p>;
  if (d.isError) return <Aviso>{d.error.message}</Aviso>;
  const x = d.data;
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="text-lg font-semibold text-stone-900">
          {x.numero} {x.anulado && <Insignia tono="apagado">Anulado</Insignia>}
        </h3>
        <p className="text-stone-600">
          {ETIQUETA_DOCUMENTO_TIENDA[x.tipo]} · {formatoFechaHora(x.fecha)}
          {x.creadoPor ? ` · ${x.creadoPor}` : ''}
        </p>
        {(x.proveedor || x.referencia) && (
          <p className="text-stone-600">
            {[x.proveedor, x.referencia && `Factura ${x.referencia}`].filter(Boolean).join(' · ')}
          </p>
        )}
        {x.observaciones && (
          <p className="mt-1 rounded bg-stone-50 px-3 py-2 text-stone-700">{x.observaciones}</p>
        )}
        {x.anulado && <p className="mt-1 text-red-700">Anulado: {x.motivoAnulacion}</p>}
      </div>
      <table className="w-full">
        <thead className="text-left text-xs text-stone-500">
          <tr>
            <th className="py-1 font-medium">Producto</th>
            {x.tipo === 'AJUSTE' && <th className="py-1 text-right font-medium">Sistema</th>}
            <th className="py-1 text-right font-medium">Unidades</th>
            {x.valorTotal !== null && <th className="py-1 text-right font-medium">Valor</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {x.lineas.map((l) => (
            <tr key={l.productoId}>
              <td className="py-1.5">{l.productoNombre}</td>
              {x.tipo === 'AJUSTE' && (
                <td className="py-1.5 text-right tabular-nums">{l.sistema}</td>
              )}
              <td className="py-1.5 text-right tabular-nums">
                {l.cantidad > 0 && x.tipo === 'AJUSTE' ? `+${l.cantidad}` : l.cantidad}
              </td>
              {l.valor !== null && (
                <td className="py-1.5 text-right tabular-nums">{formatoPesos(l.valor)}</td>
              )}
            </tr>
          ))}
        </tbody>
        {x.valorTotal !== null && (
          <tfoot>
            <tr className="border-t border-stone-300 font-medium">
              <td className="py-1.5" colSpan={x.tipo === 'AJUSTE' ? 3 : 2}>
                Total
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatoPesos(x.valorTotal)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      {puedeAnular && !x.anulado && (
        <div className="space-y-2 border-t border-stone-200 pt-4">
          {!confirmando ? (
            <Boton variante="secundario" onClick={() => setConfirmando(true)}>
              Anular documento
            </Boton>
          ) : (
            <>
              {anular.isError && <Aviso>{anular.error.message}</Aviso>}
              <Campo
                etiqueta="Motivo de la anulación"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <Boton
                  cargando={anular.isPending}
                  disabled={motivo.trim().length < 3}
                  onClick={() => anular.mutate()}
                >
                  Confirmar anulación
                </Boton>
                <Boton variante="secundario" onClick={() => setConfirmando(false)}>
                  Cancelar
                </Boton>
              </div>
              <p className="text-xs text-stone-500">
                Se devuelve cada unidad con su valor exacto. Si lo que entró ya se vendió, no se
                puede anular.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
