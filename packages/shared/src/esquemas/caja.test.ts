import { describe, expect, it } from 'vitest';
import { aCentavos, calcularCuadre, deCentavos, abrirCajaSchema, pagosSchema } from './caja.js';

describe('centavos', () => {
  it('convierte sin errores de coma flotante', () => {
    expect(aCentavos('80000.50')).toBe(8000050n);
    expect(aCentavos('0.1') + aCentavos('0.2')).toBe(30n);
    expect(deCentavos(8000050n)).toBe('80000.50');
    expect(deCentavos(-5n)).toBe('-0.05');
    expect(deCentavos(aCentavos('12'))).toBe('12.00');
  });
});

describe('calcularCuadre', () => {
  const rec = (estado: string, pagos: [string, string][]) => ({
    estado,
    pagos: pagos.map(([medio, valor]) => ({ medio, valor })),
  });
  it('suma base + efectivo + ingresos − egresos y separa los otros medios', () => {
    const r = calcularCuadre({
      base: '50000',
      recibos: [
        rec('VIGENTE', [
          ['EFECTIVO', '30000'],
          ['NEQUI', '50000'],
        ]),
        rec('VIGENTE', [['EFECTIVO', '80000.50']]),
        rec('ANULADO', [['EFECTIVO', '99999']]),
      ],
      movimientos: [
        { tipo: 'INGRESO', estado: 'VIGENTE', valor: '10000' },
        { tipo: 'EGRESO', estado: 'VIGENTE', valor: '25000' },
        { tipo: 'EGRESO', estado: 'ANULADO', valor: '777' },
      ],
    });
    expect(r.efectivoCobros).toBe('110000.50');
    expect(r.otrosMedios).toEqual({ NEQUI: '50000.00' });
    expect(r.totalCobros).toBe('160000.50');
    expect(r.esperado).toBe('145000.50');
    expect(r.recibos).toBe(2);
    expect(r.recibosAnulados).toBe(1);
  });
  it('un turno vacío espera solo la base', () => {
    expect(calcularCuadre({ base: '20000', recibos: [], movimientos: [] }).esperado).toBe(
      '20000.00',
    );
  });
});

describe('esquemas', () => {
  it('la base es opcional', () => {
    expect(abrirCajaSchema.safeParse({}).success).toBe(true);
  });
  it('los pagos no repiten el medio ni van en cero', () => {
    expect(
      pagosSchema.safeParse([
        { medio: 'EFECTIVO', valor: '1000' },
        { medio: 'EFECTIVO', valor: '1000' },
      ]).success,
    ).toBe(false);
    expect(pagosSchema.safeParse([{ medio: 'EFECTIVO', valor: '0' }]).success).toBe(false);
    expect(pagosSchema.safeParse([{ medio: 'NEQUI', valor: '12.500' }]).success).toBe(true);
  });
});
