import {
  afiliadoNuevoSchema,
  PERMISOS,
  tienePermiso,
  type AfiliadoDetalle,
  type AfiliadoNuevoEntrada,
  type AfiliadoResumen,
  type FiltroMembresia,
  type Paginado,
  type Perfil,
  type PlanGimnasio,
} from '@kip/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Avatar } from './Foto';
import {
  CajaBusqueda,
  Casilla,
  EncabezadoPagina,
  Insignia,
  Paginacion,
  Panel,
  Segmentos,
  Tabla,
  useRetardado,
} from '../componentes';
import { useGuardar, useListado } from '../consultas';
import { formatoPesos } from '../formato';
import { Aviso, Boton, Campo, Selector, erroresDeApi, validar, type Errores } from '../ui';
import { InsigniaEstado, textoSesiones, textoVencimiento } from './comun';
import { Ficha } from './Ficha';

const FILTROS: { valor: FiltroMembresia; texto: string }[] = [
  { valor: 'todas', texto: 'Todos' },
  { valor: 'vigentes', texto: 'Vigentes' },
  { valor: 'por_vencer', texto: 'Por vencer' },
  { valor: 'vencidas', texto: 'Vencidos' },
  { valor: 'sin', texto: 'Sin membresía' },
];

export function Afiliados({ perfil }: { perfil: Perfil }) {
  const puedeEditar = tienePermiso(perfil.permisos, PERMISOS.AFILIADOS_EDITAR);
  const [buscar, setBuscar] = useState('');
  const [membresia, setMembresia] = useState<FiltroMembresia>('todas');
  const [inactivos, setInactivos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [abierto, setAbierto] = useState<string | 'nuevo' | null>(null);
  const q = useRetardado(buscar);
  const lista = useListado<Paginado<AfiliadoResumen>>('afiliados', {
    buscar: q,
    membresia,
    estado: inactivos ? 'todos' : 'activos',
    pagina,
    porPagina: 25,
  });
  const cambiar =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPagina(1);
    };

  return (
    <>
      <EncabezadoPagina
        titulo="Afiliados"
        descripcion="Busque por nombre, documento o teléfono. La membresía sirve en todas las sucursales."
        accion={puedeEditar && <Boton onClick={() => setAbierto('nuevo')}>Nuevo afiliado</Boton>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <CajaBusqueda
          valor={buscar}
          onCambio={cambiar(setBuscar)}
          placeholder="Nombre, documento o teléfono"
        />
        <Segmentos
          etiqueta="Estado de la membresía"
          opciones={FILTROS}
          valor={membresia}
          onCambio={cambiar(setMembresia)}
        />
        <Casilla etiqueta="Ver inactivos" checked={inactivos} onChange={cambiar(setInactivos)} />
      </div>
      {lista.isError && <Aviso>{lista.error.message}</Aviso>}
      <Tabla
        filas={lista.data?.datos}
        cargando={lista.isPending}
        onAbrir={(a) => setAbierto(a.id)}
        vacio="No hay afiliados con esos filtros."
        columnas={[
          {
            titulo: 'Afiliado',
            celda: (a) => (
              <span className="flex items-center gap-3">
                <Avatar afiliadoId={a.id} nombre={a.nombre} version={a.fotoVersion} />
                <span className="min-w-0">
                  <span className="font-medium text-stone-900">{a.nombre}</span>
                  {!a.activo && (
                    <>
                      {' '}
                      <Insignia tono="apagado">Inactivo</Insignia>
                    </>
                  )}
                  <span className="block text-xs text-stone-500">
                    {a.documento}
                    {a.telefono ? ` · ${a.telefono}` : ''}
                  </span>
                </span>
              </span>
            ),
          },
          {
            titulo: 'Plan',
            clase: 'hidden text-stone-600 md:table-cell',
            celda: (a) => a.planNombre ?? '',
          },
          {
            titulo: 'Vencimiento',
            clase: 'hidden text-xs text-stone-600 lg:table-cell',
            celda: (a) =>
              textoVencimiento(a) || textoSesiones({ sesionesTotal: null, sesionesUsadas: 0 }),
          },
          { titulo: 'Estado', celda: (a) => <InsigniaEstado estado={a.estadoMembresia} /> },
        ]}
      />
      {lista.data && (
        <Paginacion
          pagina={lista.data.pagina}
          porPagina={lista.data.porPagina}
          total={lista.data.total}
          onCambio={setPagina}
        />
      )}
      <Panel
        amplio
        titulo={abierto === 'nuevo' ? 'Nuevo afiliado' : 'Afiliado'}
        abierto={abierto !== null}
        onCerrar={() => setAbierto(null)}
      >
        {abierto === 'nuevo' && (
          <NuevoAfiliado onCreado={(a) => setAbierto(a.id)} onCancelar={() => setAbierto(null)} />
        )}
        {abierto !== null && abierto !== 'nuevo' && (
          <Ficha key={abierto} id={abierto} puedeEditar={puedeEditar} />
        )}
      </Panel>
    </>
  );
}

function NuevoAfiliado({
  onCreado,
  onCancelar,
}: {
  onCreado: (a: AfiliadoDetalle) => void;
  onCancelar: () => void;
}) {
  const planes = useQuery({ queryKey: ['planes'], queryFn: () => api<PlanGimnasio[]>('/planes') });
  const [f, setF] = useState<AfiliadoNuevoEntrada>({
    documento: '',
    nombre: '',
    telefono: '',
    fechaNacimiento: '',
    notas: '',
    planId: '',
  });
  const [errores, setErrores] = useState<Errores>({});
  const guardar = useGuardar<AfiliadoNuevoEntrada, AfiliadoDetalle>('afiliados');

  function enviar(e: FormEvent) {
    e.preventDefault();
    const { datos, errores } = validar(afiliadoNuevoSchema, f);
    setErrores(errores);
    if (!datos) return;
    guardar.mutate(f, { onSuccess: onCreado, onError: (err) => setErrores(erroresDeApi(err)) });
  }
  const campo = (k: 'documento' | 'nombre' | 'telefono' | 'fechaNacimiento' | 'notas') => ({
    value: (f[k] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
    error: errores[k],
  });
  const activos = (planes.data ?? []).filter((p) => p.activo);

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      {guardar.isError && <Aviso>{guardar.error.message}</Aviso>}
      <Campo etiqueta="Documento" inputMode="text" autoFocus {...campo('documento')} />
      <Campo etiqueta="Nombre completo" {...campo('nombre')} />
      <Campo etiqueta="Celular" inputMode="tel" {...campo('telefono')} />
      <Campo etiqueta="Fecha de nacimiento" type="date" {...campo('fechaNacimiento')} />
      <Campo etiqueta="Notas" {...campo('notas')} />
      <Selector
        etiqueta="Membresía inicial (opcional)"
        value={String(f.planId ?? '')}
        error={errores.planId}
        onChange={(e) => setF({ ...f, planId: e.target.value })}
      >
        <option value="">Sin membresía por ahora</option>
        {activos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre} · {formatoPesos(p.precio)}
          </option>
        ))}
      </Selector>
      <p className="text-xs text-stone-500">
        El cobro de la membresía llega con el módulo de caja: por ahora queda registrada con el
        precio del plan.
      </p>
      <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
        <Boton type="button" variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={guardar.isPending}>
          Crear afiliado
        </Boton>
      </div>
    </form>
  );
}
