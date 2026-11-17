import { loginSchema, type LoginEntrada } from '@kip/shared';
import { useState, type FormEvent } from 'react';
import { useAccion } from '../sesion';
import { Aviso, Boton, Campo, Tarjeta, validar, type Errores } from '../ui';

/** Sin `irARegistro` (punto de venta) no ofrece registrar una empresa. */
export function Ingresar({ irARegistro }: { irARegistro?: () => void }) {
  const ingresar = useAccion<LoginEntrada>('/auth/login');
  const [errores, setErrores] = useState<Errores>({});

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { datos, errores } = validar(loginSchema, {
      email: f.get('email'),
      password: f.get('password'),
    });
    setErrores(errores);
    if (datos) ingresar.mutate(datos);
  }

  return (
    <Tarjeta titulo="Ingresar">
      <form onSubmit={enviar} className="space-y-4" noValidate>
        {ingresar.isError && <Aviso>{ingresar.error.message}</Aviso>}
        <Campo
          etiqueta="Correo"
          name="email"
          type="email"
          autoComplete="email"
          error={errores.email}
        />
        <Campo
          etiqueta="Contraseña"
          name="password"
          type="password"
          autoComplete="current-password"
          error={errores.password}
        />
        <Boton type="submit" cargando={ingresar.isPending} className="w-full">
          Ingresar
        </Boton>
      </form>
      {irARegistro && (
        <p className="mt-5 text-center text-sm text-stone-600">
          ¿Su empresa aún no tiene cuenta?{' '}
          <button
            type="button"
            onClick={irARegistro}
            className="font-medium text-amber-700 hover:underline"
          >
            Registrarla
          </button>
        </p>
      )}
    </Tarjeta>
  );
}
