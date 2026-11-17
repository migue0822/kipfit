import type { ReactNode } from 'react';

/** Datos de contacto de Kipfit. */
export const CONTACTO = {
  nombre: 'Ing. Miguel López',
  telefono: '+57 319 377 6896',
  telefonoEnlace: '+573193776896',
  whatsapp: `https://wa.me/573193776896?text=${encodeURIComponent(
    'Hola, Ing. Miguel. Quiero conocer Kipfit para mi gimnasio.',
  )}`,
};

/** Logo: una pesa atada con un cordón de kipu (el registro de cuentas con nudos de los Andes). */
export function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect
        x="2"
        y="2"
        width="36"
        height="36"
        rx="9"
        fill="#FCEFD2"
        stroke="#B45309"
        strokeWidth="2"
      />
      <path
        d="M11 14v12M15 11v18M29 14v12M25 11v18M15 20h10"
        fill="none"
        stroke="#B45309"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const FUNCIONES: { titulo: string; texto: string }[] = [
  {
    titulo: 'Afiliados al día',
    texto: 'Fichas, planes y vencimientos en un solo lugar, sin hojas sueltas.',
  },
  {
    titulo: 'Ingreso en la entrada',
    texto:
      'Una tablet con wifi abre solo la ventana de ingreso y avisa en tiempo real a recepción.',
  },
  {
    titulo: 'Varias sedes',
    texto: 'Cada sucursal con sus usuarios y su operación, bajo la misma empresa.',
  },
  {
    titulo: 'Desde cualquier pantalla',
    texto: 'En el computador de recepción, la tablet o el celular, sin instalar nada.',
  },
];

/** Página de ingreso de Kipfit: qué es, el ingreso o el registro, y el contacto. */
export function Bienvenida({ children, registro }: { children: ReactNode; registro?: boolean }) {
  return (
    <div className="min-h-screen bg-[#FBF7EF] text-stone-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 pt-6 sm:px-8">
        <p className="flex items-center gap-2 font-['Literata',Georgia,serif] text-2xl font-semibold tracking-tight">
          <Logo className="h-9 w-9" />
          <span>
            Kip<span className="text-amber-700">fit</span>
          </span>
        </p>
        <a
          href={CONTACTO.whatsapp}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-amber-700/30 px-4 py-1.5 text-sm font-medium text-amber-800 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
        >
          Escríbanos por WhatsApp
        </a>
      </header>

      {registro ? (
        <main className="mx-auto flex max-w-6xl justify-center px-5 py-10 sm:px-8">{children}</main>
      ) : (
        <main className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_26rem] lg:gap-16 lg:py-14">
          <div className="order-2 lg:order-1">
            <h1 className="max-w-xl text-balance font-['Literata',Georgia,serif] text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Cada ingreso, contado.
            </h1>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-stone-700">
              Gestión de gimnasios: afiliados, planes y control de ingreso en la entrada, desde
              cualquier pantalla.
            </p>
            <ul className="mt-8 grid max-w-xl gap-4 sm:grid-cols-2">
              {FUNCIONES.map((f) => (
                <li
                  key={f.titulo}
                  className="rounded-lg border border-amber-900/10 bg-white/70 p-4"
                >
                  <p className="font-semibold">{f.titulo}</p>
                  <p className="mt-1 text-sm leading-snug text-stone-600">{f.texto}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="order-1 lg:order-2 lg:pt-2">{children}</div>
        </main>
      )}

      <footer className="border-t border-amber-900/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>Kipfit · Pasto, Colombia</p>
          <p>
            {CONTACTO.nombre} ·{' '}
            <a href={`tel:${CONTACTO.telefonoEnlace}`} className="font-medium text-amber-800">
              {CONTACTO.telefono}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
