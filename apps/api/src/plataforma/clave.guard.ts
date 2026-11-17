import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/** Clave compartida con la consola de OrdenKipu; vacía (o corta) = la API de plataforma no existe. */
export function clavePlataforma(): string | undefined {
  const c = process.env.PLATAFORMA_CLAVE?.trim();
  return c && c.length >= 16 ? c : undefined;
}

const resumen = (t: string) => createHash('sha256').update(t).digest();

/**
 * Solo la consola de plataforma de OrdenKipu entra a `/plataforma`: llega por la red interna del servidor
 * (el Caddy de Kipfit no deja pasar esas rutas desde internet) con la cabecera `X-Plataforma-Clave` y dice
 * quién la usa en `X-Plataforma-Usuario` (queda en la auditoría y en los pagos).
 */
@Injectable()
export class ClavePlataformaGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const esperada = clavePlataforma();
    if (!esperada) throw new NotFoundException();
    const req = ctx.switchToHttp().getRequest<Request>();
    const dada = req.get('x-plataforma-clave') ?? '';
    if (!timingSafeEqual(resumen(dada), resumen(esperada))) {
      throw new UnauthorizedException('Clave de plataforma inválida');
    }
    const quien = (req.get('x-plataforma-usuario') ?? '').trim();
    if (quien.length < 3 || quien.length > 200) {
      throw new UnauthorizedException('Falta quién usa la consola (X-Plataforma-Usuario)');
    }
    return true;
  }
}

/** Nombre y correo del administrador de la consola que hizo la petición. */
export const quienPlataforma = (req: Request) => (req.get('x-plataforma-usuario') ?? '').trim();
