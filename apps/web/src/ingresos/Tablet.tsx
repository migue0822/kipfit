import { mensajeIngreso, type IngresoVista, type Perfil } from '@kip/shared';
import { useEffect, useRef, useState } from 'react';
import { ErrorApi, api } from '../api';
import { formatoFecha } from '../formato';

type Resultado = { tipo: 'ok' | 'alerta' | 'error'; titulo: string; detalle: string[] };

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'];
const SEGUNDOS = 6;

/**
 * Ventana de la tablet de la entrada: el afiliado digita su documento y ve al instante si puede entrar.
 * Pantalla completa, botones grandes. Recepción recibe el aviso en tiempo real.
 */
export function Tablet({ perfil, salir }: { perfil: Perfil; salir: () => void }) {
  const [doc, setDoc] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  // El mismo id se reintenta si la red falló: el servidor no duplica el ingreso.
  const intento = useRef<{ doc: string; id: string } | null>(null);
  const temporizador = useRef<number | undefined>(undefined);

  const limpiar = () => {
    window.clearTimeout(temporizador.current);
    setRes(null);
    setDoc('');
    intento.current = null;
  };
  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  const enviar = async () => {
    const d = doc.trim();
    if (d.length < 3 || enviando) return;
    if (intento.current?.doc !== d) intento.current = { doc: d, id: crypto.randomUUID() };
    setEnviando(true);
    try {
      const i = await api<IngresoVista>('/ingresos', {
        method: 'POST',
        body: { id: intento.current.id, documento: d, origen: 'TABLET' },
      });
      const detalle: string[] = [];
      if (i.planNombre) detalle.push(i.planNombre);
      if (i.venceEl && i.resultado === 'PERMITIDO')
        detalle.push(`Vence el ${formatoFecha(i.venceEl)}`);
      if (i.sesionesRestantes !== null)
        detalle.push(
          `Le quedan ${i.sesionesRestantes} ${i.sesionesRestantes === 1 ? 'sesión' : 'sesiones'}`,
        );
      setRes({
        tipo: i.resultado === 'PERMITIDO' ? 'ok' : 'alerta',
        titulo: `${i.resultado === 'PERMITIDO' ? 'Bienvenido' : 'Atención'}, ${i.afiliadoNombre.split(' ')[0]}`,
        detalle: i.resultado === 'PERMITIDO' ? detalle : [mensajeIngreso(i)],
      });
    } catch (e) {
      const sinRed = !(e instanceof ErrorApi);
      setRes({
        tipo: 'error',
        titulo: sinRed ? 'Sin conexión' : 'No es posible',
        detalle: [
          sinRed
            ? 'No se pudo registrar. Avise en recepción o intente de nuevo.'
            : e.estado === 404
              ? 'No encontramos ese documento. Pase por recepción.'
              : e.message,
        ],
      });
      if (!sinRed) intento.current = null;
    } finally {
      setEnviando(false);
      temporizador.current = window.setTimeout(limpiar, SEGUNDOS * 1000);
    }
  };

  const tecla = (t: string) => {
    if (res || enviando) return;
    if (t === 'C') setDoc('');
    else if (t === '←') setDoc((d) => d.slice(0, -1));
    else setDoc((d) => (d.length < 15 ? d + t : d));
  };

  // El teclado físico también sirve.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (res) return;
      if (/^\d$/.test(e.key)) tecla(e.key);
      else if (e.key === 'Backspace') tecla('←');
      else if (e.key === 'Enter') void enviar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  });

  const colores = {
    ok: 'bg-emerald-600',
    alerta: 'bg-amber-600',
    error: 'bg-red-700',
  } as const;

  return (
    <div className="flex min-h-screen flex-col bg-stone-900 text-white">
      <header className="flex items-center justify-between px-6 py-3 text-sm text-stone-300">
        <span>
          {perfil.empresa?.nombreComercial ?? perfil.empresa?.razonSocial} ·{' '}
          {perfil.sucursal?.nombre}
        </span>
        <button
          type="button"
          onClick={salir}
          className="rounded px-3 py-1 text-stone-400 hover:text-white"
        >
          Salir de esta pantalla
        </button>
      </header>

      {res ? (
        <button
          type="button"
          onClick={limpiar}
          className={`m-6 flex flex-1 flex-col items-center justify-center rounded-3xl px-6 text-center ${colores[res.tipo]}`}
          aria-live="assertive"
        >
          <span className="text-5xl font-bold sm:text-6xl">{res.titulo}</span>
          {res.detalle.map((l) => (
            <span key={l} className="mt-4 text-2xl sm:text-3xl">
              {l}
            </span>
          ))}
          <span className="mt-8 text-sm opacity-80">Toque para continuar</span>
        </button>
      ) : (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-8">
          <h1 className="text-center text-3xl font-semibold">Digite su documento</h1>
          <div
            className="mt-6 min-h-[4.5rem] rounded-2xl bg-stone-800 px-4 py-3 text-center text-4xl font-semibold tracking-widest"
            aria-live="polite"
          >
            {doc || <span className="text-stone-600">Cédula</span>}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {TECLAS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => tecla(t)}
                className="h-20 rounded-2xl bg-stone-700 text-3xl font-semibold active:bg-stone-600"
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={doc.length < 3 || enviando}
            className="mt-4 h-20 w-full rounded-2xl bg-amber-600 text-3xl font-bold hover:bg-amber-500 disabled:opacity-40"
          >
            {enviando ? 'Verificando…' : 'Entrar'}
          </button>
        </main>
      )}
    </div>
  );
}
