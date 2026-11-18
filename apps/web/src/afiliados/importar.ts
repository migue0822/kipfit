import {
  afiliadoImportarFilaSchema,
  type AfiliadoImportarFila,
  type PlanGimnasio,
} from '@kip/shared';
import type { Cell, Worksheet } from 'exceljs';

export const COLUMNAS = [
  { clave: 'documento', titulo: 'Documento', ancho: 16 },
  { clave: 'nombre', titulo: 'Nombre completo', ancho: 30 },
  { clave: 'telefono', titulo: 'Teléfono', ancho: 16 },
  { clave: 'fechaNacimiento', titulo: 'Fecha de nacimiento', ancho: 20 },
  { clave: 'notas', titulo: 'Notas', ancho: 28 },
  { clave: 'plan', titulo: 'Plan', ancho: 22 },
  { clave: 'venceEl', titulo: 'Vence el', ancho: 14 },
  { clave: 'sesionesRestantes', titulo: 'Sesiones restantes', ancho: 18 },
] as const;
type Clave = (typeof COLUMNAS)[number]['clave'];

export type ErrorFila = { fila: number; columna: string; mensaje: string };
export type LecturaArchivo = {
  filas: AfiliadoImportarFila[];
  errores: ErrorFila[];
  /** Número de fila de Excel de cada elemento de `filas` (para explicar errores del servidor). */
  numeros: number[];
};

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Texto de una celda: números por su valor (sin separadores), fechas como AAAA-MM-DD, fórmulas por su resultado. */
export function textoCelda(c: Cell): string {
  const v = c.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    if ('result' in v && v.result !== undefined && v.result !== null)
      return v.result instanceof Date ? v.result.toISOString().slice(0, 10) : String(v.result);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    return '';
  }
  return String(v).trim();
}

/** Fechas escritas como 31/12/2026 o 31-12-2026 se pasan a AAAA-MM-DD; lo demás se deja para el validador. */
function normalizarFecha(t: string): string {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : t;
}

/** Arma la plantilla .xlsx (hoja Afiliados con un ejemplo, hoja Planes con los nombres válidos, hoja Instrucciones). */
export async function descargarPlantilla(planes: PlanGimnasio[]) {
  const { Workbook } = await import('exceljs');
  const libro = new Workbook();
  const hoja = libro.addWorksheet('Afiliados', { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = COLUMNAS.map((c) => ({ header: c.titulo, key: c.clave, width: c.ancho }));
  const cab = hoja.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF292524' } };
  ['A', 'B'].forEach((l) => {
    hoja.getCell(`${l}1`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFB45309' },
    };
  });
  const activos = planes.filter((p) => p.activo);
  hoja.addRow({
    documento: '1085123456',
    nombre: 'Ana María Gómez (ejemplo: bórrela)',
    telefono: '3001234567',
    fechaNacimiento: '1990-05-17',
    notas: '',
    plan: activos[0]?.nombre ?? '',
    venceEl: '2026-12-31',
    sesionesRestantes: '',
  });
  // Documento y teléfono como texto para que Excel no los convierta en números con notación científica.
  hoja.getColumn('A').numFmt = '@';
  hoja.getColumn('C').numFmt = '@';
  hoja.getColumn('D').numFmt = '@';
  hoja.getColumn('G').numFmt = '@';
  if (activos.length > 0) {
    for (let r = 2; r <= 2000; r++) {
      hoja.getCell(`F${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Planes!$A$2:$A$${activos.length + 1}`],
        showErrorMessage: true,
        errorTitle: 'Plan',
        error: 'Escoja un plan de la lista (hoja Planes).',
      };
    }
  }
  const hp = libro.addWorksheet('Planes');
  hp.columns = [
    { header: 'Plan', key: 'n', width: 28 },
    { header: 'Tipo', key: 't', width: 22 },
    { header: 'Días', key: 'd', width: 8 },
    { header: 'Sesiones', key: 's', width: 10 },
  ];
  hp.getRow(1).font = { bold: true };
  activos.forEach((p) =>
    hp.addRow({
      n: p.nombre,
      t: p.tipo === 'MENSUAL' ? 'Mensual' : 'Tiquetera',
      d: p.dias,
      s: p.sesiones ?? '',
    }),
  );
  const hi = libro.addWorksheet('Instrucciones');
  hi.getColumn('A').width = 110;
  [
    'CÓMO LLENAR LA HOJA «Afiliados»',
    '',
    '1. Una fila por afiliado. Las columnas Documento y Nombre completo (en naranja) son obligatorias; las demás son opcionales.',
    '2. Borre la fila de ejemplo antes de subir el archivo.',
    '3. Documento: solo letras y números (sin puntos ni espacios). Si ya existe un afiliado con ese documento, se deja como está.',
    '4. Fechas: AAAA-MM-DD (ej.: 2026-12-31) o DD/MM/AAAA.',
    '5. Para cargar la membresía que ya tenía, escoja el Plan (lista de la hoja «Planes») y escriba hasta qué día vence («Vence el»).',
    '   Puede ser una fecha ya pasada: el afiliado queda como «Vencido». No se genera cobro ni se toca la caja.',
    '6. Sesiones restantes: solo para planes tiquetera (cuántas sesiones le quedan).',
    '7. Máximo 2.000 filas por archivo. Si alguna fila tiene errores, no se carga ninguna y se le dice cuáles corregir.',
    '8. Los afiliados quedan inscritos en la sucursal que tiene seleccionada ahora.',
  ].forEach((t, i) => {
    const c = hi.getCell(`A${i + 1}`);
    c.value = t;
    if (i === 0) c.font = { bold: true, size: 13 };
  });
  const bytes = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla-afiliados.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

/** Lee la hoja de datos: las columnas se reconocen por su título, así el orden no importa. */
export async function leerArchivo(archivo: File, planes: PlanGimnasio[]): Promise<LecturaArchivo> {
  const { Workbook } = await import('exceljs');
  const libro = new Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const hoja: Worksheet | undefined =
    libro.worksheets.find((h) => sinTildes(h.name) === 'afiliados') ?? libro.worksheets[0];
  if (!hoja) throw new Error('El archivo no tiene hojas.');

  const columnas = new Map<Clave, number>();
  hoja.getRow(1).eachCell((c, n) => {
    const t = sinTildes(textoCelda(c));
    const col = COLUMNAS.find((x) => sinTildes(x.titulo) === t);
    if (col) columnas.set(col.clave, n);
  });
  for (const obligatoria of ['documento', 'nombre'] as const) {
    if (!columnas.has(obligatoria))
      throw new Error(
        `No se encontró la columna «${COLUMNAS.find((c) => c.clave === obligatoria)!.titulo}» en la primera fila. Use la plantilla.`,
      );
  }

  const porNombre = new Map(planes.filter((p) => p.activo).map((p) => [sinTildes(p.nombre), p]));
  const filas: AfiliadoImportarFila[] = [];
  const numeros: number[] = [];
  const errores: ErrorFila[] = [];
  const documentos = new Map<string, number>();

  for (let r = 2; r <= hoja.rowCount; r++) {
    const fila = hoja.getRow(r);
    const dato = (k: Clave) => (columnas.has(k) ? textoCelda(fila.getCell(columnas.get(k)!)) : '');
    if (COLUMNAS.every((c) => dato(c.clave) === '')) continue;

    const nombrePlan = dato('plan');
    let planId: string | undefined;
    if (nombrePlan) {
      const plan = porNombre.get(sinTildes(nombrePlan));
      if (!plan) {
        errores.push({
          fila: r,
          columna: 'Plan',
          mensaje: `«${nombrePlan}» no es un plan activo (revise la hoja Planes)`,
        });
        continue;
      }
      planId = plan.id;
      const rest = dato('sesionesRestantes');
      if (rest !== '' && plan.sesiones === null) {
        errores.push({
          fila: r,
          columna: 'Sesiones restantes',
          mensaje: `«${plan.nombre}» no es tiquetera`,
        });
        continue;
      }
      if (rest !== '' && plan.sesiones !== null && Number(rest) > plan.sesiones) {
        errores.push({
          fila: r,
          columna: 'Sesiones restantes',
          mensaje: `«${plan.nombre}» trae ${plan.sesiones} sesiones`,
        });
        continue;
      }
    }

    const r1 = afiliadoImportarFilaSchema.safeParse({
      documento: dato('documento'),
      nombre: dato('nombre'),
      telefono: dato('telefono'),
      fechaNacimiento: normalizarFecha(dato('fechaNacimiento')),
      notas: dato('notas'),
      planId,
      venceEl: normalizarFecha(dato('venceEl')),
      sesionesRestantes: dato('sesionesRestantes'),
    });
    if (!r1.success) {
      const titulos: Record<string, string> = {
        documento: 'Documento',
        nombre: 'Nombre completo',
        telefono: 'Teléfono',
        fechaNacimiento: 'Fecha de nacimiento',
        notas: 'Notas',
        planId: 'Plan',
        venceEl: 'Vence el',
        sesionesRestantes: 'Sesiones restantes',
      };
      for (const i of r1.error.issues)
        errores.push({ fila: r, columna: titulos[String(i.path[0])] ?? '', mensaje: i.message });
      continue;
    }
    const previa = documentos.get(r1.data.documento);
    if (previa !== undefined) {
      errores.push({
        fila: r,
        columna: 'Documento',
        mensaje: `${r1.data.documento} ya está en la fila ${previa}`,
      });
      continue;
    }
    documentos.set(r1.data.documento, r);
    filas.push(r1.data);
    numeros.push(r);
  }
  return { filas, errores, numeros };
}
