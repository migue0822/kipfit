import {
  enlaceWhatsApp,
  ETIQUETA_MEDIO,
  mensajeVencimiento,
  type FilaVencimiento,
  type InformeCajas,
  type InformeCobros,
  type InformeIngresos,
  type InformeTienda,
  type InformeVencimientos,
  type Perfil,
} from '@kip/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { EncabezadoPagina, Segmentos } from '../componentes';
import { formatoFecha, formatoFechaHora, formatoPesos, hoyBogota } from '../formato';
import { Aviso, Boton, Campo } from '../ui';

type Pestana = 'cobros' | 'ingresos' | 'vencimientos' | 'cajas' | 'tienda';

function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Períodos rápidos: hoy, 7 días, este mes, mes anterior. */
function periodoRapido(clave: string): { desde: string; hasta: string } {
  const hoy = hoyBogota();
  const [a, m] = hoy.split('-').map(Number) as [number, number];
  const mes = (aa: number, mm: number) => `${aa}-${String(mm).padStart(2, '0')}`;
  if (clave === 'hoy') return { desde: hoy, hasta: hoy };
  if (clave === '7') return { desde: sumarDias(hoy, -6), hasta: hoy };
  if (clave === 'mes') return { desde: `${mes(a, m)}-01`, hasta: hoy };
  const ma = m === 1 ? a - 1 : a;
  const mm = m === 1 ? 12 : m - 1;
  const ultimo = sumarDias(`${mes(a, m)}-01`, -1);
  return { desde: `${mes(ma, mm)}-01`, hasta: ultimo };
}

/** Descarga un CSV que Excel abre bien (BOM, separador `;`, números con coma decimal). */
function descargarCsv(nombre: string, filas: (string | number)[][]) {
  const celda = (v: string | number) => {
    const t = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texto = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

const num = (v: string) => v.replace('.', ',');

function Cifra({ titulo, valor, nota }: { titulo: string; valor: ReactNode; nota?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-500">{titulo}</p>
      <p className="mt-1 text-xl font-semibold text-stone-900">{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-stone-500">{nota}</p>}
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white">
      <h3 className="border-b border-stone-100 px-4 py-2 text-sm font-medium text-stone-700">
        {titulo}
      </h3>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Tabla({ cabeza, filas }: { cabeza: string[]; filas: ReactNode[][] }) {
  if (filas.length === 0) return <p className="px-4 py-3 text-sm text-stone-500">Sin datos.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-stone-500">
          {cabeza.map((c, i) => (
            <th key={c} className={`px-4 py-2 font-medium ${i > 0 ? 'text-right' : ''}`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {filas.map((f, i) => (
          <tr key={i}>
            {f.map((c, j) => (
              <td key={j} className={`px-4 py-2 ${j > 0 ? 'text-right tabular-nums' : ''}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Estado({ q }: { q: { isPending: boolean; isError: boolean; error: Error | null } }) {
  if (q.isPending) return <p className="text-sm text-stone-500">Cargando…</p>;
  if (q.isError) return <Aviso>{q.error?.message}</Aviso>;
  return null;
}

function FiltroPeriodo({
  periodo,
  onCambio,
}: {
  periodo: { desde: string; hasta: string };
  onCambio: (p: { desde: string; hasta: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <div className="flex gap-1.5">
        {[
          ['hoy', 'Hoy'],
          ['7', '7 días'],
          ['mes', 'Este mes'],
          ['ant', 'Mes anterior'],
        ].map(([k, t]) => (
          <button
            key={k}
            type="button"
            onClick={() => onCambio(periodoRapido(k!))}
            className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
          >
            {t}
          </button>
        ))}
      </div>
      <Campo
        etiqueta="Desde"
        type="date"
        value={periodo.desde}
        max={periodo.hasta}
        onChange={(e) => onCambio({ ...periodo, desde: e.target.value })}
      />
      <Campo
        etiqueta="Hasta"
        type="date"
        value={periodo.hasta}
        min={periodo.desde}
        onChange={(e) => onCambio({ ...periodo, hasta: e.target.value })}
      />
    </div>
  );
}

function Cobros({ periodo }: { periodo: { desde: string; hasta: string } }) {
  const q = useQuery({
    queryKey: ['informes', 'cobros', periodo],
    queryFn: () =>
      api<InformeCobros>(`/informes/cobros?desde=${periodo.desde}&hasta=${periodo.hasta}`),
  });
  const d = q.data;
  return (
    <div className="space-y-4">
      <Estado q={q} />
      {d && (
        <>
          <div className="flex justify-end print:hidden">
            <Boton
              variante="secundario"
              onClick={() =>
                descargarCsv(`cobros-${d.desde}-a-${d.hasta}.csv`, [
                  ['Fecha', 'Recibos', 'Valor'],
                  ...d.porDia.map((x) => [x.fecha, x.recibos, num(x.valor)]),
                  [],
                  ['Medio', 'Valor'],
                  ...d.porMedio.map((x) => [ETIQUETA_MEDIO[x.medio], num(x.valor)]),
                  [],
                  ['Plan', 'Cantidad', 'Valor'],
                  ...d.porPlan.map((x) => [x.plan, x.cantidad, num(x.valor)]),
                ])
              }
            >
              Descargar Excel (CSV)
            </Boton>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Cifra titulo="Total cobrado" valor={formatoPesos(d.total)} />
            <Cifra titulo="Recibos" valor={d.recibos} />
            <Cifra titulo="Recibos anulados" valor={d.anulados} nota="No suman al total" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bloque titulo="Por medio de pago">
              <Tabla
                cabeza={['Medio', 'Valor']}
                filas={d.porMedio.map((m) => [ETIQUETA_MEDIO[m.medio], formatoPesos(m.valor)])}
              />
            </Bloque>
            <Bloque titulo="Por plan">
              <Tabla
                cabeza={['Plan', 'Cantidad', 'Valor']}
                filas={d.porPlan.map((p) => [p.plan, p.cantidad, formatoPesos(p.valor)])}
              />
            </Bloque>
          </div>
          <Bloque titulo="Por día">
            <Tabla
              cabeza={['Fecha', 'Recibos', 'Valor']}
              filas={d.porDia.map((x) => [formatoFecha(x.fecha), x.recibos, formatoPesos(x.valor)])}
            />
          </Bloque>
        </>
      )}
    </div>
  );
}

function Ingresos({ periodo }: { periodo: { desde: string; hasta: string } }) {
  const q = useQuery({
    queryKey: ['informes', 'ingresos', periodo],
    queryFn: () =>
      api<InformeIngresos>(`/informes/ingresos?desde=${periodo.desde}&hasta=${periodo.hasta}`),
  });
  const d = q.data;
  const maxHora = Math.max(1, ...(d?.porHora.map((h) => h.total) ?? [1]));
  return (
    <div className="space-y-4">
      <Estado q={q} />
      {d && (
        <>
          <div className="flex justify-end print:hidden">
            <Boton
              variante="secundario"
              onClick={() =>
                descargarCsv(`ingresos-${d.desde}-a-${d.hasta}.csv`, [
                  ['Fecha', 'Ingresos', 'Con alerta'],
                  ...d.porDia.map((x) => [x.fecha, x.total, x.alertas]),
                  [],
                  ['Hora', 'Ingresos'],
                  ...d.porHora.map((h) => [`${h.hora}:00`, h.total]),
                  [],
                  ['Afiliado', 'Documento', 'Ingresos'],
                  ...d.masAsiduos.map((x) => [x.nombre, x.documento, x.ingresos]),
                ])
              }
            >
              Descargar Excel (CSV)
            </Boton>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Cifra titulo="Ingresos" valor={d.total} />
            <Cifra titulo="Personas distintas" valor={d.afiliados} />
            <Cifra titulo="Con alerta" valor={d.alertas} nota="Sin membresía vigente" />
          </div>
          <Bloque titulo="Ingresos por hora (hora pico)">
            <ul className="space-y-1 px-4 py-3">
              {d.porHora
                .filter((h) => h.hora >= 5 && h.hora <= 23)
                .map((h) => (
                  <li key={h.hora} className="flex items-center gap-2 text-xs">
                    <span className="w-10 text-stone-500 tabular-nums">{h.hora}:00</span>
                    <span
                      className="h-3 rounded-sm bg-amber-500"
                      style={{ width: `${(h.total / maxHora) * 70}%`, minWidth: h.total ? 3 : 0 }}
                    />
                    <span className="tabular-nums text-stone-700">{h.total}</span>
                  </li>
                ))}
            </ul>
          </Bloque>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bloque titulo="Por día">
              <Tabla
                cabeza={['Fecha', 'Ingresos', 'Alertas']}
                filas={d.porDia.map((x) => [formatoFecha(x.fecha), x.total, x.alertas])}
              />
            </Bloque>
            <Bloque titulo="Más asiduos">
              <Tabla
                cabeza={['Afiliado', 'Ingresos']}
                filas={d.masAsiduos.map((x) => [`${x.nombre} · ${x.documento}`, x.ingresos])}
              />
            </Bloque>
          </div>
        </>
      )}
    </div>
  );
}

function FilaWhatsApp({ f, empresa }: { f: FilaVencimiento; empresa: string }) {
  const url = enlaceWhatsApp(f.telefono, mensajeVencimiento(f.nombre, empresa, f.fechaFin, f.dias));
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 print:hidden"
    >
      WhatsApp
    </a>
  ) : (
    <span className="text-xs text-stone-400 print:hidden">Sin celular</span>
  );
}

function Vencimientos({ empresa }: { empresa: string }) {
  const [dias, setDias] = useState('15');
  const [vencidasDias, setVencidasDias] = useState('30');
  const q = useQuery({
    queryKey: ['informes', 'vencimientos', dias, vencidasDias],
    queryFn: () =>
      api<InformeVencimientos>(
        `/informes/vencimientos?dias=${Number(dias) || 15}&vencidasDias=${Number(vencidasDias) || 30}`,
      ),
  });
  const d = q.data;
  const tabla = (filas: FilaVencimiento[]) => (
    <Tabla
      cabeza={['Afiliado', 'Plan', 'Vence', 'Días', 'Celular', '']}
      filas={filas.map((f) => [
        `${f.nombre} · ${f.documento}`,
        f.plan,
        formatoFecha(f.fechaFin),
        f.dias,
        f.telefono ?? '—',
        <FilaWhatsApp key={f.afiliadoId} f={f} empresa={empresa} />,
      ])}
    />
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Campo
          etiqueta="Por vencer en (días)"
          type="number"
          min={1}
          max={90}
          value={dias}
          onChange={(e) => setDias(e.target.value)}
        />
        <Campo
          etiqueta="Vencidas hace (días)"
          type="number"
          min={1}
          max={365}
          value={vencidasDias}
          onChange={(e) => setVencidasDias(e.target.value)}
        />
        {d && (
          <Boton
            variante="secundario"
            onClick={() =>
              descargarCsv(`vencimientos-${d.hoy}.csv`, [
                ['Situación', 'Afiliado', 'Documento', 'Celular', 'Plan', 'Vence', 'Días'],
                ...d.porVencer.map((f) => [
                  'Por vencer',
                  f.nombre,
                  f.documento,
                  f.telefono ?? '',
                  f.plan,
                  f.fechaFin,
                  f.dias,
                ]),
                ...d.vencidas.map((f) => [
                  'Vencida',
                  f.nombre,
                  f.documento,
                  f.telefono ?? '',
                  f.plan,
                  f.fechaFin,
                  f.dias,
                ]),
              ])
            }
          >
            Descargar Excel (CSV)
          </Boton>
        )}
      </div>
      <Estado q={q} />
      {d && (
        <>
          <Bloque titulo={`Por vencer (${d.porVencer.length})`}>{tabla(d.porVencer)}</Bloque>
          <Bloque titulo={`Vencidas (${d.vencidas.length})`}>{tabla(d.vencidas)}</Bloque>
          <p className="text-xs text-stone-500 print:hidden">
            El botón de WhatsApp abre la conversación con el mensaje escrito; usted solo pulsa
            «Enviar». Solo funciona con celulares colombianos.
          </p>
        </>
      )}
    </div>
  );
}

function Cajas({ periodo }: { periodo: { desde: string; hasta: string } }) {
  const q = useQuery({
    queryKey: ['informes', 'cajas', periodo],
    queryFn: () =>
      api<InformeCajas>(`/informes/cajas?desde=${periodo.desde}&hasta=${periodo.hasta}`),
  });
  const d = q.data;
  return (
    <div className="space-y-4">
      <Estado q={q} />
      {d && (
        <>
          <div className="flex justify-end print:hidden">
            <Boton
              variante="secundario"
              onClick={() =>
                descargarCsv(`cajas-${d.desde}-a-${d.hasta}.csv`, [
                  [
                    'Caja',
                    'Cajero',
                    'Abierta',
                    'Cerrada',
                    'Base',
                    'Cobros efectivo',
                    'Otros medios',
                    'Ingresos',
                    'Egresos',
                    'Esperado',
                    'Contado',
                    'Diferencia',
                    'Observaciones',
                  ],
                  ...d.turnos.map((t) => [
                    t.numero,
                    t.cajero,
                    t.abiertoEn,
                    t.cerradoEn ?? '',
                    num(t.base),
                    num(t.cobrosEfectivo),
                    num(t.otrosMedios),
                    num(t.ingresos),
                    num(t.egresos),
                    num(t.esperado),
                    t.contado ? num(t.contado) : '',
                    t.diferencia ? num(t.diferencia) : '',
                    t.observaciones ?? '',
                  ]),
                ])
              }
            >
              Descargar Excel (CSV)
            </Boton>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Cifra
              titulo="Cobros del período"
              valor={formatoPesos(d.cobrosTotal)}
              nota="Todos los medios"
            />
            <Cifra
              titulo="Diferencia acumulada"
              valor={formatoPesos(d.diferenciaTotal)}
              nota="Cajas cerradas; faltante en negativo"
            />
            <Cifra titulo="Cajas sin cerrar" valor={d.abiertas} />
          </div>
          <Bloque titulo="Cajas del período">
            <Tabla
              cabeza={['Caja', 'Cajero', 'Efectivo esperado', 'Contado', 'Diferencia', 'Estado']}
              filas={d.turnos.map((t) => [
                `${t.numero} · ${formatoFechaHora(t.abiertoEn)}`,
                t.cajero,
                formatoPesos(t.esperado),
                t.contado ? formatoPesos(t.contado) : '—',
                t.diferencia ? formatoPesos(t.diferencia) : '—',
                t.estado === 'ABIERTO' ? 'Abierta' : 'Cerrada',
              ])}
            />
          </Bloque>
        </>
      )}
    </div>
  );
}

/** Informes: cobros, ingresos, membresías por vencer (con WhatsApp) y cierres de caja. */
function TiendaInforme({ periodo }: { periodo: { desde: string; hasta: string } }) {
  const q = useQuery({
    queryKey: ['informes', 'tienda', periodo],
    queryFn: () =>
      api<InformeTienda>(`/informes/tienda?desde=${periodo.desde}&hasta=${periodo.hasta}`),
  });
  const d = q.data;
  const conCostos = d?.costo != null;
  return (
    <div className="space-y-4">
      <Estado q={q} />
      {d && (
        <>
          <div className="flex justify-end print:hidden">
            <Boton
              variante="secundario"
              onClick={() =>
                descargarCsv(`tienda-${d.desde}-a-${d.hasta}.csv`, [
                  ['Fecha', 'Neto', ...(conCostos ? ['Costo'] : [])],
                  ...d.porDia.map((x) => [
                    x.fecha,
                    num(x.neto),
                    ...(x.costo ? [num(x.costo)] : []),
                  ]),
                  [],
                  ['Producto', 'Unidades', 'Neto', ...(conCostos ? ['Costo'] : [])],
                  ...d.porProducto.map((x) => [
                    x.producto,
                    x.unidades,
                    num(x.neto),
                    ...(x.costo ? [num(x.costo)] : []),
                  ]),
                  [],
                  ['Medio', 'Valor'],
                  ...d.porMedio.map((x) => [
                    x.medio === 'DEVOLUCIONES' ? 'Devoluciones' : ETIQUETA_MEDIO[x.medio],
                    num(x.valor),
                  ]),
                ])
              }
            >
              Descargar Excel (CSV)
            </Boton>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cifra
              titulo="Ventas netas"
              valor={formatoPesos(d.neto)}
              nota="Vendido menos devuelto"
            />
            <Cifra
              titulo="Ventas / devoluciones"
              valor={`${d.ventas} / ${d.devoluciones}`}
              nota={`${d.unidades} unidades netas`}
            />
            {conCostos && (
              <Cifra
                titulo="Utilidad"
                valor={formatoPesos(d.utilidad!)}
                nota={`Costo ${formatoPesos(d.costo!)}`}
              />
            )}
            {conCostos && (
              <Cifra titulo="Margen" valor={d.margen ? `${d.margen.replace('.', ',')} %` : '—'} />
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bloque titulo="Por medio de pago">
              <Tabla
                cabeza={['Medio', 'Valor']}
                filas={d.porMedio.map((m) => [
                  m.medio === 'DEVOLUCIONES' ? 'Devoluciones' : ETIQUETA_MEDIO[m.medio],
                  formatoPesos(m.valor),
                ])}
              />
            </Bloque>
            <Bloque titulo="Por día">
              <Tabla
                cabeza={['Fecha', 'Neto', ...(conCostos ? ['Costo'] : [])]}
                filas={d.porDia.map((x) => [
                  formatoFecha(x.fecha),
                  formatoPesos(x.neto),
                  ...(x.costo ? [formatoPesos(x.costo)] : []),
                ])}
              />
            </Bloque>
          </div>
          <Bloque titulo="Por producto">
            <Tabla
              cabeza={['Producto', 'Unidades', 'Neto', ...(conCostos ? ['Costo'] : [])]}
              filas={d.porProducto.map((x) => [
                x.producto,
                x.unidades,
                formatoPesos(x.neto),
                ...(x.costo ? [formatoPesos(x.costo)] : []),
              ])}
            />
          </Bloque>
        </>
      )}
    </div>
  );
}

export function Informes({ perfil }: { perfil: Perfil }) {
  const [pestana, setPestana] = useState<Pestana>('cobros');
  const [periodo, setPeriodo] = useState(() => periodoRapido('mes'));
  const empresa = perfil.empresa?.razonSocial ?? 'el gimnasio';
  return (
    <>
      <EncabezadoPagina
        titulo="Informes"
        descripcion="De la sucursal que tiene seleccionada. Las fechas son de Colombia."
        accion={
          <Boton variante="secundario" onClick={() => window.print()}>
            Imprimir
          </Boton>
        }
      />
      <div className="mb-4 space-y-3 print:hidden">
        <Segmentos
          etiqueta="Informe"
          valor={pestana}
          onCambio={setPestana}
          opciones={[
            { valor: 'cobros', texto: 'Cobros' },
            { valor: 'ingresos', texto: 'Ingresos' },
            { valor: 'vencimientos', texto: 'Vencimientos' },
            { valor: 'cajas', texto: 'Cajas' },
            { valor: 'tienda', texto: 'Tienda' },
          ]}
        />
        {pestana !== 'vencimientos' && <FiltroPeriodo periodo={periodo} onCambio={setPeriodo} />}
      </div>
      {pestana === 'cobros' && <Cobros periodo={periodo} />}
      {pestana === 'ingresos' && <Ingresos periodo={periodo} />}
      {pestana === 'vencimientos' && <Vencimientos empresa={empresa} />}
      {pestana === 'cajas' && <Cajas periodo={periodo} />}
      {pestana === 'tienda' && <TiendaInforme periodo={periodo} />}
    </>
  );
}
