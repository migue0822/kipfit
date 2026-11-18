import { useEffect, useState } from 'react';

export const RUTAS = [
  'inicio',
  'afiliados',
  'planes',
  'ingresos',
  'ingreso',
  'caja',
  'recibo',
  'informes',
  'usuarios',
  'roles',
  'sucursales',
  'empresa',
  'cuenta',
] as const;
export type Ruta = (typeof RUTAS)[number];
export type Parametros = Record<string, string>;

function leer(): { ruta: Ruta; params: Parametros } {
  const [camino = '', consulta = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const ruta = (RUTAS as readonly string[]).includes(camino) ? (camino as Ruta) : 'inicio';
  return { ruta, params: Object.fromEntries(new URLSearchParams(consulta)) };
}

/** Navegación por la dirección (#/usuarios?…), así recargar la página no la pierde. */
export function useRuta(): [Ruta, (r: Ruta, params?: Parametros) => void, Parametros] {
  const [estado, setEstado] = useState(leer);
  useEffect(() => {
    const alCambiar = () => setEstado(leer());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);
  const ir = (r: Ruta, params?: Parametros) => {
    const q = params ? new URLSearchParams(params).toString() : '';
    window.location.hash = `/${r}${q ? `?${q}` : ''}`;
  };
  return [estado.ruta, ir, estado.params];
}
