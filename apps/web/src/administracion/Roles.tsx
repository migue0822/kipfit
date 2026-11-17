import { CATALOGO_PERMISOS, rolSchema, type Rol } from '@kip/shared';
import { useState, type FormEvent } from 'react';
import { Casilla, EncabezadoPagina, Insignia, Panel, Tabla } from '../componentes';
import { useCambiarEstado, useGuardar } from '../consultas';
import { Aviso, Boton, Campo, erroresDeApi, validar, type Errores } from '../ui';
import { useRoles } from './Usuarios';

const TOTAL_PERMISOS = CATALOGO_PERMISOS.reduce((s, g) => s + g.permisos.length, 0);

export function Roles() {
  const roles = useRoles();
  const [abierto, setAbierto] = useState<Rol | 'nuevo' | null>(null);
  return (
    <>
      <EncabezadoPagina
        titulo="Roles"
        descripcion="Qué puede hacer cada usuario. Los cambios aplican de inmediato a quienes tienen el rol."
        accion={<Boton onClick={() => setAbierto('nuevo')}>Nuevo rol</Boton>}
      />
      {roles.isError && <Aviso>{roles.error.message}</Aviso>}
      <Tabla
        filas={roles.data}
        cargando={roles.isPending}
        onAbrir={(r) => setAbierto(r)}
        vacio="No hay roles."
        columnas={[
          {
            titulo: 'Rol',
            celda: (r) => (
              <>
                <span className="font-medium text-stone-900">{r.nombre}</span>
                {!r.activo && (
                  <>
                    {' '}
                    <Insignia tono="apagado">Inactivo</Insignia>
                  </>
                )}
              </>
            ),
          },
          {
            titulo: 'Permisos',
            clase: 'text-stone-600',
            celda: (r) =>
              r.esAdministrador ? 'Acceso total' : `${r.permisos.length} de ${TOTAL_PERMISOS}`,
          },
          {
            titulo: 'Usuarios activos',
            clase: 'text-right tabular-nums',
            celda: (r) => r.usuarios,
          },
        ]}
      />
      <Panel
        titulo={abierto === 'nuevo' ? 'Nuevo rol' : 'Rol'}
        abierto={abierto !== null}
        onCerrar={() => setAbierto(null)}
        amplio
      >
        {abierto !== null && (
          <RolFormulario
            key={abierto === 'nuevo' ? 'nuevo' : abierto.id}
            rol={abierto === 'nuevo' ? undefined : abierto}
            onListo={() => setAbierto(null)}
          />
        )}
      </Panel>
    </>
  );
}

function RolFormulario({ rol, onListo }: { rol?: Rol; onListo: () => void }) {
  const [nombre, setNombre] = useState(rol?.nombre ?? '');
  const [permisos, setPermisos] = useState<string[]>(rol?.permisos ?? []);
  const [errores, setErrores] = useState<Errores>({});
  const guardar = useGuardar<{ nombre: string; permisos: string[] }, Rol>('roles', rol?.id);
  const estado = useCambiarEstado<Rol>('roles');
  const fijo = rol?.esAdministrador;

  function enviar(e: FormEvent) {
    e.preventDefault();
    const { datos, errores } = validar(rolSchema, { nombre, permisos });
    setErrores(errores);
    if (!datos) return;
    guardar.mutate(datos, { onSuccess: onListo, onError: (err) => setErrores(erroresDeApi(err)) });
  }
  const marcar = (codigo: string, v: boolean) =>
    setPermisos((p) => (v ? [...p, codigo] : p.filter((x) => x !== codigo)));

  if (fijo) {
    return (
      <p className="text-sm text-stone-600">
        El rol <strong>{rol.nombre}</strong> tiene acceso total y no se puede modificar. Lo tienen{' '}
        {rol.usuarios} {rol.usuarios === 1 ? 'usuario' : 'usuarios'}; la empresa siempre conserva al
        menos uno.
      </p>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      {guardar.isError && <Aviso>{guardar.error.message}</Aviso>}
      {estado.isError && <Aviso>{estado.error.message}</Aviso>}
      <Campo
        etiqueta="Nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        error={errores.nombre}
      />
      {errores.permisos && <p className="text-sm text-red-600">{errores.permisos}</p>}
      <div className="grid gap-5 sm:grid-cols-2">
        {CATALOGO_PERMISOS.map((g) => {
          const todos = g.permisos.every((p) => permisos.includes(p.codigo));
          return (
            <fieldset key={g.grupo} className="space-y-2 rounded-lg border border-stone-200 p-3">
              <legend className="flex w-full items-center justify-between gap-2 px-1 text-sm font-medium text-stone-900">
                {g.grupo}
                <button
                  type="button"
                  className="text-xs font-normal text-amber-700 hover:underline"
                  onClick={() =>
                    setPermisos((p) =>
                      todos
                        ? p.filter((x) => !g.permisos.some((q) => q.codigo === x))
                        : [...new Set([...p, ...g.permisos.map((q) => q.codigo)])],
                    )
                  }
                >
                  {todos ? 'Ninguno' : 'Todos'}
                </button>
              </legend>
              {g.permisos.map((p) => (
                <Casilla
                  key={p.codigo}
                  etiqueta={p.nombre}
                  ayuda={p.descripcion}
                  checked={permisos.includes(p.codigo)}
                  onChange={(v) => marcar(p.codigo, v)}
                />
              ))}
            </fieldset>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-stone-200 pt-4">
        {rol ? (
          <Boton
            type="button"
            variante="secundario"
            cargando={estado.isPending}
            onClick={() =>
              estado.mutate({ id: rol.id, activo: !rol.activo }, { onSuccess: onListo })
            }
          >
            {rol.activo ? 'Inactivar' : 'Reactivar'}
          </Boton>
        ) : (
          <span />
        )}
        <Boton type="submit" cargando={guardar.isPending}>
          {rol ? 'Guardar cambios' : 'Crear rol'}
        </Boton>
      </div>
    </form>
  );
}
