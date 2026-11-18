import {
  ETIQUETA_ESTADO_MEMBRESIA,
  type AfiliadoResumen,
  type EstadoMembresia,
  type SuscripcionVista,
} from '@kip/shared';
import { Insignia } from '../componentes';
import { formatoFecha } from '../formato';

const TONOS: Record<EstadoMembresia, 'neutro' | 'exito' | 'acento' | 'peligro' | 'apagado'> = {
  SIN_MEMBRESIA: 'neutro',
  VIGENTE: 'exito',
  POR_VENCER: 'acento',
  CONGELADA: 'neutro',
  VENCIDA: 'peligro',
  AGOTADA: 'peligro',
};

export function InsigniaEstado({ estado }: { estado: EstadoMembresia }) {
  return <Insignia tono={TONOS[estado]}>{ETIQUETA_ESTADO_MEMBRESIA[estado]}</Insignia>;
}

/** "Vence el 30 nov 2026 (faltan 13 días)" / "Venció hace 5 días". */
export function textoVencimiento(a: Pick<AfiliadoResumen, 'fechaFin' | 'diasRestantes'>): string {
  if (!a.fechaFin || a.diasRestantes === null) return '';
  const d = a.diasRestantes;
  const fecha = formatoFecha(a.fechaFin);
  if (d < 0) return `Venció el ${fecha} (hace ${-d} ${d === -1 ? 'día' : 'días'})`;
  if (d === 0) return `Vence hoy (${fecha})`;
  return `Vence el ${fecha} (${d === 1 ? 'falta 1 día' : `faltan ${d} días`})`;
}

export function textoSesiones(s: Pick<SuscripcionVista, 'sesionesTotal' | 'sesionesUsadas'>) {
  return s.sesionesTotal === null
    ? ''
    : `${s.sesionesUsadas} de ${s.sesionesTotal} sesiones usadas`;
}
