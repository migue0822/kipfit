import { describe, expect, it } from 'vitest';
import { loginSchema, registroSchema } from './auth.js';
import { tienePermiso } from '../permisos.js';

const registroValido = {
  empresa: { nit: '800197268', dv: 4, razonSocial: 'Gimnasio La Granja S.A.S.' },
  usuario: { nombre: 'Ana Pérez', email: ' Ana@Ejemplo.COM ', password: 'una-clave-segura' },
} as const;

describe('registroSchema', () => {
  it('acepta un registro válido, normaliza el correo y crea la sucursal Principal', () => {
    const r = registroSchema.parse(registroValido);
    expect(r.usuario.email).toBe('ana@ejemplo.com');
    expect(r.sucursal.nombre).toBe('Principal');
  });

  it('rechaza un DV que no corresponde al NIT', () => {
    const r = registroSchema.safeParse({
      ...registroValido,
      empresa: { ...registroValido.empresa, dv: 9 },
    });
    expect(r.success).toBe(false);
  });

  it('rechaza contraseñas cortas', () => {
    const r = registroSchema.safeParse({
      ...registroValido,
      usuario: { ...registroValido.usuario, password: 'corta' },
    });
    expect(r.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('normaliza el correo', () => {
    expect(loginSchema.parse({ email: 'X@Y.co', password: 'a' }).email).toBe('x@y.co');
  });
});

describe('tienePermiso', () => {
  it('concede con el permiso exacto o con el comodín', () => {
    expect(tienePermiso(['afiliados.ver'], 'afiliados.ver')).toBe(true);
    expect(tienePermiso(['*'], 'afiliados.editar')).toBe(true);
    expect(tienePermiso(['afiliados.ver'], 'afiliados.editar')).toBe(false);
  });
});
