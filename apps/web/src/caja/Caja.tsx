import {
  aCentavos,
  deCentavos,
  ETIQUETA_MEDIO,
  PERMISOS,
  tienePermiso,
  type DetalleTurno,
  type MedioPago,
  type Perfil,
  type TurnoVista,
} from '@kip/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { formatoFechaHora, formatoPesos } from '../formato';
import { Insignia } from '../componentes';
import { Aviso, Boton, Campo, Selector } from '../ui';

/** Caja del cajero: abrir, ver el cuadre en vivo, registrar ingresos y egresos y cerrar con el efectivo contado. */
export function Caja({ perfil }: { perfil: Perfil }) {
  const qc = useQueryClient();
  const supervisa = tienePermiso(perfil.permisos, PERMISOS.CAJA_SUPERVISAR);
  const actual = useQuery({
    queryKey: ['caja', 'actual'],
    queryFn: () => api<TurnoVista | null>('/caja/actual'),
  });
  const turnos = useQuery({
    queryKey: ['caja', 'turnos'],
    queryFn: () => api<TurnoVista[]>('/caja/turnos'),
  });
  const [verId, setVerId] = useState<string | null>(null);
  const refrescar = () => qc.invalidateQueries({ queryKey: ['caja'] });

  return (
    <>
      <h1 className="font-['Literata',Georgia,serif] text-2xl font-semibold text-stone-900">
        Caja
      </h1>
      <p className="mt-1 text-sm text-stone-600">
        Cada cajero abre su caja con una base, cobra las membresías y la cierra contando el
        efectivo.
      </p>

      <div className="mt-5 max-w-3xl space-y-6">
        {actual.isPending && <p className="text-sm text-stone-500">Cargando…</p>}
        {actual.isError && <Aviso>{actual.error.message}</Aviso>}
        {actual.data === null && <Abrir onListo={refrescar} />}
        {actual.data && <TurnoAbierto turnoId={actual.data.id} onCambio={refrescar} />}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-stone-700">
            {supervisa ? 'Cajas de hoy (todos los cajeros)' : 'Mis cajas de hoy'}
          </h2>
          {turnos.data && turnos.data.length === 0 && (
            <p className="text-sm text-stone-500">Todavía no hay cajas hoy.</p>
          )}
          {turnos.data && turnos.data.length > 0 && (
            <ul className="divide-y divide-stone-100 rounded-md border border-stone-200 bg-white">
              {turnos.data.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setVerId(verId === t.id ? null : t.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-stone-50"
                  >
                    <span>
                      <span className="font-medium text-stone-900">{t.numero}</span>{' '}
                      <span className="text-stone-500">
                        {t.cajeroNombre} · {formatoFechaHora(t.abiertoEn)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {t.estado === 'ABIERTO' ? (
                        <Insignia tono="exito">Abierta</Insignia>
                      ) : (
                        <Insignia tono={t.diferencia === '0.00' ? 'neutro' : 'peligro'}>
                          {t.diferencia === '0.00'
                            ? 'Cuadró'
                            : `Diferencia ${formatoPesos(t.diferencia ?? '0')}`}
                        </Insignia>
                      )}
                    </span>
                  </button>
                  {verId === t.id && (
                    <div className="border-t border-stone-100 bg-stone-50/60 px-4 py-3">
                      <DetalleVista id={t.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Abrir({ onListo }: { onListo: () => void }) {
  const [base, setBase] = useState('');
  const abrir = useMutation({
    mutationFn: () =>
      api<TurnoVista>('/caja/abrir', { method: 'POST', body: { base: base || undefined } }),
    onSuccess: onListo,
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        abrir.mutate();
      }}
      className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4"
    >
      <h2 className="font-semibold text-stone-900">Abrir mi caja</h2>
      <p className="text-sm text-stone-600">Sin la caja abierta no se pueden cobrar membresías.</p>
      {abrir.isError && <Aviso>{abrir.error.message}</Aviso>}
      <Campo
        etiqueta="Base en efectivo (con la que empieza)"
        inputMode="decimal"
        placeholder="0"
        value={base}
        onChange={(e) => setBase(e.target.value)}
      />
      <Boton type="submit" cargando={abrir.isPending}>
        Abrir caja
      </Boton>
    </form>
  );
}

function TurnoAbierto({ turnoId, onCambio }: { turnoId: string; onCambio: () => void }) {
  const [modo, setModo] = useState<'ninguno' | 'movimiento' | 'cerrar'>('ninguno');
  const d = useQuery({
    queryKey: ['caja', 'detalle', turnoId],
    queryFn: () => api<DetalleTurno>(`/caja/turnos/${turnoId}`),
  });
  if (!d.data)
    return d.isError ? (
      <Aviso>{d.error.message}</Aviso>
    ) : (
      <p className="text-sm text-stone-500">Cargando…</p>
    );
  const t = d.data;
  return (
    <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-stone-900">
          Mi caja {t.numero} <Insignia tono="exito">Abierta</Insignia>
        </h2>
        <span className="text-xs text-stone-500">Desde {formatoFechaHora(t.abiertoEn)}</span>
      </div>
      <Cuadre t={t} />
      {modo === 'ninguno' && (
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" onClick={() => setModo('movimiento')}>
            Ingreso o egreso de efectivo
          </Boton>
          <Boton onClick={() => setModo('cerrar')}>Cerrar caja</Boton>
        </div>
      )}
      {modo === 'movimiento' && (
        <Movimiento
          onListo={() => {
            setModo('ninguno');
            onCambio();
          }}
          onCancelar={() => setModo('ninguno')}
        />
      )}
      {modo === 'cerrar' && (
        <Cerrar
          t={t}
          onListo={() => {
            setModo('ninguno');
            onCambio();
          }}
          onCancelar={() => setModo('ninguno')}
        />
      )}
      <Movimientos d={t} onCambio={onCambio} editable />
    </section>
  );
}

function Cuadre({ t }: { t: TurnoVista }) {
  const r = t.resumen;
  const filas: [string, string, boolean?][] = [
    ['Base', r.base],
    ['Cobros en efectivo', r.efectivoCobros],
    ['Ingresos de caja', r.ingresos],
    ['Egresos de caja', `-${r.egresos}`],
  ];
  const otros = Object.entries(r.otrosMedios) as [MedioPago, string][];
  return (
    <div className="text-sm">
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
        {filas.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-stone-600">{k}</dt>
            <dd className="text-right tabular-nums">{formatoPesos(v)}</dd>
          </div>
        ))}
        <dt className="border-t border-stone-200 pt-1 font-semibold text-stone-900">
          Efectivo que debe haber
        </dt>
        <dd className="border-t border-stone-200 pt-1 text-right font-semibold tabular-nums">
          {formatoPesos(r.esperado)}
        </dd>
      </dl>
      {otros.length > 0 && (
        <p className="mt-3 text-xs text-stone-500">
          Cobrado por otros medios (no está en la caja):{' '}
          {otros.map(([m, v]) => `${ETIQUETA_MEDIO[m]} ${formatoPesos(v)}`).join(' · ')}
        </p>
      )}
    </div>
  );
}

function Movimiento({ onListo, onCancelar }: { onListo: () => void; onCancelar: () => void }) {
  const [f, setF] = useState({ tipo: 'EGRESO', concepto: '', valor: '' });
  const crear = useMutation({
    mutationFn: () => api('/caja/movimientos', { method: 'POST', body: f }),
    onSuccess: onListo,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        crear.mutate();
      }}
      className="space-y-3 rounded-md border border-stone-200 p-3"
    >
      {crear.isError && <Aviso>{crear.error.message}</Aviso>}
      <Selector
        etiqueta="Tipo"
        value={f.tipo}
        onChange={(e) => setF({ ...f, tipo: e.target.value })}
      >
        <option value="EGRESO">Egreso (sale efectivo de la caja)</option>
        <option value="INGRESO">Ingreso (entra efectivo a la caja)</option>
      </Selector>
      <Campo
        etiqueta="Concepto"
        value={f.concepto}
        onChange={(e) => setF({ ...f, concepto: e.target.value })}
      />
      <Campo
        etiqueta="Valor"
        inputMode="decimal"
        value={f.valor}
        onChange={(e) => setF({ ...f, valor: e.target.value })}
      />
      <div className="flex justify-end gap-2">
        <Boton type="button" variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={crear.isPending}>
          Registrar
        </Boton>
      </div>
    </form>
  );
}

function Cerrar({
  t,
  onListo,
  onCancelar,
}: {
  t: TurnoVista;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [contado, setContado] = useState('');
  const [obs, setObs] = useState('');
  const cerrar = useMutation({
    mutationFn: () =>
      api(`/caja/turnos/${t.id}/cerrar`, {
        method: 'POST',
        body: { contado, observaciones: obs || undefined },
      }),
    onSuccess: onListo,
  });
  // Vista previa de la diferencia (el servidor decide).
  let dif: string | null = null;
  try {
    const n = contado.replace(/\./g, '').replace(',', '.');
    if (n.trim() !== '' && !Number.isNaN(Number(n)))
      dif = deCentavos(aCentavos(n) - aCentavos(t.resumen.esperado));
  } catch {
    dif = null;
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        cerrar.mutate();
      }}
      className="space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-3"
    >
      {cerrar.isError && <Aviso>{cerrar.error.message}</Aviso>}
      <Campo
        etiqueta="Efectivo contado en la caja"
        inputMode="decimal"
        autoFocus
        value={contado}
        onChange={(e) => setContado(e.target.value)}
      />
      {dif !== null && (
        <p className={`text-sm ${dif === '0.00' ? 'text-emerald-700' : 'text-red-700'}`}>
          {dif === '0.00'
            ? 'La caja cuadra.'
            : `${dif.startsWith('-') ? 'Faltan' : 'Sobran'} ${formatoPesos(dif.replace('-', ''))}. Escriba una observación.`}
        </p>
      )}
      <Campo
        etiqueta="Observaciones (obligatorias si no cuadra)"
        value={obs}
        onChange={(e) => setObs(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Boton type="button" variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={cerrar.isPending} disabled={contado.trim() === ''}>
          Cerrar caja
        </Boton>
      </div>
    </form>
  );
}

function DetalleVista({ id }: { id: string }) {
  const d = useQuery({
    queryKey: ['caja', 'detalle', id],
    queryFn: () => api<DetalleTurno>(`/caja/turnos/${id}`),
  });
  if (!d.data)
    return d.isError ? (
      <Aviso>{d.error.message}</Aviso>
    ) : (
      <p className="text-sm text-stone-500">Cargando…</p>
    );
  const t = d.data;
  return (
    <div className="space-y-3">
      <Cuadre t={t} />
      {t.estado === 'CERRADO' && (
        <p className="text-xs text-stone-600">
          Contado {formatoPesos(t.contado ?? '0')} · Diferencia {formatoPesos(t.diferencia ?? '0')}
          {t.observaciones ? ` · ${t.observaciones}` : ''}
        </p>
      )}
      <Movimientos d={t} onCambio={() => undefined} />
    </div>
  );
}

function Movimientos({
  d,
  onCambio,
  editable,
}: {
  d: DetalleTurno;
  onCambio: () => void;
  editable?: boolean;
}) {
  const [anulando, setAnulando] = useState<{ id: string; motivo: string } | null>(null);
  const anular = useMutation({
    mutationFn: (a: { id: string; motivo: string }) =>
      api(`/caja/movimientos/${a.id}/anular`, { method: 'POST', body: { motivo: a.motivo } }),
    onSuccess: () => {
      setAnulando(null);
      onCambio();
    },
  });
  if (d.recibos.length === 0 && d.movimientos.length === 0)
    return <p className="text-xs text-stone-500">Sin cobros ni movimientos todavía.</p>;
  return (
    <div className="space-y-2 text-sm">
      {anular.isError && <Aviso>{anular.error.message}</Aviso>}
      <ul className="divide-y divide-stone-100">
        {d.recibos.map((r) => (
          <li
            key={r.id}
            className={`flex flex-wrap justify-between gap-2 py-1.5 ${r.anulado ? 'text-stone-400 line-through' : ''}`}
          >
            <span>
              <a
                className="font-medium text-amber-800 hover:underline"
                href={`#/recibo?id=${r.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {r.numero}
              </a>{' '}
              {r.afiliadoNombre} · {r.concepto}
            </span>
            <span className="tabular-nums">{formatoPesos(r.valor)}</span>
          </li>
        ))}
        {d.movimientos.map((m) => (
          <li key={m.id} className={`py-1.5 ${m.anulado ? 'text-stone-400 line-through' : ''}`}>
            <div className="flex flex-wrap justify-between gap-2">
              <span>
                <span className="font-medium">{m.numero}</span>{' '}
                {m.tipo === 'EGRESO' ? 'Egreso' : 'Ingreso'}: {m.concepto}
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">
                  {m.tipo === 'EGRESO' ? '-' : ''}
                  {formatoPesos(m.valor)}
                </span>
                {editable && !m.anulado && (
                  <button
                    type="button"
                    className="text-xs text-red-700 hover:underline"
                    onClick={() => setAnulando({ id: m.id, motivo: '' })}
                  >
                    Anular
                  </button>
                )}
              </span>
            </div>
            {anulando?.id === m.id && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  anular.mutate(anulando);
                }}
              >
                <input
                  autoFocus
                  value={anulando.motivo}
                  onChange={(e) => setAnulando({ id: m.id, motivo: e.target.value })}
                  placeholder="Motivo"
                  className="flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm"
                />
                <Boton type="submit" cargando={anular.isPending}>
                  Anular
                </Boton>
                <Boton type="button" variante="secundario" onClick={() => setAnulando(null)}>
                  Cancelar
                </Boton>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
