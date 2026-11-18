import {
  ETIQUETA_TIPO_PLAN,
  planGimnasioSchema,
  TIPOS_PLAN,
  type PlanGimnasio,
  type PlanGimnasioEntrada,
} from '@kip/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { EncabezadoPagina, Insignia, Panel, Tabla } from '../componentes';
import { useCambiarEstado, useGuardar } from '../consultas';
import { conMiles, decimalParaCampo, formatoPesos } from '../formato';
import { Aviso, Boton, Campo, Selector, erroresDeApi, validar, type Errores } from '../ui';

export function Planes({ puedeEditar }: { puedeEditar: boolean }) {
  const planes = useQuery({ queryKey: ['planes'], queryFn: () => api<PlanGimnasio[]>('/planes') });
  const [abierto, setAbierto] = useState<PlanGimnasio | 'nuevo' | null>(null);
  return (
    <>
      <EncabezadoPagina
        titulo="Planes"
        descripcion="Lo que se vende al afiliado. Cambiar un plan no modifica las membresías ya vendidas."
        accion={puedeEditar && <Boton onClick={() => setAbierto('nuevo')}>Nuevo plan</Boton>}
      />
      {planes.isError && <Aviso>{planes.error.message}</Aviso>}
      <Tabla
        filas={planes.data}
        cargando={planes.isPending}
        onAbrir={puedeEditar ? (p) => setAbierto(p) : undefined}
        vacio="Aún no hay planes. Cree el primero (por ejemplo, Mensual por 30 días)."
        columnas={[
          {
            titulo: 'Plan',
            celda: (p) => (
              <>
                <span className="font-medium text-stone-900">{p.nombre}</span>
                {!p.activo && (
                  <>
                    {' '}
                    <Insignia tono="apagado">Inactivo</Insignia>
                  </>
                )}
              </>
            ),
          },
          {
            titulo: 'Tipo',
            clase: 'hidden text-stone-600 sm:table-cell',
            celda: (p) => ETIQUETA_TIPO_PLAN[p.tipo],
          },
          {
            titulo: 'Duración',
            celda: (p) =>
              p.tipo === 'TIQUETERA'
                ? `${p.sesiones} sesiones en ${p.dias} días`
                : `${p.dias} días`,
          },
          { titulo: 'Precio', clase: 'text-right', celda: (p) => formatoPesos(p.precio) },
        ]}
      />
      <Panel
        titulo={abierto === 'nuevo' ? 'Nuevo plan' : 'Plan'}
        abierto={abierto !== null}
        onCerrar={() => setAbierto(null)}
      >
        {abierto !== null && (
          <PlanFormulario
            key={abierto === 'nuevo' ? 'nuevo' : abierto.id}
            plan={abierto === 'nuevo' ? undefined : abierto}
            onListo={() => setAbierto(null)}
          />
        )}
      </Panel>
    </>
  );
}

function PlanFormulario({ plan: p, onListo }: { plan?: PlanGimnasio; onListo: () => void }) {
  const [f, setF] = useState<PlanGimnasioEntrada>({
    nombre: p?.nombre ?? '',
    tipo: p?.tipo ?? 'MENSUAL',
    precio: p ? decimalParaCampo(p.precio) : '',
    dias: p?.dias ?? 30,
    sesiones: p?.sesiones ?? undefined,
  });
  const [errores, setErrores] = useState<Errores>({});
  const guardar = useGuardar<PlanGimnasioEntrada, PlanGimnasio>('planes', p?.id);
  const estado = useCambiarEstado<PlanGimnasio>('planes');

  function enviar(e: FormEvent) {
    e.preventDefault();
    const { datos, errores } = validar(planGimnasioSchema, f);
    setErrores(errores);
    if (!datos) return;
    guardar.mutate(f, { onSuccess: onListo, onError: (err) => setErrores(erroresDeApi(err)) });
  }
  const texto = (k: 'nombre' | 'dias' | 'sesiones') => ({
    value: String(f[k] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
    error: errores[k],
  });

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      {guardar.isError && <Aviso>{guardar.error.message}</Aviso>}
      {estado.isError && <Aviso>{estado.error.message}</Aviso>}
      <Campo etiqueta="Nombre del plan" {...texto('nombre')} />
      <Selector
        etiqueta="Tipo"
        value={f.tipo}
        error={errores.tipo}
        onChange={(e) => setF({ ...f, tipo: e.target.value as PlanGimnasioEntrada['tipo'] })}
      >
        {TIPOS_PLAN.map((t) => (
          <option key={t} value={t}>
            {ETIQUETA_TIPO_PLAN[t]}
          </option>
        ))}
      </Selector>
      <Campo
        etiqueta="Precio"
        inputMode="decimal"
        value={String(f.precio ?? '')}
        onChange={(e) => setF({ ...f, precio: conMiles(e.target.value) })}
        error={errores.precio}
        ayuda="En pesos. Es lo que se le cobra al afiliado."
      />
      <Campo
        etiqueta={
          f.tipo === 'TIQUETERA' ? 'Plazo para usar las sesiones (días)' : 'Duración (días)'
        }
        inputMode="numeric"
        {...texto('dias')}
        ayuda={
          f.tipo === 'MENSUAL'
            ? 'El día de inicio cuenta: 30 días desde el 1 de noviembre terminan el 30.'
            : undefined
        }
      />
      {f.tipo === 'TIQUETERA' && (
        <Campo etiqueta="Número de sesiones" inputMode="numeric" {...texto('sesiones')} />
      )}
      <div className="flex flex-wrap justify-between gap-2 border-t border-stone-200 pt-4">
        {p ? (
          <Boton
            type="button"
            variante="secundario"
            cargando={estado.isPending}
            onClick={() => estado.mutate({ id: p.id, activo: !p.activo }, { onSuccess: onListo })}
          >
            {p.activo ? 'Inactivar' : 'Reactivar'}
          </Boton>
        ) : (
          <span />
        )}
        <Boton type="submit" cargando={guardar.isPending}>
          {p ? 'Guardar cambios' : 'Crear plan'}
        </Boton>
      </div>
    </form>
  );
}
