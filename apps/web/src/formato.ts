const pesos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const pesosCentavos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "18900.00" → "$ 18.900"; "76841.50" → "$ 76.841,50". Solo para mostrar. */
export function formatoPesos(valor: string): string {
  const n = Number(valor);
  return (Number.isInteger(n) ? pesos : pesosCentavos).format(n);
}

const cantidad = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });

/** "25.0000" → "25", "2.5000" → "2,5", "1250.0000" → "1.250". */
export function formatoCantidad(valor: string): string {
  return cantidad.format(Number(valor));
}

const fechaHora = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Instante UTC → fecha y hora de Colombia, ej.: "11 oct 2026, 5:30 p. m." */
export function formatoFechaHora(iso: string): string {
  return fechaHora.format(new Date(iso));
}

/** Fecha de hoy en Colombia como AAAA-MM-DD. */
export function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

/** "18900.00" → "18900" y "18900.50" → "18900,50", para mostrar en un campo editable. */
export function decimalParaCampo(valor: string): string {
  return valor
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1')
    .replace('.', ',');
}

const fechaCorta = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** "2026-11-10" → "10 nov 2026" (fechas sin hora, como el vencimiento). */
export function formatoFecha(fecha: string): string {
  return fechaCorta.format(new Date(`${fecha}T00:00:00Z`));
}

/** Días entre hoy (Colombia) y una fecha AAAA-MM-DD; negativo si ya pasó. */
export function diasHasta(fecha: string): number {
  return Math.round(
    (Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoyBogota()}T00:00:00Z`)) / 864e5,
  );
}

/** Solo la hora (Bogotá): "3:45 p. m.". */
export function formatoHora(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Formatea mientras se escribe un valor en pesos: separador de miles con punto y decimales con coma
 * (como lo lee `normalizarDecimal`). "1500000" → "1.500.000"; "1500,5" → "1.500,5".
 */
export function conMiles(texto: string): string {
  const limpio = texto.replace(/[^\d,]/g, '');
  const coma = limpio.indexOf(',');
  const entero = (coma === -1 ? limpio : limpio.slice(0, coma)).replace(/^0+(?=\d)/, '');
  const decimales =
    coma === -1
      ? null
      : limpio
          .slice(coma + 1)
          .replace(/,/g, '')
          .slice(0, 2);
  const agrupado = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimales === null ? agrupado : `${agrupado || '0'},${decimales}`;
}
