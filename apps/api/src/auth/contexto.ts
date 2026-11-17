import type { LicenciaEmpresa } from '@kip/shared';

/** Lo que la sesión deja disponible en cada petición autenticada. */
export interface ContextoSesion {
  sesionId: string;
  usuarioId: string;
  empresaId: string | null;
  sucursalId: string | null;
  permisos: string[];
  /** Licencia de la empresa seleccionada (en solo lectura no se registra nada). */
  licencia?: LicenciaEmpresa | null;
}

/** Contexto de una ruta que exige empresa y sucursal seleccionadas. */
export interface ContextoEmpresa extends ContextoSesion {
  empresaId: string;
  sucursalId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      contexto?: ContextoSesion;
    }
  }
}
