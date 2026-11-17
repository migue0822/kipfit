import {
  CONTACTO_PLATAFORMA,
  DIAS_AVISO_LICENCIA,
  PERMISOS,
  tienePermiso,
  type Perfil,
} from '@kip/shared';
import { formatoFecha } from '../formato';

const whatsapp = (texto: string) =>
  `https://wa.me/${CONTACTO_PLATAFORMA.whatsapp}?text=${encodeURIComponent(texto)}`;

/**
 * Aviso de la licencia: en solo lectura (vencida o suspendida) lo ven todos; el de "vence pronto",
 * quien configura la empresa.
 */
export function AvisoLicencia({ perfil }: { perfil: Perfil }) {
  const l = perfil.empresa?.licencia;
  if (!l) return null;
  const empresa = perfil.empresa!.razonSocial;

  if (l.soloLectura) {
    return (
      <div
        role="alert"
        className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
      >
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {l.motivo === 'SUSPENDIDA'
              ? 'La cuenta de la empresa está suspendida'
              : l.enDemo
                ? `La demostración terminó el ${l.pagadoHasta ? formatoFecha(l.pagadoHasta) : ''}`
                : `El plan venció el ${l.pagadoHasta ? formatoFecha(l.pagadoHasta) : ''}`}
          </p>
          <p>
            Puede consultar e imprimir, pero no registrar ventas ni otros documentos. Para
            reactivarlo, comuníquese con {CONTACTO_PLATAFORMA.nombre} (
            {CONTACTO_PLATAFORMA.telefono}).
          </p>
        </div>
        <a
          href={whatsapp(
            l.enDemo
              ? `Hola, Ing. Miguel. Quiero contratar Kipfit para ${empresa}.`
              : `Hola, Ing. Miguel. Quiero renovar el plan de Kipfit de ${empresa}.`,
          )}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-800"
        >
          {l.enDemo ? 'Contratar por WhatsApp' : 'Renovar por WhatsApp'}
        </a>
      </div>
    );
  }

  if (
    l.diasRestantes !== null &&
    l.diasRestantes <= DIAS_AVISO_LICENCIA &&
    tienePermiso(perfil.permisos, PERMISOS.EMPRESA_CONFIGURAR)
  ) {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="min-w-0 flex-1">
          <span className="font-semibold">
            {(l.enDemo ? 'La demostración termina' : 'Su plan vence') +
              (l.diasRestantes === 0
                ? ' hoy.'
                : ` en ${l.diasRestantes} día${l.diasRestantes === 1 ? '' : 's'} (${formatoFecha(l.pagadoHasta!)}).`)}
          </span>{' '}
          Después de esa fecha el programa queda en solo lectura hasta que se renueve.
        </p>
        <a
          href={whatsapp(
            l.enDemo
              ? `Hola, Ing. Miguel. Quiero contratar Kipfit para ${empresa}.`
              : `Hola, Ing. Miguel. Quiero renovar el plan de Kipfit de ${empresa}.`,
          )}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 font-medium hover:bg-amber-100"
        >
          {l.enDemo ? 'Contratar por WhatsApp' : 'Renovar por WhatsApp'}
        </a>
      </div>
    );
  }
  return null;
}
