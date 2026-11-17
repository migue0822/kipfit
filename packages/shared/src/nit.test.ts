import { describe, expect, it } from 'vitest';
import { calcularDV, nitEsValido } from './nit.js';

describe('calcularDV', () => {
  it('calcula el DV del NIT de la DIAN (800197268-4)', () => {
    expect(calcularDV('800197268')).toBe(4);
  });

  it('ignora puntos y espacios', () => {
    expect(calcularDV('800.197.268')).toBe(4);
  });

  it('rechaza un NIT vacío', () => {
    expect(() => calcularDV('')).toThrow();
  });
});

describe('nitEsValido', () => {
  it('acepta el DV correcto y rechaza uno incorrecto', () => {
    expect(nitEsValido('800197268', 4)).toBe(true);
    expect(nitEsValido('800197268', 5)).toBe(false);
  });
});
