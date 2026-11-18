import {
  PERMISOS,
  productoSchema,
  tienePermiso,
  type Perfil,
  type ProductoVista,
} from '@kip/shared';
import { useState, type FormEvent } from 'react';
import {
  CajaBusqueda,
  EncabezadoPagina,
  Insignia,
  Panel,
  Tabla,
  useRetardado,
} from '../componentes';
import { useCambiarEstado, useGuardar, useListado } from '../consultas';
import { formatoPesos } from '../formato';
import { Aviso, Boton, Campo, erroresDeApi, validar, type Errores } from '../ui';

const RECURSO = 'tienda/productos';

/** Productos de la tienda: precios y existencias de la sucursal. */
export function Productos({ perfil }: { perfil: Perfil }) {
  const puedeEditar = tienePermiso(perfil.permisos, PERMISOS.TIENDA_PRODUCTOS);
  const [buscar, setBuscar] = useState('');
  const [inactivos, setInactivos] = useState(false);
  const [abierto, setAbierto] = useState<ProductoVista | 'nuevo' | null>(null);
  const q = useRetardado(buscar);
  const lista = useListado<ProductoVista[]>(RECURSO, {
    buscar: q,
    estado: inactivos ? 'todos' : 'activos',
  });
  const conCostos = lista.data?.some((p) => p.costoPromedio !== null) ?? false;

  return (
    <>
      <EncabezadoPagina
        titulo="Productos de la tienda"
        descripcion="Precios y existencias de la sucursal que tiene seleccionada. Las entradas y los conteos están en Inventario."
        accion={puedeEditar && <Boton onClick={() => setAbierto('nuevo')}>Nuevo producto</Boton>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <CajaBusqueda
          valor={buscar}
          onCambio={setBuscar}
          placeholder="Nombre, código o categoría"
        />
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={inactivos}
            onChange={(e) => setInactivos(e.target.checked)}
          />
          Ver también inactivos
        </label>
      </div>
      {lista.isError && <Aviso>{lista.error.message}</Aviso>}
      <Tabla
        filas={lista.data}
        cargando={lista.isPending}
        vacio="Todavía no hay productos. Cree el primero con «Nuevo producto»."
        onAbrir={puedeEditar ? (p) => setAbierto(p) : undefined}
        columnas={[
          {
            titulo: 'Producto',
            celda: (p) => (
              <>
                <span className="font-medium text-stone-900">{p.nombre}</span>{' '}
                {!p.activo && <Insignia tono="apagado">Inactivo</Insignia>}
                <span className="block text-xs text-stone-500">
                  {[p.codigo, p.categoria].filter(Boolean).join(' · ')}
                </span>
              </>
            ),
          },
          {
            titulo: 'Precio',
            clase: 'text-right tabular-nums',
            celda: (p) => formatoPesos(p.precioVenta),
          },
          {
            titulo: 'Existencia',
            clase: 'text-right tabular-nums',
            celda: (p) => (
              <span className={p.existencia === 0 && p.activo ? 'text-red-700' : ''}>
                {p.existencia}
              </span>
            ),
          },
          ...(conCostos
            ? [
                {
                  titulo: 'Costo promedio',
                  clase: 'text-right tabular-nums',
                  celda: (p: ProductoVista) => formatoPesos(p.costoPromedio ?? '0'),
                },
                {
                  titulo: 'Valor',
                  clase: 'text-right tabular-nums',
                  celda: (p: ProductoVista) => formatoPesos(p.valorInventario ?? '0'),
                },
              ]
            : []),
        ]}
      />
      <Panel
        titulo={abierto === 'nuevo' ? 'Nuevo producto' : 'Editar producto'}
        abierto={abierto !== null}
        onCerrar={() => setAbierto(null)}
      >
        {abierto !== null && (
          <Formulario
            key={abierto === 'nuevo' ? 'nuevo' : abierto.id}
            producto={abierto === 'nuevo' ? null : abierto}
            onListo={() => setAbierto(null)}
          />
        )}
      </Panel>
    </>
  );
}

function Formulario({
  producto,
  onListo,
}: {
  producto: ProductoVista | null;
  onListo: () => void;
}) {
  const [f, setF] = useState({
    codigo: producto?.codigo ?? '',
    nombre: producto?.nombre ?? '',
    categoria: producto?.categoria ?? '',
    precioVenta: producto ? producto.precioVenta.replace(/\.00$/, '') : '',
  });
  const [errores, setErrores] = useState<Errores>({});
  const guardar = useGuardar<typeof f, ProductoVista>(RECURSO, producto?.id);
  const estado = useCambiarEstado<ProductoVista>(RECURSO);

  function enviar(e: FormEvent) {
    e.preventDefault();
    const { datos, errores } = validar(productoSchema, f);
    setErrores(errores);
    if (!datos) return;
    guardar.mutate(f, { onSuccess: onListo, onError: (err) => setErrores(erroresDeApi(err)) });
  }
  const campo = (k: keyof typeof f) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
    error: errores[k],
  });

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      {guardar.isError && <Aviso>{guardar.error.message}</Aviso>}
      <Campo etiqueta="Nombre" autoFocus {...campo('nombre')} />
      <Campo etiqueta="Código de barras o interno (opcional)" {...campo('codigo')} />
      <Campo
        etiqueta="Categoría (opcional)"
        placeholder="Bebidas, Suplementos…"
        {...campo('categoria')}
      />
      <Campo etiqueta="Precio de venta" inputMode="decimal" {...campo('precioVenta')} />
      {producto && (
        <p className="text-xs text-stone-500">
          Cambiar el precio no altera las ventas ya hechas. Hay {producto.existencia} en esta
          sucursal.
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2 border-t border-stone-200 pt-4">
        <div>
          {producto && (
            <Boton
              type="button"
              variante="secundario"
              cargando={estado.isPending}
              onClick={() =>
                estado.mutate({ id: producto.id, activo: !producto.activo }, { onSuccess: onListo })
              }
            >
              {producto.activo ? 'Inactivar' : 'Reactivar'}
            </Boton>
          )}
        </div>
        <div className="flex gap-2">
          <Boton type="button" variante="secundario" onClick={onListo}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={guardar.isPending}>
            {producto ? 'Guardar' : 'Crear producto'}
          </Boton>
        </div>
      </div>
    </form>
  );
}
