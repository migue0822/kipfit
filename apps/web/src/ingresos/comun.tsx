import { mensajeIngreso, type IngresoVista } from '@kip/shared';
import { useEffect, useRef } from 'react';
import { Insignia } from '../componentes';
import { InsigniaEstado } from '../afiliados/comun';

export const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });

export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  });

/** Pitido corto (dos tonos para las alertas). Si el navegador no deja sonar, no pasa nada. */
export function pitar(alerta: boolean) {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tonos = alerta ? [880, 660] : [660];
    tonos.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.value = 0.15;
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.22);
      o.stop(ctx.currentTime + i * 0.22 + 0.18);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* sin sonido */
  }
}

/**
 * Escucha los ingresos de la sucursal en tiempo real (Server-Sent Events). El navegador reconecta solo;
 * `alReconectar` sirve para recargar lo que se pudo perder mientras estuvo desconectado.
 */
export function useEventosIngreso(
  alEvento: (tipo: 'ingreso' | 'cambio', i: IngresoVista) => void,
  alReconectar?: () => void,
) {
  const ref = useRef({ alEvento, alReconectar });
  ref.current = { alEvento, alReconectar };
  useEffect(() => {
    const es = new EventSource('/api/v1/ingresos/eventos', { withCredentials: true });
    let abierto = false;
    es.onopen = () => {
      if (abierto) ref.current.alReconectar?.();
      abierto = true;
    };
    for (const tipo of ['ingreso', 'cambio'] as const) {
      es.addEventListener(tipo, (e) => {
        try {
          ref.current.alEvento(tipo, JSON.parse((e as MessageEvent<string>).data) as IngresoVista);
        } catch {
          /* mensaje ilegible */
        }
      });
    }
    return () => es.close();
  }, []);
}

export function InsigniaResultado({ i }: { i: IngresoVista }) {
  if (i.anulado) return <Insignia tono="apagado">Anulado</Insignia>;
  return i.resultado === 'PERMITIDO' ? (
    <Insignia tono="exito">Entró</Insignia>
  ) : (
    <>
      <InsigniaEstado estado={i.estadoMembresia} />
      {i.alertaPendiente && <Insignia tono="peligro">Por revisar</Insignia>}
    </>
  );
}

export const textoMensaje = mensajeIngreso;
