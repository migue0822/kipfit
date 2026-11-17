import { AvisoLicencia } from './AvisoLicencia';
import { PERMISOS, tienePermiso, type Perfil, type SeleccionarContexto } from '@kip/shared';
import { useEffect, useState, type ReactNode } from 'react';
import type { Ruta } from '../rutas';
import { useAccion, useSalir } from '../sesion';
import { Boton } from '../ui';
import { Logo } from './Bienvenida';

type Opcion = { ruta: Ruta; texto: string; permiso?: string; grupo?: string };

export const MENU: Opcion[] = [
  { ruta: 'inicio', texto: 'Inicio' },
  {
    ruta: 'usuarios',
    texto: 'Usuarios',
    permiso: PERMISOS.USUARIOS_GESTIONAR,
    grupo: 'Administración',
  },
  { ruta: 'roles', texto: 'Roles', permiso: PERMISOS.USUARIOS_GESTIONAR, grupo: 'Administración' },
  {
    ruta: 'sucursales',
    texto: 'Sucursales',
    permiso: PERMISOS.SUCURSALES_GESTIONAR,
    grupo: 'Administración',
  },
  {
    ruta: 'empresa',
    texto: 'Empresa',
    permiso: PERMISOS.EMPRESA_CONFIGURAR,
    grupo: 'Administración',
  },
];

/** Permiso que exige una pantalla (las que no están en el menú no exigen). */
export function permisoDeRuta(ruta: Ruta): string | undefined {
  return MENU.find((m) => m.ruta === ruta)?.permiso;
}

/** Ícono de cada grupo del menú (trazos simples, heredan el color del texto). */
const ICONOS: Record<string, string> = {
  Inicio: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  Administración:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};

function Icono({ grupo, className = 'h-4 w-4' }: { grupo: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={ICONOS[grupo] ?? ICONOS.Productos} />
    </svg>
  );
}

/**
 * Estructura común: menú lateral oscuro con los grupos plegables (uno abierto a la vez; se abre
 * solo el de la pantalla actual) y barra superior con la sucursal y el usuario.
 */
export function Marco({
  perfil,
  ruta,
  ir,
  children,
}: {
  perfil: Perfil;
  ruta: Ruta;
  ir: (r: Ruta) => void;
  children: ReactNode;
}) {
  const seleccionar = useAccion<SeleccionarContexto>('/auth/seleccionar');
  const salir = useSalir();
  const empresa = perfil.empresas.find((e) => e.id === perfil.empresa?.id);
  const menu = MENU.filter(
    (m) => m.grupo && (!m.permiso || tienePermiso(perfil.permisos, m.permiso)),
  );
  const grupos = [...new Set(menu.map((m) => m.grupo!))];
  const opcionActual = MENU.find((m) => m.ruta === ruta);
  const grupoActual = opcionActual?.grupo ?? null;
  const [abierto, setAbierto] = useState<string | null>(grupoActual);
  const [menuMovil, setMenuMovil] = useState(false);
  // Al llegar a una pantalla de otro grupo (enlace, botón del tablero) se abre su grupo.
  useEffect(() => {
    if (grupoActual) setAbierto(grupoActual);
  }, [grupoActual]);

  const navegar = (r: Ruta) => {
    ir(r);
    setMenuMovil(false);
  };
  const enlace = (r: Ruta, texto: ReactNode, clase: string) => (
    <a
      href={`#/${r}`}
      onClick={(e) => {
        e.preventDefault();
        navegar(r);
      }}
      aria-current={ruta === r ? 'page' : undefined}
      className={clase}
    >
      {texto}
    </a>
  );

  return (
    <div className="min-h-screen bg-stone-50 md:flex">
      <div className="bg-stone-900 md:w-60 md:shrink-0">
        <aside className="text-stone-300 md:sticky md:top-0 md:flex md:h-screen md:flex-col">
          <div className="flex items-center gap-3 px-4 py-3">
            <Logo className="h-9 w-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-semibold text-white"
                title={perfil.empresa?.razonSocial}
              >
                {perfil.empresa?.razonSocial}
              </p>
              <p className="truncate text-xs text-stone-400">
                NIT {perfil.empresa?.nit}-{perfil.empresa?.dv}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMenuMovil((v) => !v)}
              aria-expanded={menuMovil}
              aria-controls="menu-principal"
              className="rounded-md px-2 py-1 text-sm text-stone-200 ring-1 ring-stone-600 md:hidden"
            >
              Menú
            </button>
          </div>
          <nav
            id="menu-principal"
            aria-label="Menú principal"
            className={`${menuMovil ? 'block' : 'hidden'} flex-1 overflow-y-auto px-2 pb-4 md:block`}
          >
            {enlace(
              'inicio',
              <>
                <Icono grupo="Inicio" />
                Inicio
              </>,
              'mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium hover:bg-stone-800 hover:text-white aria-[current=page]:bg-amber-600 aria-[current=page]:text-white',
            )}
            <ul className="space-y-0.5">
              {grupos.map((g) => {
                const esAbierto = abierto === g;
                return (
                  <li key={g}>
                    <button
                      type="button"
                      onClick={() => setAbierto(esAbierto ? null : g)}
                      aria-expanded={esAbierto}
                      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-stone-800 hover:text-white ${
                        grupoActual === g ? 'text-white' : ''
                      }`}
                    >
                      <Icono grupo={g} />
                      <span className="flex-1">{g}</span>
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                        className={`h-4 w-4 text-stone-500 transition-transform ${esAbierto ? 'rotate-90' : ''}`}
                      >
                        <path d="M7.2 4.8a.75.75 0 0 1 1.06 0l4.67 4.67a.75.75 0 0 1 0 1.06l-4.67 4.67a.75.75 0 1 1-1.06-1.06L11.34 10 7.2 5.86a.75.75 0 0 1 0-1.06z" />
                      </svg>
                    </button>
                    {esAbierto && (
                      <ul className="mb-1 ml-5 mt-0.5 space-y-0.5 border-l border-stone-700 pl-2">
                        {menu
                          .filter((m) => m.grupo === g)
                          .map((m) => (
                            <li key={m.ruta}>
                              {enlace(
                                m.ruta,
                                m.texto,
                                'block rounded-md px-3 py-1.5 text-sm text-stone-400 hover:bg-stone-800 hover:text-white aria-[current=page]:bg-amber-600 aria-[current=page]:font-medium aria-[current=page]:text-white',
                              )}
                            </li>
                          ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
      </div>

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-end gap-3 border-b border-stone-200 bg-white px-4 py-2.5 sm:px-6">
          <div className="mr-auto" />
          {empresa && empresa.sucursales.length > 1 ? (
            <select
              aria-label="Sucursal"
              className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm"
              value={perfil.sucursal?.id}
              onChange={(e) =>
                seleccionar.mutate({ empresaId: empresa.id, sucursalId: e.target.value })
              }
            >
              {empresa.sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-stone-600">Sucursal {perfil.sucursal?.nombre}</span>
          )}
          {enlace(
            'cuenta',
            perfil.usuario.nombre,
            'text-sm text-stone-600 hover:text-stone-900 hover:underline',
          )}
          <Boton variante="secundario" cargando={salir.isPending} onClick={() => salir.mutate()}>
            Salir
          </Boton>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <AvisoLicencia perfil={perfil} />
          {children}
        </main>
      </div>
    </div>
  );
}
