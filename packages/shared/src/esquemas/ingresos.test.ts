import { describe, expect, it } from 'vitest';
import { decidirIngreso, ingresoNuevoSchema, mensajeIngreso } from './ingresos.js';

const mensual = (fin: string, extra = {}) => ({
  tipo: 'MENSUAL',
  fechaInicio: '2026-10-01',
  fechaFin: fin,
  sesionesTotal: null,
  sesionesUsadas: 0,
  congeladaDesde: null,
  ...extra,
});

describe('decidirIngreso', () => {
  it('vigente entra', () => {
    const d = decidirIngreso(mensual('2026-12-30'), '2026-11-17', false);
    expect(d).toMatchObject({ resultado: 'PERMITIDO', estado: 'VIGENTE', descuentaSesion: false });
  });
  it('por vencer entra', () => {
    expect(decidirIngreso(mensual('2026-11-20'), '2026-11-17', false).resultado).toBe('PERMITIDO');
  });
  it('vencida da alerta y cuenta los días', () => {
    const d = decidirIngreso(mensual('2026-11-10'), '2026-11-17', false);
    expect(d).toMatchObject({ resultado: 'ALERTA', estado: 'VENCIDA', diasVencido: 7 });
  });
  it('sin membresía, congelada y aún no iniciada dan alerta', () => {
    expect(decidirIngreso(null, '2026-11-17', false).estado).toBe('SIN_MEMBRESIA');
    const c = decidirIngreso(
      mensual('2026-12-30', { congeladaDesde: '2026-11-10' }),
      '2026-11-17',
      false,
    );
    expect(c).toMatchObject({ resultado: 'ALERTA', estado: 'CONGELADA' });
    const f = decidirIngreso(
      mensual('2026-12-30', { fechaInicio: '2026-11-20' }),
      '2026-11-17',
      false,
    );
    expect(f.resultado).toBe('ALERTA');
  });
  it('la tiquetera gasta una sesión por día', () => {
    const t = mensual('2026-12-30', { sesionesTotal: 10, sesionesUsadas: 3 });
    expect(decidirIngreso(t, '2026-11-17', false).descuentaSesion).toBe(true);
    expect(decidirIngreso(t, '2026-11-17', true).descuentaSesion).toBe(false);
  });
  it('tiquetera sin sesiones queda agotada', () => {
    const t = mensual('2026-12-30', { sesionesTotal: 10, sesionesUsadas: 10 });
    expect(decidirIngreso(t, '2026-11-17', false)).toMatchObject({
      resultado: 'ALERTA',
      estado: 'AGOTADA',
      descuentaSesion: false,
    });
  });
});

describe('ingresoNuevoSchema', () => {
  it('normaliza el documento y asume tablet', () => {
    const r = ingresoNuevoSchema.parse({ documento: ' 1.085.123 ' });
    expect(r.documento).toBe('1085123');
    expect(r.origen).toBe('TABLET');
  });
  it('rechaza id que no es UUID', () => {
    expect(ingresoNuevoSchema.safeParse({ documento: '12345', id: 'x' }).success).toBe(false);
  });
});

describe('mensajeIngreso', () => {
  it('saluda o manda a recepción', () => {
    expect(
      mensajeIngreso({
        resultado: 'PERMITIDO',
        estadoMembresia: 'VIGENTE',
        diasVencido: 0,
        venceEl: null,
      }),
    ).toBe('Bienvenido');
    expect(
      mensajeIngreso({
        resultado: 'ALERTA',
        estadoMembresia: 'VENCIDA',
        diasVencido: 3,
        venceEl: '2026-11-10',
      }),
    ).toContain('recepción');
  });
});
