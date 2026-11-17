import { useState } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes } from 'react';
import type { ZodType } from 'zod';
import { ErrorApi } from './api';

export type Errores = Record<string, string>;

/** Valida con un esquema compartido; devuelve los datos o los errores por campo. */
export function validar<T>(schema: ZodType<T>, valor: unknown): { datos?: T; errores: Errores } {
  const r = schema.safeParse(valor);
  if (r.success) return { datos: r.data, errores: {} };
  const errores: Errores = {};
  for (const i of r.error.issues) errores[i.path.join('.')] ??= i.message;
  return { errores };
}

/** Pasa los errores de campo de la API al mismo formato. */
export function erroresDeApi(e: unknown): Errores {
  if (!(e instanceof ErrorApi)) return {};
  return Object.fromEntries(e.errores.map((x) => [x.campo, x.mensaje]));
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  // Contraseñas: botón propio para verla u ocultarla (el del navegador desaparece al salir del campo).
  const clave = props.type === 'password';
  const [ver, setVer] = useState(false);
  return (
    <label className="block text-sm">
      <span className="font-medium text-stone-700">{etiqueta}</span>
      <span className="relative mt-1 block">
        <input
          {...props}
          type={clave && ver ? 'text' : props.type}
          aria-invalid={Boolean(error)}
          className={`block w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100 aria-[invalid=true]:border-red-500 ${clave ? 'pr-10' : ''}`}
        />
        {clave && (
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            aria-label={ver ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
            aria-pressed={ver}
            title={ver ? 'Ocultar' : 'Mostrar'}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-stone-500 hover:text-stone-900"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-5 w-5"
            >
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
              {ver && <path d="M4 4l16 16" />}
            </svg>
          </button>
        )}
      </span>
      {error ? (
        <span className="mt-1 block text-red-600">{error}</span>
      ) : ayuda ? (
        <span className="mt-1 block text-stone-500">{ayuda}</span>
      ) : null}
    </label>
  );
}

export function Selector({
  etiqueta,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  etiqueta: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-stone-700">{etiqueta}</span>
      <select
        {...props}
        className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
      >
        {children}
      </select>
      {error && <span className="mt-1 block text-red-600">{error}</span>}
    </label>
  );
}

export function Boton({
  children,
  cargando,
  variante = 'primario',
  ...props
}: React.ComponentProps<'button'> & {
  cargando?: boolean;
  variante?: 'primario' | 'secundario';
}) {
  const estilo =
    variante === 'primario'
      ? 'bg-amber-700 text-white hover:bg-amber-800'
      : 'border border-stone-300 text-stone-700 hover:bg-stone-50';
  return (
    <button
      {...props}
      disabled={cargando || props.disabled}
      className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 ${estilo} ${props.className ?? ''}`}
    >
      {cargando ? 'Procesando…' : children}
    </button>
  );
}

export function Aviso({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

export function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <h1 className="mb-5 text-xl font-semibold text-stone-900">{titulo}</h1>
      {children}
    </div>
  );
}
