import {
  afiliadoSchema,
  ETIQUETA_TIPO_PLAN,
  type AfiliadoDatos,
  type AfiliadoDetalle,
  type AfiliadoEntrada,
  type PlanGimnasio,
  type SuscripcionVista,
} from '@kip/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Insignia } from '../componentes';
import { formatoFecha, formatoPesos } from '../formato';
import { Aviso, Boton, Campo, Selector, erroresDeApi, validar, type Errores } from '../ui';
import { InsigniaEstado, textoSesiones, textoVencimiento } from './comun';

/** Ficha del afiliado: datos, membresía actual y su historial, con las acciones de recepción. */
export function Ficha({ id, puedeEditar }: { id: string; puedeEditar: boolean }) {
  const qc = useQueryClient();
  const a = useQuery({
    queryKey: ['afiliados', 'detalle', id],
    queryFn: () => api<AfiliadoDetalle>(`/afiliados/${id}`),
  });
  const [modo, setModo] = useState<'ver' | 'editar' | 'vender'>('ver');
  const refrescar = () => qc.invalidateQueries({ queryKey: ['afiliados'] });

  const accion = useMutation({
    mutationFn: ({ ruta, body }: { ruta: string; body?: unknown }) =>
      api<AfiliadoDetalle>(`/afiliados/${id}${ruta}`, {
        method: ruta === '/estado' ? 'PATCH' : 'POST',
        body,
      }),
    onSuccess: refrescar,
  });

  if (a.isPending) return <p className="text-sm text-stone-500">Cargando…</p>;
  if (a.isError) return <Aviso>{a.error.message}</Aviso>;
  const d = a.data;

  if (modo === 'editar') {
    return <EditarDatos a={d} onListo={() => setModo('ver')} />;
  }

  return (
    <div className="space-y-5">
      {accion.isError && <Aviso>{accion.error.message}</Aviso>}
      <div>
        <h3 className="text-lg font-semibold text-stone-900">
          {d.nombre} {!d.activo && <Insignia tono="apagado">Inactivo</Insignia>}
        </h3>
        <p className="text-sm text-stone-600">
          Documento {d.documento}
          {d.telefono ? ` · ${d.telefono}` : ''}
        </p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-stone-500">
          {d.fechaNacimiento && (
            <>
              <dt>Nacimiento</dt>
              <dd className="text-stone-700">{formatoFecha(d.fechaNacimiento)}</dd>
            </>
          )}
          <dt>Inscrito en</dt>
          <dd className="text-stone-700">{d.sucursalNombre}</dd>
          {d.referidoPor && (
            <>
              <dt>Referido por</dt>
              <dd className="text-stone-700">{d.referidoPor.nombre}</dd>
            </>
          )}
        </dl>
        {d.notas && (
          <p className="mt-2 rounded bg-stone-50 px-3 py-2 text-sm text-stone-700">{d.notas}</p>
        )}
      </div>

      <div className="rounded-md border border-stone-200 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-stone-700">Membresía</span>
          <InsigniaEstado estado={d.estadoMembresia} />
        </div>
        <p className="mt-1 text-sm text-stone-900">{d.planNombre ?? 'Sin membresía'}</p>
        <p className="text-xs text-stone-500">{textoVencimiento(d)}</p>
        {d.sesionesRestantes !== null && (
          <p className="text-xs text-stone-500">
            Le quedan {d.sesionesRestantes} {d.sesionesRestantes === 1 ? 'sesión' : 'sesiones'}.
          </p>
        )}
      </div>

      {puedeEditar && modo === 'ver' && (
        <div className="flex flex-wrap gap-2">
          {d.activo && <Boton onClick={() => setModo('vender')}>Vender o renovar membresía</Boton>}
          <Boton variante="secundario" onClick={() => setModo('editar')}>
            Editar datos
          </Boton>
          <Boton
            variante="secundario"
            cargando={accion.isPending}
            onClick={() => accion.mutate({ ruta: '/estado', body: { activo: !d.activo } })}
          >
            {d.activo ? 'Inactivar' : 'Reactivar'}
          </Boton>
        </div>
      )}
      {modo === 'vender' && (
        <Vender
          afiliadoId={id}
          onCancelar={() => setModo('ver')}
          onListo={() => {
            setModo('ver');
            void refrescar();
          }}
        />
      )}

      <div>
        <h4 className="mb-2 text-sm font-medium text-stone-700">Historial de membresías</h4>
        {d.suscripciones.length === 0 ? (
          <p className="text-sm text-stone-500">Todavía no tiene membresías.</p>
        ) : (
          <ul className="divide-y divide-stone-100 rounded-md border border-stone-200">
            {d.suscripciones.map((s) => (
              <FilaMembresia
                key={s.id}
                s={s}
                puedeEditar={puedeEditar}
                cargando={accion.isPending}
                onAccion={(ruta, body) =>
                  accion.mutate({ ruta: `/membresias/${s.id}/${ruta}`, body })
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilaMembresia({
  s,
  puedeEditar,
  cargando,
  onAccion,
}: {
  s: SuscripcionVista;
  puedeEditar: boolean;
  cargando: boolean;
  onAccion: (ruta: string, body?: unknown) => void;
}) {
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const anulada = s.estado === 'ANULADA';
  return (
    <li className={`px-4 py-3 text-sm ${anulada ? 'bg-stone-50 text-stone-400' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className={`font-medium ${anulada ? 'line-through' : 'text-stone-900'}`}>
            {s.planNombre}
          </span>{' '}
          <span className="text-xs">({ETIQUETA_TIPO_PLAN[s.tipo]})</span>
          {anulada && <Insignia tono="peligro">Anulada</Insignia>}
          {s.congeladaDesde && <Insignia tono="neutro">Congelada</Insignia>}
        </div>
        <span className="text-xs">{formatoPesos(s.precio)}</span>
      </div>
      <p className="text-xs">
        {formatoFecha(s.fechaInicio)} – {formatoFecha(s.fechaFin)}
        {s.sesionesTotal !== null ? ` · ${textoSesiones(s)}` : ''}
        {s.diasCongelados > 0 ? ` · ${s.diasCongelados} días congelados` : ''}
      </p>
      {anulada && s.motivoAnulacion && <p className="text-xs">Motivo: {s.motivoAnulacion}</p>}
      {puedeEditar && !anulada && !anulando && (
        <div className="mt-2 flex gap-2">
          {s.congeladaDesde ? (
            <Boton
              variante="secundario"
              cargando={cargando}
              onClick={() => onAccion('descongelar')}
            >
              Descongelar
            </Boton>
          ) : (
            <Boton variante="secundario" cargando={cargando} onClick={() => onAccion('congelar')}>
              Congelar
            </Boton>
          )}
          <Boton variante="secundario" onClick={() => setAnulando(true)}>
            Anular
          </Boton>
        </div>
      )}
      {anulando && (
        <div className="mt-2 space-y-2">
          <Campo
            etiqueta="Motivo de la anulación"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={() => setAnulando(false)}>
              Cancelar
            </Boton>
            <Boton
              cargando={cargando}
              disabled={motivo.trim().length < 3}
              onClick={() => onAccion('anular', { motivo })}
            >
              Anular membresía
            </Boton>
          </div>
        </div>
      )}
    </li>
  );
}

function Vender({
  afiliadoId,
  onListo,
  onCancelar,
}: {
  afiliadoId: string;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const planes = useQuery({ queryKey: ['planes'], queryFn: () => api<PlanGimnasio[]>('/planes') });
  const [planId, setPlanId] = useState('');
  const vender = useMutation({
    mutationFn: () =>
      api<AfiliadoDetalle>(`/afiliados/${afiliadoId}/membresias`, {
        method: 'POST',
        body: { planId },
      }),
    onSuccess: onListo,
  });
  const activos = (planes.data ?? []).filter((p) => p.activo);
  return (
    <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-4">
      {vender.isError && <Aviso>{vender.error.message}</Aviso>}
      <Selector etiqueta="Plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
        <option value="">Seleccione el plan</option>
        {activos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre} · {formatoPesos(p.precio)}
          </option>
        ))}
      </Selector>
      <p className="text-xs text-stone-500">
        Empieza hoy, o el día siguiente al vencimiento si todavía tiene membresía vigente. El cobro
        llega con el módulo de caja.
      </p>
      <div className="flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton cargando={vender.isPending} disabled={!planId} onClick={() => vender.mutate()}>
          Registrar membresía
        </Boton>
      </div>
    </div>
  );
}

function EditarDatos({ a, onListo }: { a: AfiliadoDetalle; onListo: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<AfiliadoEntrada>({
    documento: a.documento,
    nombre: a.nombre,
    telefono: a.telefono ?? '',
    fechaNacimiento: a.fechaNacimiento ?? '',
    notas: a.notas ?? '',
    referidoPorId: a.referidoPor?.id ?? '',
  });
  const [errores, setErrores] = useState<Errores>({});
  const guardar = useMutation({
    mutationFn: (d: AfiliadoEntrada) =>
      api<AfiliadoDetalle>(`/afiliados/${a.id}`, { method: 'PUT', body: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['afiliados'] }),
  });
  function enviar(e: FormEvent) {
    e.preventDefault();
    const { datos, errores } = validar<AfiliadoDatos>(afiliadoSchema, f);
    setErrores(errores);
    if (!datos) return;
    guardar.mutate(f, { onSuccess: onListo, onError: (err) => setErrores(erroresDeApi(err)) });
  }
  const campo = (k: 'documento' | 'nombre' | 'telefono' | 'fechaNacimiento' | 'notas') => ({
    value: (f[k] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
    error: errores[k],
  });
  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      {guardar.isError && <Aviso>{guardar.error.message}</Aviso>}
      <Campo etiqueta="Documento" {...campo('documento')} />
      <Campo etiqueta="Nombre completo" {...campo('nombre')} />
      <Campo etiqueta="Celular" inputMode="tel" {...campo('telefono')} />
      <Campo etiqueta="Fecha de nacimiento" type="date" {...campo('fechaNacimiento')} />
      <Campo etiqueta="Notas" {...campo('notas')} />
      <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
        <Boton type="button" variante="secundario" onClick={onListo}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={guardar.isPending}>
          Guardar cambios
        </Boton>
      </div>
    </form>
  );
}
