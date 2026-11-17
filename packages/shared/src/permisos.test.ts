import { describe, expect, it } from 'vitest';
import { rolSchema, sucursalSchema, usuarioNuevoSchema } from './esquemas/administracion.js';
import { CATALOGO_PERMISOS, PERMISOS, ROLES_SUGERIDOS, tienePermiso } from './permisos.js';

describe('catálogo de permisos', () => {
  it('cada permiso aparece exactamente una vez en la pantalla de roles', () => {
    const enCatalogo = CATALOGO_PERMISOS.flatMap((g) => g.permisos.map((p) => p.codigo));
    expect([...enCatalogo].sort()).toEqual(Object.values(PERMISOS).sort());
  });

  it('los roles sugeridos solo usan permisos del catálogo', () => {
    const validos = new Set<string>(Object.values(PERMISOS));
    for (const r of ROLES_SUGERIDOS) expect(r.permisos.every((p) => validos.has(p))).toBe(true);
  });

  it('el comodín da acceso a todo', () => {
    expect(tienePermiso(['*'], PERMISOS.AFILIADOS_EDITAR)).toBe(true);
    expect(tienePermiso([PERMISOS.AFILIADOS_VER], PERMISOS.AFILIADOS_EDITAR)).toBe(false);
  });
});

describe('esquemas de administración', () => {
  it('un rol no acepta el comodín ni permisos inventados, y quita repetidos', () => {
    expect(rolSchema.safeParse({ nombre: 'Hack', permisos: ['*'] }).success).toBe(false);
    expect(rolSchema.safeParse({ nombre: 'X', permisos: ['afiliados.todo'] }).success).toBe(false);
    const r = rolSchema.parse({
      nombre: ' Recepción 2 ',
      permisos: ['afiliados.ver', 'ingresos.registrar', 'afiliados.ver'],
    });
    expect(r).toEqual({ nombre: 'Recepción 2', permisos: ['afiliados.ver', 'ingresos.registrar'] });
  });

  it('usuario: correo en minúsculas, contraseña opcional, sucursales sin repetir', () => {
    const u = usuarioNuevoSchema.parse({
      nombre: 'Laura',
      email: ' Laura@Tienda.CO ',
      password: '',
      rolId: '6f1c2a51-3b7e-4c2f-9a10-5d2e8f4b7c01',
      sucursalIds: ['6f1c2a51-3b7e-4c2f-9a10-5d2e8f4b7c02', '6f1c2a51-3b7e-4c2f-9a10-5d2e8f4b7c02'],
    });
    expect(u.email).toBe('laura@tienda.co');
    expect(u.password).toBeUndefined();
    expect(u.sucursalIds).toHaveLength(1);
  });

  it('sucursal: código de dos dígitos', () => {
    expect(sucursalSchema.safeParse({ codigo: '3', nombre: 'Norte' }).success).toBe(false);
    expect(
      sucursalSchema.parse({ codigo: '03', nombre: 'Norte', direccion: '' }).direccion,
    ).toBeUndefined();
  });
});
