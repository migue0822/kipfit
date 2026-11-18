import { describe, expect, it } from 'vitest';
import {
  afiliadoSchema,
  estadoMembresia,
  finMembresia,
  inicioRenovacion,
  planGimnasioSchema,
  type SuscripcionDatos,
} from './afiliados.js';

const base: SuscripcionDatos = {
  tipo: 'MENSUAL',
  fechaInicio: '2026-11-01',
  fechaFin: '2026-11-30',
  sesionesTotal: null,
  sesionesUsadas: 0,
  congeladaDesde: null,
};

describe('estadoMembresia', () => {
  it('sin membresía', () => expect(estadoMembresia(null, '2026-11-17')).toBe('SIN_MEMBRESIA'));
  it('vigente y por vencer (7 días)', () => {
    expect(estadoMembresia(base, '2026-11-17')).toBe('VIGENTE');
    expect(estadoMembresia(base, '2026-11-23')).toBe('POR_VENCER');
    expect(estadoMembresia(base, '2026-11-30')).toBe('POR_VENCER'); // el último día aún entra
  });
  it('vencida al día siguiente del fin', () => {
    expect(estadoMembresia(base, '2026-12-01')).toBe('VENCIDA');
  });
  it('congelada no vence', () => {
    expect(estadoMembresia({ ...base, congeladaDesde: '2026-11-20' }, '2027-02-01')).toBe(
      'CONGELADA',
    );
  });
  it('tiquetera sin sesiones queda agotada', () => {
    const t = { ...base, tipo: 'TIQUETERA', sesionesTotal: 10, sesionesUsadas: 10 };
    expect(estadoMembresia(t, '2026-11-17')).toBe('AGOTADA');
    expect(estadoMembresia({ ...t, sesionesUsadas: 9 }, '2026-11-17')).toBe('VIGENTE');
  });
});

describe('fechas de la membresía', () => {
  it('el día de inicio cuenta: 30 días desde el 1 de noviembre terminan el 30', () => {
    expect(finMembresia('2026-11-01', 30)).toBe('2026-11-30');
    expect(finMembresia('2026-12-15', 1)).toBe('2026-12-15');
  });
  it('la renovación empieza el día siguiente al fin si sigue vigente; si no, hoy', () => {
    expect(inicioRenovacion('2026-11-30', '2026-11-17')).toBe('2026-12-01');
    expect(inicioRenovacion('2026-11-30', '2026-11-30')).toBe('2026-12-01');
    expect(inicioRenovacion('2026-11-10', '2026-11-17')).toBe('2026-11-17');
    expect(inicioRenovacion(null, '2026-11-17')).toBe('2026-11-17');
  });
});

describe('planGimnasioSchema', () => {
  it('mensual: ignora las sesiones y acepta pesos colombianos', () => {
    const p = planGimnasioSchema.parse({
      nombre: 'Mensual',
      tipo: 'MENSUAL',
      precio: '80.000',
      dias: '30',
      sesiones: '5',
    });
    expect(p).toMatchObject({ precio: '80000', dias: 30, sesiones: undefined });
  });
  it('tiquetera exige sesiones', () => {
    const r = planGimnasioSchema.safeParse({
      nombre: 'Tiquetera',
      tipo: 'TIQUETERA',
      precio: '60000',
      dias: 30,
    });
    expect(r.success).toBe(false);
    expect(
      planGimnasioSchema.parse({
        nombre: 'Tiquetera',
        tipo: 'TIQUETERA',
        precio: '60000',
        dias: 30,
        sesiones: 12,
      }).sesiones,
    ).toBe(12);
  });
});

describe('afiliadoSchema', () => {
  it('normaliza el documento y trata los vacíos como ausentes', () => {
    const a = afiliadoSchema.parse({
      documento: '1.085.123-456',
      nombre: ' Ana ',
      telefono: '',
      fechaNacimiento: '',
    });
    expect(a).toMatchObject({ documento: '1085123456', nombre: 'Ana', telefono: undefined });
  });
  it('rechaza documentos con símbolos y teléfonos inválidos', () => {
    expect(afiliadoSchema.safeParse({ documento: '12#45', nombre: 'Ana' }).success).toBe(false);
    expect(
      afiliadoSchema.safeParse({ documento: '12345', nombre: 'Ana', telefono: 'abc' }).success,
    ).toBe(false);
  });
});
