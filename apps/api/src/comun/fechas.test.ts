import { describe, expect, it } from 'vitest';
import { finDiaBogota, hoyBogota, inicioDiaBogota, sumarDias } from './fechas';

describe('fechas en hora de Colombia', () => {
  it('el día en Colombia cambia a las 5 a. m. UTC', () => {
    // 11 oct 2026 23:30 en Bogotá = 12 oct 04:30 UTC: todavía es 11 en Colombia.
    expect(hoyBogota(new Date('2026-10-12T04:30:00Z'))).toBe('2026-10-11');
    expect(hoyBogota(new Date('2026-10-12T05:00:00Z'))).toBe('2026-10-12');
  });

  it('un día de Bogotá va de 05:00 UTC a 05:00 UTC del día siguiente', () => {
    expect(inicioDiaBogota('2026-10-11').toISOString()).toBe('2026-10-11T05:00:00.000Z');
    expect(finDiaBogota('2026-10-11').toISOString()).toBe('2026-10-12T05:00:00.000Z');
  });

  it('suma días cruzando meses y años (vencimientos a crédito)', () => {
    expect(sumarDias('2026-10-11', 30)).toBe('2026-11-10');
    expect(sumarDias('2026-12-15', 30)).toBe('2027-01-14');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
  });
});
