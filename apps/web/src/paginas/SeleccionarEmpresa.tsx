import type { Perfil, SeleccionarContexto } from '@kip/shared';
import { useAccion, useSalir } from '../sesion';
import { Aviso, Boton, Tarjeta } from '../ui';

/** Para usuarios con varias empresas: elegir dónde trabajar. */
export function SeleccionarEmpresa({ perfil }: { perfil: Perfil }) {
  const seleccionar = useAccion<SeleccionarContexto>('/auth/seleccionar');
  const salir = useSalir();

  return (
    <Tarjeta titulo={`Hola, ${perfil.usuario.nombre}`}>
      <p className="mb-4 text-sm text-stone-600">
        Elija la empresa y la sucursal donde va a trabajar.
      </p>
      {seleccionar.isError && <Aviso>{seleccionar.error.message}</Aviso>}
      {perfil.empresas.length === 0 && (
        <p className="text-sm text-stone-600">
          Su usuario no tiene acceso a ninguna empresa activa.
        </p>
      )}
      <ul className="space-y-3">
        {perfil.empresas.map((empresa) => (
          <li key={empresa.id} className="rounded-lg border border-stone-200 p-3">
            <p className="font-medium text-stone-900">{empresa.razonSocial}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {empresa.sucursales.map((s) => (
                <Boton
                  key={s.id}
                  variante="secundario"
                  disabled={seleccionar.isPending}
                  onClick={() => seleccionar.mutate({ empresaId: empresa.id, sucursalId: s.id })}
                >
                  {s.nombre}
                </Boton>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <Boton variante="secundario" onClick={() => salir.mutate()}>
          Cerrar sesión
        </Boton>
      </div>
    </Tarjeta>
  );
}
