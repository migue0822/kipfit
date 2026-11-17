import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { hashPassword } from './password';
import type { SesionesService } from './sesiones.service';

function crearServicio(prisma: Record<string, unknown>) {
  const sesiones = {
    crear: vi.fn().mockResolvedValue({ token: 'tok', sesionId: 's1' }),
    permisosEn: vi.fn().mockResolvedValue(['*']),
    accesoEn: vi.fn().mockResolvedValue(null),
  };
  const servicio = new AuthService(
    prisma as unknown as PrismaService,
    sesiones as unknown as SesionesService,
  );
  return { servicio, sesiones };
}

describe('AuthService.login', () => {
  it('responde lo mismo si el correo no existe o la clave es incorrecta', async () => {
    const hash = await hashPassword('clave-correcta-123');
    const { servicio } = crearServicio({
      usuario: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'u1', hashPassword: hash, activo: true }),
      },
    });

    const noExiste = servicio.login({ email: 'x@y.co', password: 'lo-que-sea' }, {});
    await expect(noExiste).rejects.toThrow(UnauthorizedException);
    await expect(noExiste).rejects.toThrow('Correo o contraseña incorrectos');

    const malaClave = servicio.login({ email: 'x@y.co', password: 'otra-clave-999' }, {});
    await expect(malaClave).rejects.toThrow('Correo o contraseña incorrectos');
  });

  it('con una sola empresa deja seleccionada su primera sucursal', async () => {
    const hash = await hashPassword('clave-correcta-123');
    const membresias = [
      {
        empresa: {
          id: 'e1',
          razonSocial: 'Mi Tienda',
          nit: '800197268',
          sucursales: [
            { id: 'su1', nombre: 'Principal' },
            { id: 'su2', nombre: 'Centro' },
          ],
        },
        sucursales: [],
      },
    ];
    const { servicio, sesiones } = crearServicio({
      usuario: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', hashPassword: hash, activo: true }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ id: 'u1', nombre: 'Ana', email: 'ana@ejemplo.com' }),
      },
      membresia: { findMany: vi.fn().mockResolvedValue(membresias) },
    });

    const { token, perfil } = await servicio.login(
      { email: 'ANA@ejemplo.com', password: 'clave-correcta-123' },
      {},
    );
    expect(token).toBe('tok');
    expect(sesiones.crear).toHaveBeenCalledWith('u1', { empresaId: 'e1', sucursalId: 'su1' }, {});
    expect(perfil.empresa?.id).toBe('e1');
    expect(perfil.sucursal?.nombre).toBe('Principal');
    expect(perfil.permisos).toEqual(['*']);
  });
});

describe('AuthService.registrar', () => {
  it('rechaza un correo ya registrado antes de crear nada', async () => {
    const transaccion = vi.fn();
    const { servicio } = crearServicio({
      usuario: { findUnique: vi.fn().mockResolvedValue({ id: 'u1' }) },
      empresa: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: transaccion,
    });

    await expect(
      servicio.registrar(
        {
          empresa: {
            nit: '800197268',
            dv: 4,
            razonSocial: 'X',
          },
          sucursal: { nombre: 'Principal' },
          usuario: { nombre: 'Ana', email: 'ana@ejemplo.com', password: 'una-clave-segura' },
        },
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaccion).not.toHaveBeenCalled();
  });
});
