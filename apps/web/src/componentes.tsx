import { useEffect, useState, type ReactNode } from 'react';
import { Boton } from './ui';

/** Valor que se actualiza solo cuando el usuario deja de escribir. */
export function useRetardado<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

export function EncabezadoPagina({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-stone-500">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}

export function CajaBusqueda({
  valor,
  onCambio,
  placeholder,
}: {
  valor: string;
  onCambio: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      placeholder={placeholder}
      aria-label="Buscar"
      className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100 sm:w-72"
    />
  );
}

/** Grupo de botones para elegir una opción (filtros). */
export function Segmentos<T extends string>({
  opciones,
  valor,
  onCambio,
  etiqueta,
}: {
  opciones: { valor: T; texto: string }[];
  valor: T;
  onCambio: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className="inline-flex rounded-md border border-stone-300 bg-white p-0.5"
    >
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={o.valor === valor}
          onClick={() => onCambio(o.valor)}
          className="rounded px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900 aria-pressed:bg-stone-900 aria-pressed:text-white"
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function Insignia({
  children,
  tono = 'neutro',
}: {
  children: ReactNode;
  tono?: 'neutro' | 'apagado' | 'acento' | 'exito' | 'peligro';
}) {
  const estilos = {
    neutro: 'bg-stone-100 text-stone-700',
    apagado: 'bg-amber-50 text-amber-800',
    acento: 'bg-amber-50 text-amber-800',
    exito: 'bg-emerald-50 text-emerald-800',
    peligro: 'bg-red-50 text-red-800',
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${estilos[tono]}`}>
      {children}
    </span>
  );
}

export function Casilla({
  etiqueta,
  checked,
  onChange,
  disabled,
  ayuda,
}: {
  etiqueta: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ayuda?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-stone-700">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-amber-700"
      />
      <span>
        {etiqueta}
        {ayuda && <span className="block text-xs text-stone-500">{ayuda}</span>}
      </span>
    </label>
  );
}

/** Tabla de listado. Las filas se pueden abrir con clic o Enter. */
export function Tabla<T extends { id: string }>({
  columnas,
  filas,
  onAbrir,
  vacio,
  cargando,
}: {
  columnas: { titulo: string; celda: (f: T) => ReactNode; clase?: string }[];
  filas: T[] | undefined;
  onAbrir?: (f: T) => void;
  vacio: string;
  cargando?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
          <tr>
            {columnas.map((c) => (
              <th key={c.titulo} scope="col" className={`px-3 py-2 font-medium ${c.clase ?? ''}`}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {filas?.map((f) => (
            <tr
              key={f.id}
              tabIndex={onAbrir ? 0 : undefined}
              onClick={onAbrir && (() => onAbrir(f))}
              onKeyDown={onAbrir && ((e) => e.key === 'Enter' && onAbrir(f))}
              className={
                onAbrir
                  ? 'cursor-pointer hover:bg-stone-50 focus:bg-amber-50 focus:outline-none'
                  : ''
              }
            >
              {columnas.map((c) => (
                <td key={c.titulo} className={`px-3 py-2 align-top ${c.clase ?? ''}`}>
                  {c.celda(f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {cargando && !filas && (
        <p className="px-3 py-6 text-center text-sm text-stone-500">Cargando…</p>
      )}
      {filas?.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-stone-500">{vacio}</p>
      )}
    </div>
  );
}

export function Paginacion({
  pagina,
  porPagina,
  total,
  onCambio,
}: {
  pagina: number;
  porPagina: number;
  total: number;
  onCambio: (p: number) => void;
}) {
  if (total === 0) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);
  const ultima = Math.ceil(total / porPagina);
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-stone-600">
      <span>
        {desde}–{hasta} de {total}
      </span>
      {ultima > 1 && (
        <div className="flex gap-2">
          <Boton variante="secundario" disabled={pagina <= 1} onClick={() => onCambio(pagina - 1)}>
            Anterior
          </Boton>
          <Boton
            variante="secundario"
            disabled={pagina >= ultima}
            onClick={() => onCambio(pagina + 1)}
          >
            Siguiente
          </Boton>
        </div>
      )}
    </div>
  );
}

/** Panel lateral para formularios de alta y edición. Se cierra con Escape. */
export function Panel({
  titulo,
  abierto,
  onCerrar,
  children,
  amplio,
}: {
  titulo: string;
  abierto: boolean;
  onCerrar: () => void;
  children: ReactNode;
  amplio?: boolean;
}) {
  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [abierto, onCerrar]);

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-20 flex justify-end">
      <div className="absolute inset-0 bg-stone-900/30" onClick={onCerrar} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`relative flex h-full w-full ${amplio ? 'max-w-2xl' : 'max-w-lg'} flex-col bg-white shadow-xl`}
      >
        <header className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 className="font-semibold text-stone-900">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded px-2 py-1 text-stone-500 hover:bg-stone-100"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
