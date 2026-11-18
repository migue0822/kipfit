import { describe, expect, it } from 'vitest';
import {
  celularWhatsApp,
  enlaceWhatsApp,
  mensajeVencimiento,
  periodoSchema,
  vencimientosQuerySchema,
} from './informes.js';

describe('periodoSchema', () => {
  it('acepta un rango válido', () => {
    expect(periodoSchema.safeParse({ desde: '2026-11-01', hasta: '2026-11-30' }).success).toBe(
      true,
    );
  });
  it('rechaza invertido o demasiado largo', () => {
    expect(periodoSchema.safeParse({ desde: '2026-11-30', hasta: '2026-11-01' }).success).toBe(
      false,
    );
    expect(periodoSchema.safeParse({ desde: '2025-01-01', hasta: '2026-11-30' }).success).toBe(
      false,
    );
  });
});

describe('vencimientosQuerySchema', () => {
  it('trae valores por defecto', () => {
    expect(vencimientosQuerySchema.parse({})).toEqual({ dias: 15, vencidasDias: 30 });
  });
});

describe('WhatsApp', () => {
  it('agrega el 57 a un celular colombiano', () => {
    expect(celularWhatsApp('318 377 6896')).toBe('573183776896');
    expect(celularWhatsApp('+57 319 377 6896')).toBe('573193776896');
  });
  it('no ofrece números que no son celular', () => {
    expect(celularWhatsApp('7234567')).toBeNull();
    expect(celularWhatsApp(null)).toBeNull();
    expect(enlaceWhatsApp('', 'hola')).toBeNull();
  });
  it('arma el enlace con el mensaje codificado', () => {
    expect(enlaceWhatsApp('3001234567', 'Hola ñ')).toBe(
      'https://wa.me/573001234567?text=Hola%20%C3%B1',
    );
  });
  it('el mensaje depende de los días', () => {
    expect(mensajeVencimiento('Ana María Pérez', 'Gym', '2026-12-05', 3)).toContain('en 3 días');
    expect(mensajeVencimiento('Ana', 'Gym', '2026-12-05', 1)).toContain('en 1 día)');
    expect(mensajeVencimiento('Ana', 'Gym', '2026-12-05', 0)).toContain('vence hoy');
    expect(mensajeVencimiento('Ana', 'Gym', '2026-11-20', -5)).toContain('venció el 20/11/2026');
    expect(mensajeVencimiento('Ana María', 'Gym', '2026-12-05', 3)).toContain('Hola Ana,');
  });
});
