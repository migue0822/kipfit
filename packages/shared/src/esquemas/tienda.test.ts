import { describe, expect, it } from 'vitest';
import { enlaceWhatsApp } from './informes.js';
import { mensajeVenta } from './tienda.js';

const venta = {
  numero: 'VT01-7',
  fecha: '2026-11-19T13:00:00.000Z',
  total: '12500.50',
  afiliado: 'Ana María Pérez',
  lineas: [{ cantidad: 2, productoNombre: 'Agua 600 ml', total: '6000.00' }],
  pagos: [{ medio: 'EFECTIVO' as const, valor: '12500.50' }],
};

describe('mensajeVenta', () => {
  it('arma el recibo con pesos colombianos', () => {
    const m = mensajeVenta(venta, 'Gym', () => 'Efectivo');
    expect(m).toContain('Hola Ana, gracias por su compra en Gym.');
    expect(m).toContain('Recibo VT01-7 (19/11/2026)');
    expect(m).toContain('• 2 × Agua 600 ml: $6.000');
    expect(m).toContain('*Total: $12.500,50*');
    expect(m).toContain('Pago: Efectivo $12.500,50');
  });
  it('sin afiliado saluda sin nombre y genera el enlace', () => {
    const m = mensajeVenta({ ...venta, afiliado: null }, 'Gym', () => 'Efectivo');
    expect(m.startsWith('Gracias por su compra en Gym.')).toBe(true);
    expect(enlaceWhatsApp('300 123 4567', m)).toMatch(/^https:\/\/wa\.me\/573001234567\?text=/);
  });
});
