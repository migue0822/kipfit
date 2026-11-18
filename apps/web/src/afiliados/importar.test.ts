import type { PlanGimnasio } from '@kip/shared';
import { Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';
import { leerArchivo } from './importar';

const PLANES: PlanGimnasio[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    nombre: 'Mensual',
    tipo: 'MENSUAL',
    precio: '80000.00',
    dias: 30,
    sesiones: null,
    activo: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    nombre: 'Tiquetera 10',
    tipo: 'TIQUETERA',
    precio: '30000.00',
    dias: 30,
    sesiones: 10,
    activo: true,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    nombre: 'Viejo',
    tipo: 'MENSUAL',
    precio: '1.00',
    dias: 30,
    sesiones: null,
    activo: false,
  },
];

async function archivo(
  filas: unknown[][],
  cabecera = [
    'Documento',
    'Nombre completo',
    'Teléfono',
    'Fecha de nacimiento',
    'Notas',
    'Plan',
    'Vence el',
    'Sesiones restantes',
  ],
) {
  const libro = new Workbook();
  const h = libro.addWorksheet('Afiliados');
  h.addRow(cabecera);
  filas.forEach((f) => h.addRow(f as never));
  const bytes = await libro.xlsx.writeBuffer();
  return new File([bytes as ArrayBuffer], 'a.xlsx');
}

describe('leerArchivo', () => {
  it('lee filas válidas, con número, fecha de Excel y plan por nombre sin tildes ni mayúsculas', async () => {
    const r = await leerArchivo(
      await archivo([
        [
          1085123456,
          'Ana Gómez',
          3001234567,
          new Date('1990-05-17T00:00:00Z'),
          '',
          'mensual',
          '31/12/2026',
          '',
        ],
        ['1085.123.457', 'Beto Ruiz', '', '', 'Nota', 'TIQUETERA 10', '2026-12-01', 4],
        ['9001', 'Sin plan', '', '', '', '', '', ''],
      ]),
      PLANES,
    );
    expect(r.errores).toEqual([]);
    expect(r.filas).toHaveLength(3);
    expect(r.filas[0]).toMatchObject({
      documento: '1085123456',
      telefono: '3001234567',
      fechaNacimiento: '1990-05-17',
      planId: PLANES[0]!.id,
      venceEl: '2026-12-31',
    });
    expect(r.filas[1]).toMatchObject({
      documento: '1085123457',
      planId: PLANES[1]!.id,
      sesionesRestantes: 4,
    });
    expect(r.filas[2]!.planId).toBeUndefined();
    expect(r.numeros).toEqual([2, 3, 4]);
  });

  it('reporta cada error con su fila y columna, y omite filas vacías', async () => {
    const r = await leerArchivo(
      await archivo([
        ['', '', '', '', '', '', '', ''],
        ['12', 'X', '', '', '', '', '', ''],
        ['5555', 'Con plan raro', '', '', '', 'Inventado', '2026-12-01', ''],
        ['5556', 'Plan inactivo', '', '', '', 'Viejo', '2026-12-01', ''],
        ['5557', 'Sin fecha', '', '', '', 'Mensual', '', ''],
        ['5558', 'Mensual con sesiones', '', '', '', 'Mensual', '2026-12-01', 3],
        ['5559', 'Tiquetera de más', '', '', '', 'Tiquetera 10', '2026-12-01', 11],
        ['5560', 'Primero', '', '', '', '', '', ''],
        ['5561', 'Fecha mala', '', 'ayer', '', '', '', ''],
        ['5560', 'Repetido', '', '', '', '', '', ''],
      ]),
      PLANES,
    );
    expect(r.filas.map((f) => f.documento)).toEqual(['5560']);
    const e = r.errores.map((x) => `${x.fila}:${x.columna}`);
    expect(e).toEqual(
      expect.arrayContaining([
        '3:Documento',
        '4:Plan',
        '5:Plan',
        '6:Vence el',
        '7:Sesiones restantes',
        '8:Sesiones restantes',
        '10:Fecha de nacimiento',
        '11:Documento',
      ]),
    );
  });

  it('exige las columnas Documento y Nombre completo', async () => {
    await expect(leerArchivo(await archivo([], ['Cédula', 'Persona']), PLANES)).rejects.toThrow(
      /Documento/,
    );
  });

  it('las columnas se reconocen por su título, en cualquier orden', async () => {
    const r = await leerArchivo(
      await archivo(
        [['Ana Gómez', '3001', '3109999999']],
        ['Nombre completo', 'Documento', 'Teléfono'],
      ),
      PLANES,
    );
    expect(r.filas[0]).toMatchObject({
      documento: '3001',
      nombre: 'Ana Gómez',
      telefono: '3109999999',
    });
  });
});
