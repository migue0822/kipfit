import { hash, verify } from '@node-rs/argon2';

// Argon2id con los parámetros recomendados por OWASP (19 MiB, 2 iteraciones).
const OPCIONES = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPCIONES);
}

export async function verificarPassword(hashGuardado: string, password: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, password);
  } catch {
    return false;
  }
}

// Hash de referencia para gastar el mismo tiempo cuando el usuario no existe
// y así no revelar qué correos están registrados.
let hashFicticio: Promise<string> | undefined;
export function hashDeRelleno(): Promise<string> {
  hashFicticio ??= hashPassword('relleno-para-tiempo-constante');
  return hashFicticio;
}
