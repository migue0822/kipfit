import { describe, expect, it } from 'vitest';
import { decimalSchema, normalizarBusqueda, normalizarDecimal } from './comun.js';

describe('normalizarBusqueda', () => {
  it('quita tildes, pasa a minúsculas y une espacios', () => {
    expect(normalizarBusqueda('  Pedro   GÓMEZ Ñuñez ')).toBe('pedro gomez nunez');
  });
});

describe('normalizarDecimal', () => {
  it.each([
    ['12500', '12500'],
    ['12.500', '12500'],
    ['1.250.000', '1250000'],
    ['12.500,75', '12500.75'],
    ['1500,5', '1500.5'],
    ['19.5', '19.5'],
    ['0.19', '0.19'],
    ['$ 12.500', '12500'],
    ['007', '7'],
    ['0', '0'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarDecimal(entrada)).toBe(esperado);
  });

  it.each(['', 'abc', '12,5,3', '-5', '1e3'])('rechaza %s', (entrada) => {
    expect(normalizarDecimal(entrada)).toBeNull();
  });
});

describe('decimalSchema', () => {
  const precio = decimalSchema({ enteros: 16, decimales: 2, nombre: 'El precio' });
  const tarifa = decimalSchema({ enteros: 3, decimales: 4, max: 100, nombre: 'La tarifa' });

  it('devuelve texto exacto, nunca float', () => {
    expect(precio.parse('12.500,50')).toBe('12500.50');
    expect(precio.parse(0.1)).toBe('0.1');
  });

  it('limita decimales y máximos', () => {
    expect(precio.safeParse('10,123').success).toBe(false);
    expect(tarifa.safeParse('101').success).toBe(false);
    expect(tarifa.parse('19')).toBe('19');
  });
});
