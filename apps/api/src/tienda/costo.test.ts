import { describe, expect, it } from 'vitest';
import { calcularMovimiento, Decimal } from './costo';

const d = (v: string | number) => new Decimal(v);

/** Aplica movimientos en cadena, como lo hace el kardex. */
function kardex(movs: { cantidad: number; costo?: number; valor?: string }[]) {
  let saldoCantidad = d(0);
  let saldoValor = d(0);
  let promedio = d(0);
  const filas = [];
  for (const m of movs) {
    const r = calcularMovimiento({
      saldoCantidad,
      saldoValor,
      promedioAntes: promedio,
      cantidad: d(m.cantidad),
      costoUnitario: m.costo === undefined ? undefined : d(m.costo),
      valor: m.valor === undefined ? undefined : d(m.valor),
    });
    saldoCantidad = r.saldoCantidad;
    saldoValor = r.saldoValor;
    promedio = r.costoPromedio;
    filas.push({
      valor: r.valor.toFixed(2),
      costo: r.costoUnitario.toFixed(4),
      saldo: r.saldoCantidad.toString(),
      saldoValor: r.saldoValor.toFixed(2),
      promedio: r.costoPromedio.toFixed(4),
    });
  }
  return filas;
}

describe('costo promedio ponderado por valor total', () => {
  it('la primera entrada fija el costo y una segunda promedia por cantidad', () => {
    const [a, b] = kardex([
      { cantidad: 10, costo: 1000 },
      { cantidad: 30, costo: 1400 },
    ]);
    expect(a).toMatchObject({ valor: '10000.00', promedio: '1000.0000' });
    // 10.000 + 42.000 = 52.000 / 40 = 1.300
    expect(b).toMatchObject({ saldoValor: '52000.00', promedio: '1300.0000' });
  });

  it('el valor cuadra al peso aunque el promedio tenga decimales infinitos', () => {
    // Varilla de la demo: 120 a 23.400 + 60 a 24.100 = 4.254.000 exactos (promedio 23.633,33…)
    const [, b] = kardex([
      { cantidad: 120, costo: 23400 },
      { cantidad: 60, costo: 24100 },
    ]);
    expect(b).toMatchObject({ saldoValor: '4254000.00', promedio: '23633.3333' });
  });

  it('una salida resta su parte proporcional, sin cambiar el promedio', () => {
    const filas = kardex([
      { cantidad: 120, costo: 23400 },
      { cantidad: 60, costo: 24100 },
      { cantidad: -20 },
    ]);
    // 20 × 4.254.000 / 180 = 472.666,67
    expect(filas[2]).toMatchObject({
      valor: '-472666.67',
      saldoValor: '3781333.33',
      promedio: '23633.3333',
    });
  });

  it('al vender todo, el valor queda exactamente en cero', () => {
    const filas = kardex([
      { cantidad: 3, costo: 100 },
      { cantidad: 1, costo: 101 },
      { cantidad: 2, costo: 99.99 },
      { cantidad: -1 },
      { cantidad: -5 },
    ]);
    expect(filas[4]).toMatchObject({ saldo: '0', saldoValor: '0.00' });
    // La salida final se lleva el resto exacto (600,98 − 100,16 = 500,82).
    expect(filas[4]!.valor).toBe('-500.82');
  });

  it('un traslado mueve el valor exacto: sale y entra lo mismo, el total no cambia', () => {
    const [, , salida] = kardex([
      { cantidad: 120, costo: 23400 },
      { cantidad: 60, costo: 24100 },
      { cantidad: -20 },
    ]);
    const [, , , entrada] = kardex([
      { cantidad: 120, costo: 23400 },
      { cantidad: 60, costo: 24100 },
      { cantidad: -20 },
      { cantidad: 20, valor: salida!.valor.replace('-', '') },
    ]);
    expect(entrada).toMatchObject({ saldoValor: '4254000.00', promedio: '23633.3333' });
  });

  it('anular una entrada retira exactamente su valor', () => {
    const filas = kardex([
      { cantidad: 10, costo: 1000 },
      { cantidad: 30, costo: 1400 },
      { cantidad: -30, valor: '-42000' },
    ]);
    expect(filas[2]).toMatchObject({ saldo: '10', saldoValor: '10000.00', promedio: '1000.0000' });
  });

  it('si la existencia queda en cero conserva el último promedio como referencia', () => {
    const filas = kardex([{ cantidad: 5, costo: 1300 }, { cantidad: -5 }]);
    expect(filas[1]).toMatchObject({ saldoValor: '0.00', promedio: '1300.0000' });
  });

  it('una entrada sin costo es un error de programación', () => {
    expect(() => kardex([{ cantidad: 5 }])).toThrow();
  });
});
