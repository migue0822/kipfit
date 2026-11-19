// Tienda: venta cobrada por la caja (pago combinado), devoluciones, anulaciones, cuadre, kardex, informe y permisos.
import { nuevaEmpresa, sesion, sql, terminar, verificar } from './comun.mjs';

const { a } = await nuevaEmpresa('900666001');
const { a: b } = await nuevaEmpresa('900666002');
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

const agua = (
  await a('POST', '/tienda/productos', {
    codigo: 'AGUA',
    nombre: 'Agua 600 ml',
    precioVenta: '3000',
  })
).datos;
const prot = (
  await a('POST', '/tienda/productos', {
    codigo: 'PROT',
    nombre: 'Proteína',
    precioVenta: '100000',
  })
).datos;
const sinPrecio = (await a('POST', '/tienda/productos', { nombre: 'Sin precio', precioVenta: '0' }))
  .datos;
await a('POST', '/tienda/inventario/entradas', {
  lineas: [
    { productoId: agua.id, cantidad: 20, costoUnitario: '1000' },
    { productoId: prot.id, cantidad: 5, costoUnitario: '60000' },
    { productoId: sinPrecio.id, cantidad: 1, costoUnitario: '10' },
  ],
});

const esperado = async () => (await a('GET', '/caja/actual')).datos.resumen.esperado;
const stock = async (id) => (await a('GET', `/tienda/productos/${id}`)).datos;

// ───────────── Sin caja ─────────────
let r = await a('POST', '/tienda/ventas', {
  lineas: [{ productoId: agua.id, cantidad: 1 }],
  total: '3000',
  pagos: [{ medio: 'EFECTIVO', valor: '3000' }],
});
verificar('vender sin caja abierta → 409', r.estado === 409, JSON.stringify(r.datos));
verificar('la existencia no se movió', (await stock(agua.id)).existencia === 20);

r = await a('POST', '/caja/abrir', { base: '50000' });
verificar('abrir caja', r.estado === 201, JSON.stringify(r.datos));

// ───────────── Validaciones ─────────────
const linea = [
  { productoId: agua.id, cantidad: 3 },
  { productoId: prot.id, cantidad: 1 },
];
verificar(
  'total distinto al calculado (precios cambiaron) → 409',
  (
    await a('POST', '/tienda/ventas', {
      lineas: linea,
      total: '100000',
      pagos: [{ medio: 'EFECTIVO', valor: '100000' }],
    })
  ).estado === 409,
);
verificar(
  'pagos que no suman el total → 400',
  (
    await a('POST', '/tienda/ventas', {
      lineas: linea,
      total: '109000',
      pagos: [{ medio: 'EFECTIVO', valor: '100000' }],
    })
  ).estado === 400,
);
verificar(
  'producto sin precio → 409',
  (
    await a('POST', '/tienda/ventas', {
      lineas: [{ productoId: sinPrecio.id, cantidad: 1 }],
      total: '0',
      pagos: [{ medio: 'EFECTIVO', valor: '1' }],
    })
  ).estado === 409,
);
verificar(
  'más de lo que hay → 400',
  (
    await a('POST', '/tienda/ventas', {
      lineas: [{ productoId: agua.id, cantidad: 21 }],
      total: '63000',
      pagos: [{ medio: 'EFECTIVO', valor: '63000' }],
    })
  ).estado === 400,
);
verificar(
  'recibido menor al efectivo → 400',
  (
    await a('POST', '/tienda/ventas', {
      lineas: linea,
      total: '109000',
      recibido: '1000',
      pagos: [
        { medio: 'EFECTIVO', valor: '59000' },
        { medio: 'TRANSFERENCIA', valor: '50000' },
      ],
    })
  ).estado === 400,
);

// ───────────── Venta con pago combinado ─────────────
r = await a('POST', '/tienda/ventas', {
  lineas: linea,
  total: '109000',
  recibido: '60000',
  pagos: [
    { medio: 'EFECTIVO', valor: '59000' },
    { medio: 'TRANSFERENCIA', valor: '50000' },
  ],
});
const venta = r.datos;
verificar(
  'venta VT: total, cambio y recibo',
  r.estado === 201 &&
    /^VT.+-1$/.test(venta.numero) &&
    venta.total === '109000.00' &&
    venta.recibido === '60000.00' &&
    venta.cambio === '1000.00' &&
    venta.pagos.length === 2 &&
    !!venta.reciboNumero &&
    venta.anulable === true,
  JSON.stringify(venta),
);
verificar(
  'existencias bajaron: agua 17, proteína 4',
  (await stock(agua.id)).existencia === 17 && (await stock(prot.id)).existencia === 4,
);
verificar(
  'el cuadre suma solo el efectivo: 50.000 + 59.000',
  (await esperado()) === '109000.00',
  await esperado(),
);
verificar(
  'costo de la línea = costo promedio × unidades',
  venta.lineas.find((l) => l.productoNombre === 'Agua 600 ml').costo === '3000.00' &&
    venta.lineas.find((l) => l.productoNombre === 'Proteína').costo === '60000.00',
  JSON.stringify(venta.lineas),
);
verificar(
  'el recibo del sistema no pierde su afiliado (venta de mostrador) y es imprimible',
  (await a('GET', `/recibos/${venta.reciboId}`)).datos.afiliadoNombre === null,
);

// ───────────── Devoluciones ─────────────
verificar(
  'devolver sin motivo → 400',
  (
    await a('POST', `/tienda/ventas/${venta.id}/devolucion`, {
      medio: 'EFECTIVO',
      motivo: '',
      lineas: [{ productoId: agua.id, cantidad: 1 }],
    })
  ).estado === 400,
);
r = await a('POST', `/tienda/ventas/${venta.id}/devolucion`, {
  medio: 'EFECTIVO',
  motivo: 'Botella dañada',
  lineas: [{ productoId: agua.id, cantidad: 1 }],
});
const dv1 = r.datos?.devoluciones?.[0];
verificar(
  'devolución en efectivo: DV, total 3.000 y sale de la caja',
  r.estado === 201 &&
    /^DV.+-1$/.test(dv1.numero) &&
    dv1.total === '3000.00' &&
    (await esperado()) === '106000.00',
  JSON.stringify(r.datos),
);
verificar('la existencia vuelve: agua 18', (await stock(agua.id)).existencia === 18);
verificar(
  'más de lo devuelto posible → 409',
  (
    await a('POST', `/tienda/ventas/${venta.id}/devolucion`, {
      medio: 'OTRO',
      motivo: 'x x x',
      lineas: [{ productoId: agua.id, cantidad: 3 }],
    })
  ).estado === 409,
);
r = await a('POST', `/tienda/ventas/${venta.id}/devolucion`, {
  medio: 'OTRO',
  motivo: 'Cliente se arrepintió',
  lineas: [{ productoId: agua.id, cantidad: 2 }],
});
const dv2 = r.datos?.devoluciones?.[1];
verificar(
  'devolución por otro medio no toca la caja',
  r.estado === 201 && dv2.total === '6000.00' && (await esperado()) === '106000.00',
  JSON.stringify(r.datos),
);
verificar(
  'completar la línea devuelve exactamente el costo que faltaba (agua: 3 × 1.000)',
  sql(
    `SELECT sum(l.valor) FROM documento_linea l JOIN documento d ON d.id = l.documento_id WHERE d.tipo = 'DEVOLUCION' AND l.producto_id = '${agua.id}'`,
  ) === '3000.00',
);
verificar(
  'detalle: devueltas = 3 y la venta ya no es anulable',
  (await a('GET', `/tienda/ventas/${venta.id}`)).datos.lineas.find((l) => l.productoId === agua.id)
    .devueltas === 3 && (await a('GET', `/tienda/ventas/${venta.id}`)).datos.anulable === false,
);
verificar(
  'anular la venta con devoluciones vigentes → 409',
  (await a('POST', `/tienda/ventas/${venta.id}/anular`, { motivo: 'error de cobro' })).estado ===
    409,
);

// ───────────── Informe de la tienda ─────────────
r = await a('GET', `/informes/tienda?desde=${hoy}&hasta=${hoy}`);
const inf = r.datos;
verificar(
  'informe: neto 100.000, costo 60.000, utilidad 40.000, margen 40%',
  r.estado === 200 &&
    inf.ventas === 1 &&
    inf.devoluciones === 2 &&
    inf.neto === '100000.00' &&
    inf.costo === '60000.00' &&
    inf.utilidad === '40000.00' &&
    inf.margen === '40.00' &&
    inf.unidades === 1,
  JSON.stringify(inf),
);
verificar(
  'informe por medio: efectivo, transferencia y devoluciones en negativo',
  inf.porMedio.find((m) => m.medio === 'EFECTIVO')?.valor === '59000.00' &&
    inf.porMedio.find((m) => m.medio === 'TRANSFERENCIA')?.valor === '50000.00' &&
    inf.porMedio.find((m) => m.medio === 'DEVOLUCIONES')?.valor === '-9000.00',
  JSON.stringify(inf.porMedio),
);
verificar(
  'el informe de cobros cuenta la venta como «Tienda»',
  (await a('GET', `/informes/cobros?desde=${hoy}&hasta=${hoy}`)).datos.porPlan.some(
    (p) => p.plan === 'Tienda',
  ),
);

// ───────────── Anulaciones ─────────────
const mcId = sql(`SELECT id FROM movimiento_caja WHERE documento_id IS NOT NULL LIMIT 1`);
verificar(
  'el egreso de una devolución no se anula desde la caja → 409',
  (await a('POST', `/caja/movimientos/${mcId}/anular`, { motivo: 'prueba' })).estado === 409,
);
r = await a('POST', `/tienda/ventas/devoluciones/${dv1.id}/anular`, { motivo: 'Fue un error' });
verificar(
  'anular la devolución en efectivo devuelve el dinero a la caja',
  r.estado === 201 &&
    (await esperado()) === '109000.00' &&
    (await stock(agua.id)).existencia === 19,
  JSON.stringify(r.datos),
);
verificar(
  'anular una devolución ya anulada → 409',
  (await a('POST', `/tienda/ventas/devoluciones/${dv1.id}/anular`, { motivo: 'otra vez' }))
    .estado === 409,
);
await a('POST', `/tienda/ventas/devoluciones/${dv2.id}/anular`, { motivo: 'Fue un error' });
r = await a('POST', `/tienda/ventas/${venta.id}/anular`, { motivo: 'Venta mal cobrada' });
verificar(
  'anular la venta: existencias y efectivo vuelven',
  r.estado === 201 &&
    r.datos.anulada === true &&
    (await stock(agua.id)).existencia === 20 &&
    (await stock(prot.id)).existencia === 5 &&
    (await esperado()) === '50000.00',
  JSON.stringify(r.datos),
);
verificar(
  'valor del inventario intacto al peso (agua 20.000, proteína 300.000)',
  (await stock(agua.id)).valorInventario === '20000.00' &&
    (await stock(prot.id)).valorInventario === '300000.00',
);
verificar(
  'no se devuelve una venta anulada → 409',
  (
    await a('POST', `/tienda/ventas/${venta.id}/devolucion`, {
      medio: 'OTRO',
      motivo: 'algo',
      lineas: [{ productoId: agua.id, cantidad: 1 }],
    })
  ).estado === 409,
);

// ───────────── Caja cerrada ─────────────
const v2 = (
  await a('POST', '/tienda/ventas', {
    lineas: [{ productoId: agua.id, cantidad: 2 }],
    total: '6000',
    pagos: [{ medio: 'EFECTIVO', valor: '6000' }],
  })
).datos;
const turno = (await a('GET', '/caja/actual')).datos;
r = await a('POST', `/caja/turnos/${turno.id}/cerrar`, { contado: '56000' });
verificar('cerrar la caja', r.estado === 201 || r.estado === 200, JSON.stringify(r.datos));
verificar(
  'anular una venta de una caja cerrada → 409',
  (await a('POST', `/tienda/ventas/${v2.id}/anular`, { motivo: 'tarde' })).estado === 409,
);
verificar(
  'devolución en efectivo sin caja abierta → 409',
  (
    await a('POST', `/tienda/ventas/${v2.id}/devolucion`, {
      medio: 'EFECTIVO',
      motivo: 'sin caja',
      lineas: [{ productoId: agua.id, cantidad: 1 }],
    })
  ).estado === 409,
);
verificar(
  'devolución por otro medio sí se puede sin caja',
  (
    await a('POST', `/tienda/ventas/${v2.id}/devolucion`, {
      medio: 'OTRO',
      motivo: 'devuelto por transferencia',
      lineas: [{ productoId: agua.id, cantidad: 1 }],
    })
  ).estado === 201,
);
verificar(
  'el cuadre del turno cerrado no cambió',
  (await a('GET', `/caja/turnos/${turno.id}`)).datos.esperado === '56000.00',
);

// ───────────── Listado y cuadre contra el kardex ─────────────
const lista = (await a('GET', `/tienda/ventas?desde=${hoy}&hasta=${hoy}`)).datos;
verificar(
  'listado de ventas del día con devuelto',
  lista.length === 2 && lista.find((x) => x.id === v2.id)?.devuelto === '3000.00',
  JSON.stringify(lista),
);
verificar(
  'existencia y valor cuadran con el kardex',
  sql(`SELECT count(*) FROM existencia e WHERE e.cantidad <> COALESCE((SELECT sum(cantidad) FROM movimiento_inventario m WHERE m.producto_id = e.producto_id AND m.sucursal_id = e.sucursal_id), 0)
        OR e.valor <> COALESCE((SELECT sum(valor) FROM movimiento_inventario m WHERE m.producto_id = e.producto_id AND m.sucursal_id = e.sucursal_id), 0)`) ===
    '0',
);
verificar(
  'todo recibo de venta tiene su documento y ninguno de membresía lo tiene',
  sql(`SELECT count(*) FROM recibo WHERE (documento_id IS NULL) = (suscripcion_id IS NULL)`) ===
    '0',
);

// ───────────── Permisos ─────────────
const roles = (await a('GET', '/roles')).datos;
const recep = roles.find((x) => x.nombre === 'Recepción');
await a('POST', '/usuarios', {
  nombre: 'Recep',
  email: 'recep@666.co',
  password: 'una-clave-segura',
  rolId: recep.id,
});
const s = sesion();
await s('POST', '/auth/login', { email: 'recep@666.co', password: 'una-clave-segura' });
await s('POST', '/caja/abrir', { base: '1000' });
r = await s('POST', '/tienda/ventas', {
  lineas: [{ productoId: agua.id, cantidad: 1 }],
  total: '3000',
  pagos: [{ medio: 'NEQUI', valor: '3000' }],
});
verificar(
  'Recepción vende, sin ver costos',
  r.estado === 201 && r.datos.lineas[0].costo === null,
  JSON.stringify(r.datos),
);
verificar(
  'Recepción no anula (403)',
  (await s('POST', `/tienda/ventas/${r.datos.id}/anular`, { motivo: 'prueba' })).estado === 403,
);
verificar(
  'el informe de la tienda lleva costos al administrador y exige informes.ver',
  (await a('GET', `/informes/tienda?desde=${hoy}&hasta=${hoy}`)).datos.costo !== null &&
    (await s('GET', `/informes/tienda?desde=${hoy}&hasta=${hoy}`)).estado === 403,
);

// ───────────── Aislamiento ─────────────
verificar(
  'otra empresa no ve ventas',
  (await b('GET', `/tienda/ventas?desde=${hoy}&hasta=${hoy}`)).datos.length === 0 &&
    (await b('GET', `/tienda/ventas/${v2.id}`)).estado === 404,
);
terminar();
