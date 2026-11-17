import { cambiarPasswordSchema, type Perfil } from '@kip/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { EncabezadoPagina } from '../componentes';
import { Aviso, Boton, Campo, erroresDeApi, validar, type Errores } from '../ui';

export function MiCuenta({ perfil }: { perfil: Perfil }) {
  const [f, setF] = useState({ actual: '', nueva: '', confirmar: '' });
  const [errores, setErrores] = useState<Errores>({});
  const cambiar = useMutation({
    mutationFn: (body: { actual: string; nueva: string }) =>
      api<void>('/auth/password', { method: 'POST', body }),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    const { datos, errores } = validar(cambiarPasswordSchema, f);
    if (f.nueva !== f.confirmar) errores.confirmar = 'No coincide con la nueva contraseña';
    setErrores(errores);
    if (!datos || errores.confirmar) return;
    cambiar.mutate(datos, {
      onSuccess: () => setF({ actual: '', nueva: '', confirmar: '' }),
      onError: (err) => setErrores(erroresDeApi(err)),
    });
  }

  const empresa = perfil.empresas.find((e) => e.id === perfil.empresa?.id);
  return (
    <>
      <EncabezadoPagina titulo="Mi cuenta" />
      <div className="grid max-w-3xl gap-6 md:grid-cols-2">
        <dl className="space-y-3 rounded-lg border border-stone-200 bg-white p-5 text-sm">
          <div>
            <dt className="text-xs text-stone-500">Nombre</dt>
            <dd className="text-stone-900">{perfil.usuario.nombre}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Correo (usuario para ingresar)</dt>
            <dd className="text-stone-900">{perfil.usuario.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Empresas</dt>
            <dd className="text-stone-900">
              {perfil.empresas.map((e) => e.razonSocial).join(', ')}
            </dd>
          </div>
          {empresa && (
            <div>
              <dt className="text-xs text-stone-500">Sucursales donde puede trabajar</dt>
              <dd className="text-stone-900">
                {empresa.sucursales.map((s) => s.nombre).join(', ')}
              </dd>
            </div>
          )}
        </dl>
        <form
          onSubmit={enviar}
          className="space-y-4 rounded-lg border border-stone-200 bg-white p-5"
          noValidate
        >
          <p className="font-medium text-stone-900">Cambiar contraseña</p>
          {cambiar.isSuccess && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Contraseña cambiada. Se cerraron sus sesiones en otros equipos.
            </p>
          )}
          {cambiar.isError && <Aviso>{cambiar.error.message}</Aviso>}
          <Campo
            etiqueta="Contraseña actual"
            type="password"
            autoComplete="current-password"
            value={f.actual}
            onChange={(e) => setF({ ...f, actual: e.target.value })}
            error={errores.actual}
          />
          <Campo
            etiqueta="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={f.nueva}
            onChange={(e) => setF({ ...f, nueva: e.target.value })}
            error={errores.nueva}
            ayuda="Mínimo 10 caracteres."
          />
          <Campo
            etiqueta="Repita la nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={f.confirmar}
            onChange={(e) => setF({ ...f, confirmar: e.target.value })}
            error={errores.confirmar}
          />
          <Boton type="submit" cargando={cambiar.isPending}>
            Cambiar contraseña
          </Boton>
        </form>
      </div>
    </>
  );
}
