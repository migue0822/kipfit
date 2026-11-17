import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { ContextoSesion } from './contexto';

export const CLAVE_PUBLICO = 'auth:publico';
export const CLAVE_PERMISO = 'auth:permiso';
export const CLAVE_EMPRESA = 'auth:empresa';
export const CLAVE_SOLO_LECTURA = 'auth:solo-lectura';

/** La ruta no exige sesión (registro, login, salud). */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/** La ruta exige empresa y sucursal seleccionadas, además de sesión. */
export const RequiereEmpresa = () => SetMetadata(CLAVE_EMPRESA, true);

/** La ruta exige un permiso del rol del usuario en la empresa activa. */
export const RequierePermiso = (permiso: string) => SetMetadata(CLAVE_PERMISO, permiso);

/** Se permite aunque la licencia esté en solo lectura (p. ej. cerrar la caja que quedó abierta). */
export const PermitidoEnSoloLectura = () => SetMetadata(CLAVE_SOLO_LECTURA, true);

/** Inyecta el contexto de la sesión en el controlador. */
export const Contexto = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.contexto) throw new UnauthorizedException('Sesión requerida');
  return req.contexto as ContextoSesion;
});
