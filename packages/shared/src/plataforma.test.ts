import { describe, expect, it } from 'vitest';
import {
  estadoLicencia,
  extenderLicencia,
  mensajeSoloLectura,
  planSchema,
  sumarDias,
  sumarMeses,
} from './plataforma.js';

describe('estadoLicencia', () => {
  it('se usa hasta el último día pagado, incluido', () => {
    expect(
      estadoLicencia({ estado: 'ACTIVA', pagadoHasta: '2026-11-15', hoy: '2026-11-15' }),
    ).toEqual({ soloLectura: false, motivo: null, diasRestantes: 0 });
    expect(
      estadoLicencia({ estado: 'ACTIVA', pagadoHasta: '2026-11-15', hoy: '2026-11-16' }),
    ).toEqual({ soloLectura: true, motivo: 'VENCIDA', diasRestantes: -1 });
  });

  it('sin fecha no vence; suspendida es solo lectura aunque esté pagada', () => {
    expect(
      estadoLicencia({ estado: 'ACTIVA', pagadoHasta: null, hoy: '2026-11-15' }).soloLectura,
    ).toBe(false);
    expect(
      estadoLicencia({ estado: 'SUSPENDIDA', pagadoHasta: '2027-01-01', hoy: '2026-11-15' }).motivo,
    ).toBe('SUSPENDIDA');
  });
});

describe('fechas', () => {
  it('suma días y meses', () => {
    expect(sumarDias('2026-11-20', 15)).toBe('2026-12-05');
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(sumarMeses('2026-11-15', 2)).toBe('2027-01-15');
  });

  it('un pago continúa desde el vencimiento si no ha pasado, si no desde la fecha del pago', () => {
    expect(extenderLicencia('2026-11-20', '2026-11-15', 1)).toBe('2026-12-20');
    expect(extenderLicencia('2026-11-01', '2026-11-15', 3)).toBe('2027-02-15');
    expect(extenderLicencia(null, '2026-11-15', 12)).toBe('2027-11-15');
  });
});

describe('mensajes y esquemas', () => {
  it('distingue la demostración terminada del plan vencido', () => {
    expect(
      mensajeSoloLectura({ motivo: 'VENCIDA', pagadoHasta: '2026-11-15', enDemo: true }),
    ).toMatch(/La demostración terminó el 2026-11-15/);
    expect(
      mensajeSoloLectura({ motivo: 'VENCIDA', pagadoHasta: '2026-11-15', enDemo: false }),
    ).toMatch(/El plan de la empresa venció/);
  });

  it('el plan ignora los módulos que manda la consola de OrdenKipu', () => {
    const p = planSchema.parse({ nombre: 'Básico', precioMensual: '50000', modulos: ['NOMINA'] });
    expect(Object.keys(p).sort()).toEqual([
      'maxSucursales',
      'maxUsuarios',
      'nombre',
      'precioMensual',
    ]);
    expect(Number(p.precioMensual)).toBe(50000);
    expect(p.maxUsuarios).toBeNull();
  });
});
