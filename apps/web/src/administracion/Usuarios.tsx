import {
  usuarioNuevoSchema,
  type Perfil,
  type Rol,
  type UsuarioCreado,
  type UsuarioEmpresa,
} from '@kip/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Casilla, EncabezadoPagina, Insignia, Panel, Tabla } from '../componentes';
import { useCambiarEstado, useGuardar } from '../consultas';
import { Aviso, Boton, Campo, erroresDeApi, Selector, validar, type Errores } from '../ui';

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api<Rol[]>('/roles') });
}

/** Sucursales activas de la empresa (para asignarlas a usuarios). */
function useSucursalesEmpresa(perfil: Perfil) {
  return perfil.empresas.find((e) => e.id === perfil.empresa?.id)?.sucursales ?? [];
}

export function Usuarios({ perfil }: { perfil: Perfil }) {
  const usuarios = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api<UsuarioEmpresa[]>('/usuarios'),
  });
  const [abierto, setAbierto] = useState<UsuarioEmpresa | 'nuevo' | null>(null);
  const [creado, setCreado] = useState<UsuarioCreado | null>(null);

  return (
    <>
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion="Quién entra a la empresa, con qué rol y en qué sucursales. Los usuarios no se borran: se inactivan."
        accion={<Boton onClick={() => setAbierto('nuevo')}>Nuevo usuario</Boton>}
      />
      {creado && (
        <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {creado.nombre} ya puede entrar con {creado.email}
          {creado.cuentaExistente
            ? ' y la contraseña que ya usaba en su otra empresa.'
            : ' y la contraseña inicial que usted le asignó. Pídale que la cambie en Mi cuenta.'}
        </p>
      )}
      {usuarios.isError && <Aviso>{usuarios.error.message}</Aviso>}
      <Tabla
        filas={usuarios.data}
        cargando={usuarios.isPending}
        onAbrir={(u) => setAbierto(u)}
        vacio="No hay usuarios."
        columnas={[
          {
            titulo: 'Usuario',
            celda: (u) => (
              <>
                <span className="font-medium text-stone-900">{u.nombre}</span>
                {u.esUsted && (
                  <>
                    {' '}
                    <Insignia tono="acento">Usted</Insignia>
                  </>
                )}
                {!u.activo && (
                  <>
                    {' '}
                    <Insignia tono="apagado">Inactivo</Insignia>
                  </>
                )}
                <span className="block text-xs text-stone-500">{u.email}</span>
              </>
            ),
          },
          { titulo: 'Rol', celda: (u) => u.rol.nombre },
          {
            titulo: 'Sucursales',
            clase: 'text-stone-600',
            celda: (u) =>
              u.sucursales.length ? u.sucursales.map((s) => s.nombre).join(', ') : 'Todas',
          },
        ]}
      />
      <Panel
        titulo={abierto === 'nuevo' ? 'Nuevo usuario' : 'Usuario'}
        abierto={abierto !== null}
        onCerrar={() => setAbierto(null)}
      >
        {abierto === 'nuevo' && (
          <UsuarioNuevo
            perfil={perfil}
            onListo={(u) => {
              setCreado(u);
              setAbierto(null);
            }}
          />
        )}
        {abierto && abierto !== 'nuevo' && (
          <UsuarioEdicion
            key={abierto.id}
            perfil={perfil}
            usuario={abierto}
            onListo={() => setAbierto(null)}
          />
        )}
      </Panel>
    </>
  );
}

/** Rol y sucursales; vacío = todas las sucursales. */
function Acceso({
  perfil,
  rolId,
  sucursalIds,
  onRol,
  onSucursales,
  errores,
  deshabilitado,
}: {
  perfil: Perfil;
  rolId: string;
  sucursalIds: string[];
  onRol: (id: string) => void;
  onSucursales: (ids: string[]) => void;
  errores: Errores;
  deshabilitado?: boolean;
}) {
  const roles = useRoles();
  const sucursales = useSucursalesEmpresa(perfil);
  const todas = sucursalIds.length === 0;
  return (
    <>
      <Selector
        etiqueta="Rol"
        value={rolId}
        onChange={(e) => onRol(e.target.value)}
        error={errores.rolId}
        disabled={deshabilitado}
      >
        <option value="">Seleccione…</option>
        {roles.data
          ?.filter((r) => r.activo || r.id === rolId)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
      </Selector>
      <fieldset className="space-y-2" disabled={deshabilitado}>
        <legend className="text-sm font-medium text-stone-700">Sucursales</legend>
        <Casilla
          etiqueta="Todas las sucursales"
          ayuda="Incluye las que se creen más adelante."
          checked={todas}
          disabled={deshabilitado}
          onChange={(v) => onSucursales(v ? [] : sucursales.slice(0, 1).map((s) => s.id))}
        />
        {!todas && (
          <div className="ml-6 space-y-1">
            {sucursales.map((s) => (
              <Casilla
                key={s.id}
                etiqueta={s.nombre}
                checked={sucursalIds.includes(s.id)}
                disabled={deshabilitado}
                onChange={(v) =>
                  onSucursales(v ? [...sucursalIds, s.id] : sucursalIds.filter((x) => x !== s.id))
                }
              />
            ))}
            {sucursalIds.length === 0 && (
              <p className="text-xs text-red-600">Marque al menos una</p>
            )}
          </div>
        )}
      </fieldset>
    </>
  );
}

function UsuarioNuevo({
  perfil,
  onListo,
}: {
  perfil: Perfil;
  onListo: (u: UsuarioCreado) => void;
}) {
  const [f, setF] = useState({
    nombre: '',
    email: '',
    password: '',
    rolId: '',
    sucursalIds: [] as string[],
  });
  const [errores, setErrores] = useState<Errores>({});
  const guardar = useGuardar<typeof f, UsuarioCreado>('usuarios');

  function enviar(e: FormEvent) {
    e.preventDefault();
    const { datos, errores } = validar(usuarioNuevoSchema, f);
    setErrores(errores);
    if (!datos) return;
    guardar.mutate(f, { onSuccess: onListo, onError: (err) => setErrores(erroresDeApi(err)) });
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      {guardar.isError && <Aviso>{guardar.error.message}</Aviso>}
      <Campo
        etiqueta="Nombre"
        value={f.nombre}
        onChange={(e) => setF({ ...f, nombre: e.target.value })}
        error={errores.nombre}
      />
      <Campo
        etiqueta="Correo"
        type="email"
        value={f.email}
        onChange={(e) => setF({ ...f, email: e.target.value })}
        error={errores.email}
        ayuda="Con este correo ingresa al sistema."
      />
      <Campo
        etiqueta="Contraseña inicial"
        type="password"
        autoComplete="new-password"
        value={f.password}
        onChange={(e) => setF({ ...f, password: e.target.value })}
        error={errores.password}
        ayuda="Mínimo 10 caracteres. Si el correo ya tiene cuenta en otra empresa, entra con la suya y esta no se usa."
      />
      <Acceso
        perfil={perfil}
        rolId={f.rolId}
        sucursalIds={f.sucursalIds}
        onRol={(rolId) => setF({ ...f, rolId })}
        onSucursales={(sucursalIds) => setF({ ...f, sucursalIds })}
        errores={errores}
      />
      <div className="flex justify-end border-t border-stone-200 pt-4">
        <Boton type="submit" cargando={guardar.isPending}>
          Crear usuario
        </Boton>
      </div>
    </form>
  );
}

function UsuarioEdicion({
  perfil,
  usuario: u,
  onListo,
}: {
  perfil: Perfil;
  usuario: UsuarioEmpresa;
  onListo: () => void;
}) {
  const [f, setF] = useState({ rolId: u.rol.id, sucursalIds: u.sucursales.map((s) => s.id) });
  const [errores, setErrores] = useState<Errores>({});
  const guardar = useGuardar<typeof f, UsuarioEmpresa>('usuarios', u.id);
  const estado = useCambiarEstado<UsuarioEmpresa>('usuarios');

  function enviar(e: FormEvent) {
    e.preventDefault();
    guardar.mutate(f, { onSuccess: onListo, onError: (err) => setErrores(erroresDeApi(err)) });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-medium text-stone-900">{u.nombre}</p>
        <p className="text-sm text-stone-500">{u.email}</p>
      </div>
      {u.esUsted && (
        <p className="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-600">
          Este es su usuario: su rol y sus sucursales los cambia otro administrador, y su
          contraseña, en Mi cuenta.
        </p>
      )}
      <form onSubmit={enviar} className="space-y-4" noValidate>
        {guardar.isError && <Aviso>{guardar.error.message}</Aviso>}
        {estado.isError && <Aviso>{estado.error.message}</Aviso>}
        <Acceso
          perfil={perfil}
          rolId={f.rolId}
          sucursalIds={f.sucursalIds}
          onRol={(rolId) => setF({ ...f, rolId })}
          onSucursales={(sucursalIds) => setF({ ...f, sucursalIds })}
          errores={errores}
          deshabilitado={u.esUsted}
        />
        {!u.esUsted && (
          <div className="flex flex-wrap justify-between gap-2 border-t border-stone-200 pt-4">
            <Boton
              type="button"
              variante="secundario"
              cargando={estado.isPending}
              onClick={() => estado.mutate({ id: u.id, activo: !u.activo }, { onSuccess: onListo })}
            >
              {u.activo ? 'Inactivar' : 'Reactivar'}
            </Boton>
            <Boton type="submit" cargando={guardar.isPending}>
              Guardar cambios
            </Boton>
          </div>
        )}
      </form>
      {!u.esUsted && <Restablecer usuario={u} />}
    </div>
  );
}

function Restablecer({ usuario: u }: { usuario: UsuarioEmpresa }) {
  const [abierto, setAbierto] = useState(false);
  const [password, setPassword] = useState('');
  const restablecer = useMutation({
    mutationFn: () =>
      api<void>(`/usuarios/${u.id}/password`, { method: 'POST', body: { password } }),
  });
  if (u.otrasEmpresas) {
    return (
      <p className="border-t border-stone-200 pt-4 text-sm text-stone-500">
        Este usuario también entra a otras empresas: si olvidó la contraseña, debe cambiarla él
        mismo.
      </p>
    );
  }
  if (restablecer.isSuccess) {
    return (
      <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        Contraseña cambiada. Sus sesiones abiertas se cerraron; entregue la nueva contraseña al
        usuario.
      </p>
    );
  }
  return (
    <div className="border-t border-stone-200 pt-4">
      {!abierto ? (
        <Boton variante="secundario" onClick={() => setAbierto(true)}>
          Restablecer contraseña
        </Boton>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            restablecer.mutate();
          }}
          noValidate
        >
          {restablecer.isError && <Aviso>{restablecer.error.message}</Aviso>}
          <Campo
            etiqueta="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            ayuda="Mínimo 10 caracteres. Se cierran las sesiones abiertas del usuario."
          />
          <div className="flex gap-2">
            <Boton type="submit" cargando={restablecer.isPending} disabled={password.length < 10}>
              Cambiar contraseña
            </Boton>
            <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}
    </div>
  );
}
