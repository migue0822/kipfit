import { normalizarDecimal } from '@kip/shared';
import { describe, expect, it } from 'vitest';
import { conMiles } from './formato';

describe('conMiles (valores en pesos mientras se escriben)', () => {
  it('separa los miles con punto y deja los decimales con coma', () => {
    expect(conMiles('1500000')).toBe('1.500.000');
    expect(conMiles('1.500.0000')).toBe('15.000.000');
    expect(conMiles('1500,5')).toBe('1.500,5');
    expect(conMiles('1500,567')).toBe('1.500,56');
    expect(conMiles(',5')).toBe('0,5');
    expect(conMiles('007')).toBe('7');
    expect(conMiles('abc')).toBe('');
  });

  it('lo formateado se lee igual que lo digitado', () => {
    expect(normalizarDecimal(conMiles('1500000'))).toBe('1500000');
    expect(normalizarDecimal(conMiles('2500,75'))).toBe('2500.75');
  });
});
