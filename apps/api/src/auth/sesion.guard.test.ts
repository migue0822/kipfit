import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { ContextoSesion } from './contexto';
import { CLAVE_EMPRESA, CLAVE_PERMISO, CLAVE_PUBLICO } from './decoradores';
import { SesionGuard } from './sesion.guard';
import type { SesionesService } from './sesiones.service';

type Meta = { publico?: boolean; empresa?: boolean; permiso?: string };

function preparar(opc: {
  meta?: Meta;
  cookie?: string;
  sesion?: { contexto: ContextoSesion; renovar: boolean } | null;
  metodo?: string;
}) {
  const meta = opc.meta ?? {};
  const reflector = {
    getAllAndOverride: (clave: string) =>
      clave === CLAVE_PUBLICO
        ? meta.publico
        : clave === CLAVE_EMPRESA
          ? meta.empresa
          : clave === CLAVE_PERMISO
            ? meta.permiso
            : undefined,
  } as unknown as Reflector;
  const sesiones = {
    validar: vi.fn().mockResolvedValue(opc.sesion ?? null),
    renovar: vi.fn().mockResolvedValue(undefined),
  };
  const req: Record<string, unknown> = {
    cookies: opc.cookie ? { kip_sesion: opc.cookie } : {},
    method: opc.metodo ?? 'GET',
  };
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  const ctx = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  const guard = new SesionGuard(reflector, sesiones as unknown as SesionesService);
  return { guard, ctx, req, res, sesiones };
}

const contexto = (extra: Partial<ContextoSesion> = {}): ContextoSesion => ({
  sesionId: 's1',
  usuarioId: 'u1',
  empresaId: 'e1',
  sucursalId: 'su1',
  permisos: ['afiliados.ver'],
  ...extra,
});

describe('SesionGuard', () => {
  it('deja pasar rutas públicas sin sesión', async () => {
    const { guard, ctx, sesiones } = preparar({ meta: { publico: true } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(sesiones.validar).not.toHaveBeenCalled();
  });

  it('rechaza sin cookie', async () => {
    const { guard, ctx } = preparar({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza una sesión inválida y borra la cookie', async () => {
    const { guard, ctx, res } = preparar({ cookie: 'tok', sesion: null });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('adjunta el contexto y renueva la sesión cuando corresponde', async () => {
    const { guard, ctx, req, res, sesiones } = preparar({
      cookie: 'tok',
      sesion: { contexto: contexto(), renovar: true },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.contexto).toMatchObject({ usuarioId: 'u1', empresaId: 'e1' });
    expect(sesiones.renovar).toHaveBeenCalledWith('s1');
    expect(res.cookie).toHaveBeenCalled();
  });

  it('exige empresa seleccionada cuando la ruta pide permiso', async () => {
    const { guard, ctx } = preparar({
      meta: { permiso: 'afiliados.ver' },
      cookie: 'tok',
      sesion: {
        contexto: contexto({ empresaId: null, sucursalId: null, permisos: [] }),
        renovar: false,
      },
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza sin el permiso y acepta con el comodín', async () => {
    const sin = preparar({
      meta: { permiso: 'afiliados.editar' },
      cookie: 'tok',
      sesion: { contexto: contexto(), renovar: false },
    });
    await expect(sin.guard.canActivate(sin.ctx)).rejects.toBeInstanceOf(ForbiddenException);

    const admin = preparar({
      meta: { permiso: 'afiliados.editar' },
      cookie: 'tok',
      sesion: { contexto: contexto({ permisos: ['*'] }), renovar: false },
    });
    await expect(admin.guard.canActivate(admin.ctx)).resolves.toBe(true);
  });
});
