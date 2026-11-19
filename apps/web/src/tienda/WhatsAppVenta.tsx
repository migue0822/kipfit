import { enlaceWhatsApp, ETIQUETA_MEDIO, mensajeVenta, type VentaDetalle } from '@kip/shared';
import { useState } from 'react';
import { Boton, Campo } from '../ui';

/**
 * Enviar el recibo de una venta por WhatsApp. Si el cliente es un afiliado con celular, va listo;
 * si no (mostrador), se pregunta el celular.
 */
export function WhatsAppVenta({ v, empresa }: { v: VentaDetalle; empresa: string }) {
  const [abierto, setAbierto] = useState(false);
  const [celular, setCelular] = useState(v.afiliadoTelefono ?? '');
  const enlace = enlaceWhatsApp(
    celular,
    mensajeVenta(v, empresa, (m) => ETIQUETA_MEDIO[m]),
  );
  if (!abierto) {
    return (
      <Boton variante="secundario" type="button" onClick={() => setAbierto(true)}>
        Enviar por WhatsApp
      </Boton>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-stone-200 bg-white p-2 text-stone-900">
      <div className="w-44">
        <Campo
          etiqueta={
            v.afiliadoTelefono ? 'Celular del cliente' : 'Celular del cliente (no es afiliado)'
          }
          inputMode="tel"
          placeholder="300 123 4567"
          value={celular}
          onChange={(e) => setCelular(e.target.value)}
          error={celular && !enlace ? 'Escriba un celular colombiano de 10 dígitos' : undefined}
        />
      </div>
      <a
        href={enlace ?? undefined}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!enlace}
        className={`rounded-md px-4 py-2 text-sm font-medium text-white ${enlace ? 'bg-emerald-700 hover:bg-emerald-800' : 'pointer-events-none bg-stone-300'}`}
      >
        Abrir WhatsApp
      </a>
      <button
        type="button"
        className="pb-2 text-xs text-stone-500"
        onClick={() => setAbierto(false)}
      >
        Cancelar
      </button>
    </div>
  );
}
