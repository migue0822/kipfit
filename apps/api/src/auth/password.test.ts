import { describe, expect, it } from 'vitest';
import { hashPassword, verificarPassword } from './password';
import { generarToken, hashToken } from './sesiones.service';

describe('contraseñas', () => {
  it('verifica la contraseña correcta y rechaza otra', async () => {
    const hash = await hashPassword('una-clave-segura');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verificarPassword(hash, 'una-clave-segura')).resolves.toBe(true);
    await expect(verificarPassword(hash, 'otra-clave')).resolves.toBe(false);
  });

  it('no lanza con un hash corrupto', async () => {
    await expect(verificarPassword('no-es-un-hash', 'x')).resolves.toBe(false);
  });
});

describe('tokens de sesión', () => {
  it('genera tokens distintos y guarda solo su hash', () => {
    const a = generarToken();
    const b = generarToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toContain(a);
  });
});
