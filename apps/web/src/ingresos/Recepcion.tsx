import { type IngresoVista, type ResumenIngresos } from '@kip/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Avatar } from '../afiliados/Foto';
import { api } from '../api';
import { Aviso, Boton, Campo } from '../ui';
import { InsigniaResultado, hora, pitar, textoMensaje, useEventosIngreso } from './comun';

/** Ingresos del día en tiempo real: lo que digitan en la tablet aparece aquí al instante, con aviso si hay alerta. */
export function Recepcion() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['ingresos', 'hoy'],
    queryFn: () => api<ResumenIngresos>('/ingresos'),
    refetchInterval: 60_000,
  });
  const [nuevos, setNuevos] = useState<Set<string>>(new Set());
  const recargar = () => qc.invalidateQueries({ queryKey: ['ingresos'] });

  useEventosIngreso((tipo, i) => {
    if (tipo === 'ingreso') {
      pitar(i.resultado === 'ALERTA');
      setNuevos((s) => new Set(s).add(i.id));
      window.setTimeout(
        () =>
          setNuevos((s) => {
            const n = new Set(s);
            n.delete(i.id);
            return n;
          }),
        8000,
      );
    }
    void recargar();
  }, recargar);

  const [documento, setDocumento] = useState('');
  const registrar = useMutation({
    mutationFn: () =>
      api<IngresoVista>('/ingresos', {
        method: 'POST',
        body: { documento, origen: 'RECEPCION' },
      }),
    onSuccess: () => {
      setDocumento('');
      void recargar();
    },
  });
  const revisar = useMutation({
    mutationFn: (id: string) => api<IngresoVista>(`/ingresos/${id}/revisar`, { method: 'PATCH' }),
    onSuccess: () => void recargar(),
  });
  const anular = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api<IngresoVista>(`/ingresos/${id}/anular`, { method: 'POST', body: { motivo } }),
    onSuccess: () => {
      setAnulando(null);
      void recargar();
    },
  });
  const [anulando, setAnulando] = useState<{ id: string; motivo: string } | null>(null);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (documento.trim().length >= 3) registrar.mutate();
  };

  const d = q.data;
  return (
    <>
      <h1 className="font-['Literata',Georgia,serif] text-2xl font-semibold text-stone-900">
        Ingresos de hoy
      </h1>
      <p className="mt-1 text-sm text-stone-600">
        Se actualiza solo: cuando alguien digite su documento en la tablet aparece aquí.
      </p>

      {d && (
        <div className="mt-4 grid max-w-xl grid-cols-3 gap-3 text-center">
          <Cifra titulo="Ingresos" valor={d.total} />
          <Cifra titulo="Con alerta" valor={d.alertas} />
          <Cifra titulo="Por revisar" valor={d.pendientes} alerta={d.pendientes > 0} />
        </div>
      )}

      <form onSubmit={enviar} className="mt-5 flex max-w-xl items-end gap-3">
        <div className="flex-1">
          <Campo
            etiqueta="Registrar un ingreso desde recepción"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            inputMode="numeric"
            placeholder="Documento del afiliado"
          />
        </div>
        <Boton type="submit" cargando={registrar.isPending}>
          Registrar
        </Boton>
      </form>
      {registrar.isError && (
        <div className="mt-2 max-w-xl">
          <Aviso>{registrar.error.message}</Aviso>
        </div>
      )}
      {registrar.isSuccess && registrar.data.resultado === 'ALERTA' && (
        <p className="mt-2 max-w-xl rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {registrar.data.afiliadoNombre}: {textoMensaje(registrar.data)}
        </p>
      )}
      {(revisar.isError || anular.isError) && (
        <div className="mt-2 max-w-xl">
          <Aviso>{(revisar.error ?? anular.error)?.message ?? ''}</Aviso>
        </div>
      )}

      <div className="mt-6">
        {q.isPending && <p className="text-sm text-stone-500">Cargando…</p>}
        {q.isError && <Aviso>{q.error.message}</Aviso>}
        {d && d.ingresos.length === 0 && (
          <p className="text-sm text-stone-500">Todavía no hay ingresos hoy.</p>
        )}
        {d && d.ingresos.length > 0 && (
          <ul className="divide-y divide-stone-100 rounded-md border border-stone-200 bg-white">
            {d.ingresos.map((i) => (
              <li
                key={i.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${
                  nuevos.has(i.id) ? 'bg-amber-50' : ''
                } ${i.anulado ? 'opacity-60' : ''}`}
              >
                <span className="w-14 text-sm tabular-nums text-stone-500">
                  {hora(i.fechaHora)}
                </span>
                <Avatar
                  afiliadoId={i.afiliadoId}
                  nombre={i.afiliadoNombre}
                  version={i.fotoVersion}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-stone-900">
                    {i.afiliadoNombre}{' '}
                    <span className="text-sm font-normal text-stone-500">{i.documento}</span>
                  </p>
                  <p className="text-xs text-stone-500">
                    {i.planNombre ?? 'Sin membresía'}
                    {i.sesionesRestantes !== null ? ` · ${i.sesionesRestantes} sesiones` : ''}
                    {i.origen === 'TABLET' ? ' · tablet' : ' · recepción'}
                    {i.resultado === 'ALERTA' && !i.anulado ? ` · ${textoMensaje(i)}` : ''}
                    {i.motivoAnulacion ? ` · Anulado: ${i.motivoAnulacion}` : ''}
                  </p>
                </div>
                <span className="flex items-center gap-2">
                  <InsigniaResultado i={i} />
                </span>
                {!i.anulado && (
                  <span className="flex gap-2">
                    {i.alertaPendiente && (
                      <Boton
                        variante="secundario"
                        onClick={() => revisar.mutate(i.id)}
                        disabled={revisar.isPending}
                      >
                        Aceptar
                      </Boton>
                    )}
                    <Boton
                      variante="secundario"
                      onClick={() => setAnulando({ id: i.id, motivo: '' })}
                    >
                      Anular
                    </Boton>
                  </span>
                )}
                {anulando?.id === i.id && (
                  <form
                    className="flex w-full gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      anular.mutate(anulando);
                    }}
                  >
                    <input
                      autoFocus
                      value={anulando.motivo}
                      onChange={(e) => setAnulando({ id: i.id, motivo: e.target.value })}
                      placeholder="Motivo de la anulación"
                      className="flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm"
                    />
                    <Boton type="submit" cargando={anular.isPending}>
                      Confirmar
                    </Boton>
                    <Boton type="button" variante="secundario" onClick={() => setAnulando(null)}>
                      Cancelar
                    </Boton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Cifra({ titulo, valor, alerta }: { titulo: string; valor: number; alerta?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 ${alerta ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-white'}`}
    >
      <p className="text-2xl font-semibold tabular-nums text-stone-900">{valor}</p>
      <p className="text-xs text-stone-500">{titulo}</p>
    </div>
  );
}
