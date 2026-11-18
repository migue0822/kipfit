// Tienda: productos, entradas, ajustes, anulaciones, kardex, costos visibles solo con permiso y aislamiento.
import { nuevaEmpresa, sesion, sql, terminar, verificar } from './comun.mjs';

const { a } = await nuevaEmpresa('900555001');
const { a: b } = await nuevaEmpresa('900555002');

const agua = (
  await a('POST', '/tienda/productos', {
    codigo: 'agua 600',
    nombre: 'Agua 600 ml',
    categoria: 'Bebidas',
    precioVenta: '2.500',
  })
).datos;
const prot = (
  await a('POST', '/tienda/productos', {
    nombre: 'Proteína Whey 1 lb',
    categoria: 'Suplementos',
    precioVenta: '120000',
  })
).datos;
verificar(
  'crear producto: código normalizado, precio y existencia 0',
  agua.codigo === 'AGUA600' && agua.precioVenta === '2500.00' && agua.existencia === 0,
  JSON.stringify(agua),
);
verificar(
  'código repetido → 409',
  (await a('POST', '/tienda/productos', { codigo: 'AGUA600', nombre: 'Otra', precioVenta: '1' }))
    .estado === 409,
);
verificar(
  'precio inválido → 400',
  (await a('POST', '/tienda/productos', { nombre: 'Malo', precioVenta: 'abc' })).estado === 400,
);
verificar(
  'buscar sin tildes ni mayúsculas',
  (await a('GET', '/tienda/productos?buscar=proteina')).datos.length === 1,
);
let r = await a('PUT', `/tienda/productos/${agua.id}`, {
  codigo: 'AGUA600',
  nombre: 'Agua 600 ml',
  categoria: 'Bebidas',
  precioVenta: '3000',
});
verificar(
  'editar precio',
  r.estado === 200 &&
    r.datos.precioVenta === '3000.00' &&
    sql(`SELECT count(*) FROM auditoria WHERE accion = 'cambiar_precio'`) === '1',
);

// ───────────── Entradas ─────────────
r = await a('POST', '/tienda/inventario/entradas', {
  proveedor: 'Distri',
  referencia: 'F-100',
  lineas: [{ productoId: agua.id, cantidad: 10, costoUnitario: '1000' }],
});
verificar(
  'entrada 1: documento EN y valor',
  r.estado === 201 && /^EN.+-1$/.test(r.datos.numero) && r.datos.valorTotal === '10000.00',
  JSON.stringify(r.datos),
);
const ent2 = (
  await a('POST', '/tienda/inventario/entradas', {
    lineas: [
      { productoId: agua.id, cantidad: 10, costoUnitario: '1.200' },
      { productoId: prot.id, cantidad: 5, costoUnitario: '80000' },
    ],
  })
).datos;
let lista = (await a('GET', '/tienda/productos')).datos;
const A = () => lista.find((p) => p.id === agua.id);
const P = () => lista.find((p) => p.id === prot.id);
verificar(
  'costo promedio ponderado: (10×1000 + 10×1200) ÷ 20 = 1100',
  A().existencia === 20 && A().costoPromedio === '1100.0000' && A().valorInventario === '22000.00',
  JSON.stringify(A()),
);
verificar(
  'entrada repite producto → 400',
  (
    await a('POST', '/tienda/inventario/entradas', {
      lineas: [
        { productoId: agua.id, cantidad: 1, costoUnitario: '1' },
        { productoId: agua.id, cantidad: 1, costoUnitario: '1' },
      ],
    })
  ).estado === 400,
);
verificar(
  'entrada con producto ajeno → 400',
  (
    await b('POST', '/tienda/inventario/entradas', {
      lineas: [{ productoId: agua.id, cantidad: 1, costoUnitario: '1' }],
    })
  ).estado === 400,
);

// ───────────── Ajustes ─────────────
r = await a('POST', '/tienda/inventario/ajustes', {
  motivo: 'CONTEO',
  lineas: [
    { productoId: agua.id, sistema: 20, contado: 18 },
    { productoId: prot.id, sistema: 5, contado: 5 },
  ],
});
verificar(
  'conteo: faltan 2 al costo promedio',
  r.estado === 201 &&
    r.datos.lineas.length === 1 &&
    r.datos.lineas[0].cantidad === -2 &&
    r.datos.valorTotal === '-2200.00',
  JSON.stringify(r.datos),
);
lista = (await a('GET', '/tienda/productos')).datos;
verificar('después del conteo', A().existencia === 18 && A().valorInventario === '19800.00');
verificar(
  'existencia que cambió → 409',
  (
    await a('POST', '/tienda/inventario/ajustes', {
      motivo: 'CONTEO',
      lineas: [{ productoId: agua.id, sistema: 20, contado: 19 }],
    })
  ).estado === 409,
);
verificar(
  'merma sin explicación → 400',
  (
    await a('POST', '/tienda/inventario/ajustes', {
      motivo: 'MERMA',
      lineas: [{ productoId: agua.id, sistema: 18, contado: 17 }],
    })
  ).estado === 400,
);
verificar(
  'sin diferencias → 400',
  (
    await a('POST', '/tienda/inventario/ajustes', {
      motivo: 'CONTEO',
      lineas: [{ productoId: agua.id, sistema: 18, contado: 18 }],
    })
  ).estado === 400,
);
const merma = await a('POST', '/tienda/inventario/ajustes', {
  motivo: 'MERMA',
  observaciones: 'Se rompió una caja',
  lineas: [{ productoId: prot.id, sistema: 5, contado: 2 }],
});
verificar(
  'merma de 3 proteínas',
  merma.estado === 201 && merma.datos.valorTotal === '-240000.00',
  JSON.stringify(merma.datos),
);
const sobrante = await a('POST', '/tienda/inventario/ajustes', {
  motivo: 'CONTEO',
  lineas: [{ productoId: agua.id, sistema: 18, contado: 20 }],
});
verificar(
  'sobrante entra al costo promedio',
  sobrante.estado === 201 && sobrante.datos.valorTotal === '2200.00',
  JSON.stringify(sobrante.datos),
);

// ───────────── Anulaciones ─────────────
r = await a('POST', `/tienda/inventario/documentos/${ent2.id}/anular`, {
  motivo: 'Error de digitación',
});
verificar(
  'anular entrada que ya se gastó en parte → 400 (proteína quedaría negativa)',
  r.estado === 400 && /No se puede anular/.test(JSON.stringify(r.datos)),
  JSON.stringify(r.datos),
);
verificar(
  'anular la merma devuelve la proteína',
  (
    await a('POST', `/tienda/inventario/documentos/${merma.datos.id}/anular`, {
      motivo: 'Se encontró',
    })
  ).estado === 201,
);
r = await a('POST', `/tienda/inventario/documentos/${ent2.id}/anular`, {
  motivo: 'Error de digitación',
});
verificar(
  'anular entrada ahora sí',
  r.estado === 201 && r.datos.anulado === true,
  JSON.stringify(r.datos),
);
verificar(
  'anular dos veces → 409',
  (await a('POST', `/tienda/inventario/documentos/${ent2.id}/anular`, { motivo: 'otra vez' }))
    .estado === 409,
);
verificar(
  'anular sin motivo → 400',
  (await a('POST', `/tienda/inventario/documentos/${sobrante.datos.id}/anular`, {})).estado === 400,
);
lista = (await a('GET', '/tienda/productos')).datos;
verificar(
  'proteína en cero con valor cero exacto',
  P().existencia === 0 && P().valorInventario === '0.00',
  JSON.stringify(P()),
);

// ───────────── Kardex y cuadre ─────────────
const kardex = (await a('GET', `/tienda/inventario/kardex?productoId=${agua.id}`)).datos;
verificar(
  'kardex trae todos los movimientos con saldo',
  kardex.length >= 5 && kardex[0].saldoCantidad === A().existencia,
  JSON.stringify(kardex.map((k) => [k.documento, k.cantidad, k.saldoCantidad])),
);
verificar(
  'existencia y valor = último saldo del kardex',
  sql(
    `SELECT count(*) FROM existencia e WHERE e.cantidad <> COALESCE((SELECT saldo_cantidad FROM movimiento_inventario m WHERE m.producto_id = e.producto_id AND m.sucursal_id = e.sucursal_id ORDER BY m.id DESC LIMIT 1), 0) OR e.valor <> COALESCE((SELECT saldo_valor FROM movimiento_inventario m WHERE m.producto_id = e.producto_id AND m.sucursal_id = e.sucursal_id ORDER BY m.id DESC LIMIT 1), 0)`,
  ) === '0',
);
const docs = (await a('GET', '/tienda/inventario/documentos')).datos;
verificar(
  'lista de documentos (entradas y ajustes)',
  docs.length === 5 && docs.every((d) => ['ENTRADA', 'AJUSTE'].includes(d.tipo)),
);
verificar(
  'numeración consecutiva sin huecos',
  sql(`SELECT count(DISTINCT numero) = max(numero) FROM documento WHERE tipo = 'ENTRADA'`) === 't',
);

// ───────────── Inactivar ─────────────
r = await a('PATCH', `/tienda/productos/${prot.id}/estado`, { activo: false });
verificar('inactivar producto', r.estado === 200 && r.datos.activo === false);
verificar(
  'producto inactivo no recibe entradas (409)',
  (
    await a('POST', '/tienda/inventario/entradas', {
      lineas: [{ productoId: prot.id, cantidad: 1, costoUnitario: '1' }],
    })
  ).estado === 409,
);
verificar(
  'lista por defecto oculta inactivos',
  (await a('GET', '/tienda/productos')).datos.every((p) => p.id !== prot.id),
);

// ───────────── Permisos y costos ─────────────
const roles = (await a('GET', '/roles')).datos;
const recep = roles.find((x) => x.nombre === 'Recepción');
await a('POST', '/usuarios', {
  nombre: 'Recep',
  email: 'recep@555.co',
  password: 'una-clave-segura',
  rolId: recep.id,
});
const s = sesion();
await s('POST', '/auth/login', { email: 'recep@555.co', password: 'una-clave-segura' });
r = await s('GET', '/tienda/productos');
verificar(
  'Recepción ve productos pero sin costos',
  r.estado === 200 && r.datos[0].costoPromedio === null && r.datos[0].valorInventario === null,
  JSON.stringify(r.datos[0]),
);
verificar(
  'Recepción no crea productos ni mueve inventario (403)',
  (await s('POST', '/tienda/productos', { nombre: 'X', precioVenta: '1' })).estado === 403 &&
    (
      await s('POST', '/tienda/inventario/entradas', {
        lineas: [{ productoId: agua.id, cantidad: 1, costoUnitario: '1' }],
      })
    ).estado === 403,
);
const det = (await s('GET', `/tienda/inventario/documentos/${sobrante.datos.id}`)).datos;
verificar(
  'detalle de documento sin costos para Recepción',
  det.valorTotal === null && det.lineas[0].valor === null,
);
verificar(
  'kardex sin costos para Recepción',
  (await s('GET', `/tienda/inventario/kardex?productoId=${agua.id}`)).datos[0].valor === null,
);

// ───────────── Aislamiento ─────────────
verificar(
  'otra empresa no ve productos',
  (await b('GET', '/tienda/productos')).datos.length === 0 &&
    (await b('GET', `/tienda/productos/${agua.id}`)).estado === 404,
);
verificar(
  'otra empresa no ve documentos ni kardex',
  (await b('GET', '/tienda/inventario/documentos')).datos.length === 0 &&
    (await b('GET', `/tienda/inventario/documentos/${ent2.id}`)).estado === 404,
);
terminar();
