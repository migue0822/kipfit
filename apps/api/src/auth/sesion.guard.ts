import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mensajeSoloLectura, tienePermiso } from '@kip/shared';
import type { Request, Response } from 'express';
import { contextoBd } from '../prisma/contexto-bd';
import { borrarCookieSesion, COOKIE_SESION, ponerCookieSesion } from './cookie';
import { CLAVE_EMPRESA, CLAVE_PERMISO, CLAVE_PUBLICO, CLAVE_SOLO_LECTURA } from './decoradores';
import { SesionesService } from './sesiones.service';

/**
 * Guard global: toda ruta exige sesión salvo las marcadas con @Publico().
 * Además aplica @RequiereEmpresa() y @RequierePermiso().
 */
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sesiones: SesionesService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, objetivos)) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const token: unknown = req.cookies?.[COOKIE_SESION];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException('Sesión requerida');
    }

    const resultado = await this.sesiones.validar(token);
    if (!resultado) {
      borrarCookieSesion(res);
      throw new UnauthorizedException('La sesión expiró, ingrese de nuevo');
    }
    if (resultado.renovar) {
      await this.sesiones.renovar(resultado.contexto.sesionId);
      ponerCookieSesion(res, token);
    }
    req.contexto = resultado.contexto;

    const permiso = this.reflector.getAllAndOverride<string | undefined>(CLAVE_PERMISO, objetivos);
    const exigeEmpresa =
      Boolean(permiso) || this.reflector.getAllAndOverride<boolean>(CLAVE_EMPRESA, objetivos);

    if (exigeEmpresa && (!req.contexto.empresaId || !req.contexto.sucursalId)) {
      throw new ForbiddenException('Seleccione una empresa y sucursal');
    }
    if (permiso && !tienePermiso(req.contexto.permisos, permiso)) {
      throw new ForbiddenException('No tiene permiso para esta acción');
    }
    // Licencia vencida o suspendida (o demostración terminada): se consulta e imprime, pero no se registra.
    const licencia = req.contexto.licencia;
    if (
      exigeEmpresa &&
      licencia?.soloLectura &&
      !['GET', 'HEAD'].includes(req.method) &&
      !this.reflector.getAllAndOverride<boolean>(CLAVE_SOLO_LECTURA, objetivos)
    ) {
      throw new ForbiddenException(mensajeSoloLectura(licencia));
    }
    // Desde aquí, toda consulta de esta petición queda limitada a su empresa (RLS).
    const bd = contextoBd.getStore();
    if (exigeEmpresa && bd) bd.empresaId = req.contexto.empresaId!;
    return true;
  }
}
