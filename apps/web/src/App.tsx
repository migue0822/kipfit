import { PERMISOS, tienePermiso, type EstadoRegistro } from '@kip/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from './api';
import { Empresa } from './administracion/Empresa';
import { MiCuenta } from './administracion/MiCuenta';
import { Roles } from './administracion/Roles';
import { Sucursales } from './administracion/Sucursales';
import { Usuarios } from './administracion/Usuarios';
import { Afiliados } from './afiliados/Afiliados';
import { Planes } from './afiliados/Planes';
import { Caja } from './caja/Caja';
import { Recibo } from './caja/Recibo';
import { Inventario } from './tienda/Inventario';
import { Productos } from './tienda/Productos';
import { Vender } from './tienda/Vender';
import { VentaImpresa } from './tienda/VentaImpresa';
import { Ventas } from './tienda/Ventas';
import { Informes } from './informes/Informes';
import { Recepcion } from './ingresos/Recepcion';
import { Tablet } from './ingresos/Tablet';
import { Bienvenida } from './paginas/Bienvenida';
import { Ingresar } from './paginas/Ingresar';
import { Inicio } from './paginas/Inicio';
import { Marco, permisoDeRuta } from './paginas/Marco';
import { Registro } from './paginas/Registro';
import { SeleccionarEmpresa } from './paginas/SeleccionarEmpresa';
import { useRuta } from './rutas';
import { usePerfil } from './sesion';
import { Aviso } from './ui';

export function App() {
  const perfil = usePerfil();
  const [vista, setVista] = useState<'ingresar' | 'registro'>('ingresar');
  const [ruta, ir, params] = useRuta();
  // El registro de empresas puede estar cerrado o pedir un código.
  const estadoRegistro = useQuery({
    queryKey: ['auth', 'registro'],
    queryFn: () => api<EstadoRegistro>('/auth/registro'),
    enabled: perfil.isSuccess && !perfil.data,
  });

  if (perfil.isPending) {
    return <p className="p-6 text-sm text-stone-500">Cargando…</p>;
  }
  if (perfil.isError) {
    return (
      <div className="p-6">
        <Aviso>No fue posible conectar con el servidor. Intente de nuevo en un momento.</Aviso>
      </div>
    );
  }

  if (!perfil.data) {
    return (
      <Bienvenida registro={vista === 'registro'}>
        {vista === 'ingresar' ? (
          <Ingresar
            irARegistro={estadoRegistro.data?.abierto ? () => setVista('registro') : undefined}
          />
        ) : (
          <Registro irAIngresar={() => setVista('ingresar')} />
        )}
      </Bienvenida>
    );
  }

  if (!perfil.data.empresa || !perfil.data.sucursal) {
    return (
      <div className="flex min-h-screen items-start justify-center bg-stone-50 px-4 py-12">
        <SeleccionarEmpresa perfil={perfil.data} />
      </div>
    );
  }

  const p = perfil.data;
  const permiso = permisoDeRuta(ruta);
  // La tablet de la entrada: pantalla completa, sin menú.
  if (ruta === 'ingreso' && permiso && tienePermiso(p.permisos, permiso)) {
    return <Tablet perfil={p} salir={() => ir('ingresos')} />;
  }
  // El recibo se abre solo, para imprimirlo.
  if (ruta === 'recibo' && params.id && tienePermiso(p.permisos, PERMISOS.AFILIADOS_VER)) {
    return <Recibo id={params.id} />;
  }
  // La tirilla de una venta también se abre sola.
  if (ruta === 'venta' && params.id && tienePermiso(p.permisos, PERMISOS.TIENDA_VER)) {
    return <VentaImpresa id={params.id} />;
  }
  return (
    <Marco perfil={p} ruta={ruta} ir={ir}>
      {/* Si alguien escribe la dirección de una pantalla sin permiso. El servidor igual lo impide. */}
      {permiso && !tienePermiso(p.permisos, permiso) ? (
        <p className="rounded-md bg-stone-100 px-4 py-3 text-sm text-stone-600">
          Su rol no tiene acceso a esta sección. Si lo necesita, pídaselo al administrador.
        </p>
      ) : (
        <>
          {ruta === 'inicio' && <Inicio perfil={p} ir={ir} />}
          {ruta === 'afiliados' && <Afiliados perfil={p} />}
          {ruta === 'planes' && (
            <Planes puedeEditar={tienePermiso(p.permisos, PERMISOS.AFILIADOS_EDITAR)} />
          )}
          {ruta === 'ingresos' && <Recepcion />}
          {ruta === 'caja' && <Caja perfil={p} />}
          {ruta === 'vender' && (
            <Vender empresa={p.empresa?.nombreComercial ?? p.empresa?.razonSocial ?? ''} />
          )}
          {ruta === 'ventas' && <Ventas perfil={p} />}
          {ruta === 'productos' && <Productos perfil={p} />}
          {ruta === 'inventario' && <Inventario perfil={p} />}
          {ruta === 'informes' && <Informes perfil={p} />}
          {ruta === 'usuarios' && <Usuarios perfil={p} />}
          {ruta === 'roles' && <Roles />}
          {ruta === 'sucursales' && <Sucursales />}
          {ruta === 'empresa' && <Empresa />}
          {ruta === 'cuenta' && <MiCuenta perfil={p} />}
        </>
      )}
    </Marco>
  );
}
