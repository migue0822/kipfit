/**
 * Dígito de verificación (DV) del NIT según el método de la DIAN (módulo 11).
 */
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71] as const;

export function calcularDV(nit: string): number {
  const digitos = nit.replace(/\D/g, '');
  if (digitos.length === 0 || digitos.length > PESOS.length) {
    throw new Error('El NIT debe tener entre 1 y 15 dígitos');
  }

  let suma = 0;
  const invertidos = [...digitos].reverse();
  invertidos.forEach((d, i) => {
    suma += Number(d) * PESOS[i]!;
  });

  const residuo = suma % 11;
  return residuo > 1 ? 11 - residuo : residuo;
}

export function nitEsValido(nit: string, dv: number): boolean {
  try {
    return calcularDV(nit) === dv;
  } catch {
    return false;
  }
}
