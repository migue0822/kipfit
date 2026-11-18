import { PERMISOS, tienePermiso, type Perfil } from '@kip/shared';
import type { Ruta } from '../rutas';

type Acceso = { ruta: Ruta; titulo: string; texto: string; permiso: string };

const ACCESOS: Acceso[] = [
  {
    ruta: 'afiliados',
    titulo: 'Afiliados',
    texto: 'Fichas, planes y vencimientos de cada afiliado.',
    permiso: PERMISOS.AFILIADOS_VER,
  },
  {
    ruta: 'planes',
    titulo: 'Planes',
    texto: 'Lo que se vende: mensuales y tiqueteras.',
    permiso: PERMISOS.AFILIADOS_VER,
  },
  {
    ruta: 'ingresos',
    titulo: 'Ingresos de hoy',
    texto: 'Quién entró, alertas de membresía y aviso en tiempo real.',
    permiso: PERMISOS.INGRESOS_REGISTRAR,
  },
  {
    ruta: 'ingreso',
    titulo: 'Pantalla de la tablet',
    texto: 'La ventana de la entrada: el afiliado digita su documento.',
    permiso: PERMISOS.INGRESOS_REGISTRAR,
  },
  {
    ruta: 'usuarios',
    titulo: 'Usuarios',
    texto: 'Recepción, entrenadores y administradores, con su rol y sucursal.',
    permiso: PERMISOS.USUARIOS_GESTIONAR,
  },
  {
    ruta: 'sucursales',
    titulo: 'Sucursales',
    texto: 'Las sedes del gimnasio.',
    permiso: PERMISOS.SUCURSALES_GESTIONAR,
  },
];

export function Inicio({ perfil, ir }: { perfil: Perfil; ir: (r: Ruta) => void }) {
  const accesos = ACCESOS.filter((a) => tienePermiso(perfil.permisos, a.permiso));
  const nombre = perfil.usuario.nombre.split(' ')[0];
  return (
    <>
      <h1 className="font-['Literata',Georgia,serif] text-2xl font-semibold text-stone-900">
        Hola, {nombre}
      </h1>
      <p className="mt-1 text-sm text-stone-600">
        {perfil.empresa?.nombreComercial ?? perfil.empresa?.razonSocial} · Sucursal{' '}
        {perfil.sucursal?.nombre}
      </p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accesos.map((a) => (
          <li key={a.titulo}>
            <button
              type="button"
              onClick={() => ir(a.ruta)}
              className="h-full w-full rounded-lg border border-stone-200 bg-white p-4 text-left hover:border-amber-400 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-amber-600"
            >
              <p className="font-semibold text-stone-900">{a.titulo}</p>
              <p className="mt-1 text-sm text-stone-600">{a.texto}</p>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
