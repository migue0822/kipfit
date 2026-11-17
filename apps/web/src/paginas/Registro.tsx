import { calcularDV, registroSchema, type EstadoRegistro, type RegistroEntrada } from '@kip/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAccion } from '../sesion';
import { Aviso, Boton, Campo, erroresDeApi, Tarjeta, validar, type Errores } from '../ui';

function dvSugerido(nit: string): string {
  try {
    return /^\d{5,15}$/.test(nit) ? String(calcularDV(nit)) : '';
  } catch {
    return '';
  }
}

export function Registro({ irAIngresar }: { irAIngresar: () => void }) {
  const registrar = useAccion<RegistroEntrada>('/auth/registro');
  const estado = useQuery({
    queryKey: ['auth', 'registro'],
    queryFn: () => api<EstadoRegistro>('/auth/registro'),
  });
  const requiereCodigo = estado.data?.requiereCodigo ?? false;
  const [errores, setErrores] = useState<Errores>({});
  const [nit, setNit] = useState('');
  const [dv, setDv] = useState('');

  function cambiarNit(valor: string) {
    const limpio = valor.replace(/\D/g, '');
    setNit(limpio);
    setDv(dvSugerido(limpio));
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { datos, errores } = validar(registroSchema, {
      empresa: {
        nit,
        dv: dv === '' ? undefined : Number(dv),
        razonSocial: f.get('razonSocial'),
      },
      sucursal: { nombre: f.get('sucursal') || 'Principal' },
      usuario: { nombre: f.get('nombre'), email: f.get('email'), password: f.get('password') },
      codigoRegistro: requiereCodigo ? f.get('codigoRegistro') : undefined,
    });
    setErrores(errores);
    if (datos) {
      registrar.mutate(datos, { onError: (err) => setErrores(erroresDeApi(err)) });
    }
  }

  return (
    <Tarjeta titulo="Registrar empresa">
      <form onSubmit={enviar} className="space-y-4" noValidate>
        {registrar.isError && <Aviso>{registrar.error.message}</Aviso>}

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-stone-900">Empresa</legend>
          <Campo
            etiqueta="Razón social o nombre"
            name="razonSocial"
            autoComplete="organization"
            error={errores['empresa.razonSocial']}
          />
          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <Campo
              etiqueta="NIT o cédula (sin DV)"
              inputMode="numeric"
              value={nit}
              onChange={(e) => cambiarNit(e.target.value)}
              error={errores['empresa.nit']}
            />
            <Campo
              etiqueta="DV"
              inputMode="numeric"
              maxLength={1}
              value={dv}
              onChange={(e) => setDv(e.target.value.replace(/\D/g, ''))}
              error={errores['empresa.dv']}
            />
          </div>
          <Campo
            etiqueta="Nombre de la sucursal principal"
            name="sucursal"
            placeholder="Principal"
            ayuda="Podrá agregar más sucursales después."
            error={errores['sucursal.nombre']}
          />
        </fieldset>

        <fieldset className="space-y-4 border-t border-stone-200 pt-4">
          <legend className="pt-4 text-sm font-semibold text-stone-900">Administrador</legend>
          <Campo
            etiqueta="Su nombre"
            name="nombre"
            autoComplete="name"
            error={errores['usuario.nombre']}
          />
          <Campo
            etiqueta="Correo"
            name="email"
            type="email"
            autoComplete="email"
            error={errores['usuario.email']}
          />
          <Campo
            etiqueta="Contraseña"
            name="password"
            type="password"
            autoComplete="new-password"
            ayuda="Mínimo 10 caracteres."
            error={errores['usuario.password']}
          />
        </fieldset>

        {requiereCodigo && (
          <Campo
            etiqueta="Código de registro"
            name="codigoRegistro"
            autoComplete="off"
            ayuda="Lo entrega el administrador del sistema."
            error={errores['codigoRegistro']}
          />
        )}

        <Boton type="submit" cargando={registrar.isPending} className="w-full">
          Crear cuenta
        </Boton>
      </form>
      <p className="mt-5 text-center text-sm text-stone-600">
        ¿Ya tiene cuenta?{' '}
        <button
          type="button"
          onClick={irAIngresar}
          className="font-medium text-amber-700 hover:underline"
        >
          Ingresar
        </button>
      </p>
    </Tarjeta>
  );
}
