// Empresa, sucursales (con sus numeraciones) y roles.
import { nuevaEmpresa, sql, terminar, verificar } from './comun.mjs';

const { a, perfil } = await nuevaEmpresa('900555661');

let r = await a('PUT', '/empresa', {
  razonSocial: 'Gimnasio Fuerza',
  nombreComercial: 'Fuerza',
  telefono: '3001234567',
  direccion: '',
});
verificar(
  'edita los datos de la empresa (vacío = sin dato)',
  r.estado === 200 && r.datos.nombreComercial === 'Fuerza' && r.datos.direccion === null,
  JSON.stringify(r.datos),
);

r = await a('POST', '/sucursales', { codigo: '02', nombre: 'Sede norte' });
verificar('crea una sucursal', r.estado === 201, JSON.stringify(r.datos));
const s2 = r.datos;
verificar(
  'la sucursal nueva trae sus numeraciones',
  sql(`SELECT count(*) FROM numeracion WHERE sucursal_id = '${s2.id}'`) === '1',
);
r = await a('PUT', `/sucursales/${s2.id}`, { codigo: '03', nombre: 'Plaza' });
verificar('el código no cambia (400)', r.estado === 400);
r = await a('PATCH', `/sucursales/${perfil.sucursal.id}/estado`, { activo: false });
verificar('no inactiva la sucursal en la que trabaja (400)', r.estado === 400);
r = await a('PATCH', `/sucursales/${s2.id}/estado`, { activo: false });
verificar('inactiva otra sucursal', r.estado === 200 && r.datos.activa === false);

const roles = (await a('GET', '/roles')).datos;
verificar(
  'roles iniciales: Administrador, Recepción y Supervisor',
  ['Administrador', 'Recepción', 'Supervisor'].every((n) => roles.some((x) => x.nombre === n)),
  roles.map((x) => x.nombre).join(','),
);
r = await a('POST', '/roles', {
  nombre: 'Bodega',
  permisos: ['afiliados.ver', 'afiliados.editar'],
});
verificar('crea un rol con permisos del catálogo', r.estado === 201, JSON.stringify(r.datos));

terminar();
