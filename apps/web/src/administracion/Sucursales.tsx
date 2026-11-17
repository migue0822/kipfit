import { sucursalSchema, type Sucursal, type SucursalEntrada } from '@kip/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { EncabezadoPagina, Insignia, Panel, Tabla } from '../componentes';
import { useCambiarEstado, useGuardar } from '../consultas';
import { Aviso, Boton, Campo, erroresDeApi, validar, type Errores } from '../ui';

export function Sucursales() {
  const sucursales = useQuery({
    queryKey: ['sucursales'],
    queryFn: () => api<Sucursal[]>('/sucursales'),
  });
  const [abierta, setAbierta] = useState<Sucursal | 'nueva' | null>(null);
  const siguiente = String(
    Math.max(0, ...(sucursales.data ?? []).map((s) => Number(s.codigo) || 0)) + 1,
  ).padStart(2, '0');
  return (
    <>
      <EncabezadoPagina
        titulo="Sucursales"
        descripcion="Cada sucursal tiene su inventario, su caja y su propia numeración de documentos (VT02, CJ02…)."
        accion={<Boton onClick={() => setAbierta('nueva')}>Nueva sucursal</Boton>}
      />
      {sucursales.isError && <Aviso>{sucursales.error.message}</Aviso>}
      <Tabla
        filas={sucursales.data}
        cargando={sucursales.isPending}
        onAbrir={(s) => setAbierta(s)}
        vacio="No hay sucursales."
        columnas={[
          { titulo: 'Código', clase: 'font-mono text-xs', celda: (s) => s.codigo },
          {
            titulo: 'Nombre',
            celda: (s) => (
              <>
                <span className="font-medium text-stone-900">{s.nombre}</span>
                {!s.activa && (
                  <>
                    {' '}
                    <Insignia tono="apagado">Inactiva</Insignia>
                  </>
                )}
                {s.direccion && <span className="block text-xs text-stone-500">{s.direccion}</span>}
              </>
            ),
          },
          {
            titulo: 'Teléfono',
            clase: 'hidden text-stone-600 sm:table-cell',
            celda: (s) => s.telefono ?? '',
          },
        ]}
      />
      <Panel
        titulo={abierta === 'nueva' ? 'Nueva sucursal' : 'Sucursal'}
        abierto={abierta !== null}
        onCerrar={() => setAbierta(null)}
      >
        {abierta !== null && (
          <SucursalFormulario
            key={abierta === 'nueva' ? 'nueva' : abierta.id}
            sucursal={abierta === 'nueva' ? undefined : abierta}
            codigoSugerido={siguiente}
            onListo={() => setAbierta(null)}
          />
        )}
      </Panel>
    </>
  );
}

function SucursalFormulario({
  sucursal: s,
  codigoSugerido,
  onListo,
}: {
  sucursal?: Sucursal;
  codigoSugerido: string;
  onListo: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<SucursalEntrada>({
    codigo: s?.codigo ?? codigoSugerido,
    nombre: s?.nombre ?? '',
    direccion: s?.direccion ?? '',
    telefono: s?.telefono ?? '',
  });
  const [errores, setErrores] = useState<Errores>({});
  const guardar = useGuardar<SucursalEntrada, Sucursal>('sucursales', s?.id);
  const estado = useCambiarEstado<Sucursal>('sucursales');
  // El selector de sucursal de la barra superior sale del perfil.
  const listo = () => {
    void qc.invalidateQueries({ queryKey: ['perfil'] });
    onListo();
  };

  function enviar(e: FormEvent) {
    e.preventDefault();
    const { datos, errores } = validar(sucursalSchema, f);
    setErrores(errores);
    if (!datos) return;
    guardar.mutate(f, { onSuccess: listo, onError: (err) => setErrores(erroresDeApi(err)) });
  }
  const campo = (k: keyof SucursalEntrada) => ({
    value: (f[k] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
    error: errores[k],
  });

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      {guardar.isError && <Aviso>{guardar.error.message}</Aviso>}
      {estado.isError && <Aviso>{estado.error.message}</Aviso>}
      <Campo
        etiqueta="Código"
        inputMode="numeric"
        maxLength={2}
        disabled={Boolean(s)}
        ayuda={
          s
            ? 'No se cambia: hace parte de la numeración de los documentos.'
            : 'Dos dígitos. Va en los prefijos: VT' + f.codigo + ', CJ' + f.codigo + '…'
        }
        {...campo('codigo')}
      />
      <Campo etiqueta="Nombre" {...campo('nombre')} />
      <Campo etiqueta="Dirección" {...campo('direccion')} ayuda="Sale en los impresos." />
      <Campo etiqueta="Teléfono" {...campo('telefono')} />
      {!s && <p className="text-sm text-stone-500">Se crea con sus numeraciones.</p>}
      <div className="flex flex-wrap justify-between gap-2 border-t border-stone-200 pt-4">
        {s ? (
          <Boton
            type="button"
            variante="secundario"
            cargando={estado.isPending}
            onClick={() => estado.mutate({ id: s.id, activo: !s.activa }, { onSuccess: listo })}
          >
            {s.activa ? 'Inactivar' : 'Reactivar'}
          </Boton>
        ) : (
          <span />
        )}
        <Boton type="submit" cargando={guardar.isPending}>
          {s ? 'Guardar cambios' : 'Crear sucursal'}
        </Boton>
      </div>
    </form>
  );
}
