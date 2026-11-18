/**
 * Catálogo de permisos. Un rol guarda una lista de estos códigos;
 * el comodín `*` da acceso total (rol Administrador).
 */
export const PERMISOS = {
  EMPRESA_CONFIGURAR: 'empresa.configurar',
  SUCURSALES_GESTIONAR: 'sucursales.gestionar',
  USUARIOS_GESTIONAR: 'usuarios.gestionar',
  /** Consultar afiliados y su estado de membresía (se usa desde la Etapa 1). */
  AFILIADOS_VER: 'afiliados.ver',
  /** Crear y editar afiliados, planes y membresías (Etapa 1). */
  AFILIADOS_EDITAR: 'afiliados.editar',
  /** Registrar el ingreso de un afiliado, en recepción o en la tablet (Etapa 2). */
  INGRESOS_REGISTRAR: 'ingresos.registrar',
  /** Abrir y cerrar su propia caja, cobrar membresías y registrar ingresos y egresos de caja (Etapa 3). */
  CAJA_OPERAR: 'caja.operar',
  /** Ver y cerrar las cajas de todos los cajeros (Etapa 3). */
  CAJA_SUPERVISAR: 'caja.supervisar',
  INFORMES_VER: 'informes.ver',
  /** Ver productos, existencias y ventas de la tienda. */
  TIENDA_VER: 'tienda.ver',
  /** Vender en la tienda (cobra en su caja) y hacer devoluciones. */
  TIENDA_VENDER: 'tienda.vender',
  /** Crear y editar productos y precios. */
  TIENDA_PRODUCTOS: 'tienda.productos',
  /** Entradas de mercancía y ajustes de inventario (conteo, mermas). */
  TIENDA_INVENTARIO: 'tienda.inventario',
  /** Anular entradas, ajustes y ventas. */
  TIENDA_ANULAR: 'tienda.anular',
  /** Ver costos y utilidad de la tienda. */
  TIENDA_COSTOS: 'tienda.costos',
} as const;

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS];

export const PERMISO_TOTAL = '*';

export function tienePermiso(permisos: readonly string[], requerido: string): boolean {
  return permisos.includes(PERMISO_TOTAL) || permisos.includes(requerido);
}

/** Permisos agrupados por área, con el texto que ve quien arma un rol. */
export const CATALOGO_PERMISOS: {
  grupo: string;
  permisos: { codigo: Permiso; nombre: string; descripcion: string }[];
}[] = [
  {
    grupo: 'Afiliados e ingresos',
    permisos: [
      {
        codigo: PERMISOS.AFILIADOS_VER,
        nombre: 'Ver afiliados',
        descripcion: 'Consultar afiliados y el estado de su membresía.',
      },
      {
        codigo: PERMISOS.AFILIADOS_EDITAR,
        nombre: 'Editar afiliados',
        descripcion: 'Crear y editar afiliados, planes y membresías.',
      },
      {
        codigo: PERMISOS.INGRESOS_REGISTRAR,
        nombre: 'Registrar ingresos',
        descripcion: 'Registrar el ingreso de un afiliado al gimnasio.',
      },
    ],
  },
  {
    grupo: 'Caja',
    permisos: [
      {
        codigo: PERMISOS.CAJA_OPERAR,
        nombre: 'Operar la caja',
        descripcion: 'Abrir y cerrar su caja, cobrar membresías y registrar ingresos y egresos.',
      },
      {
        codigo: PERMISOS.CAJA_SUPERVISAR,
        nombre: 'Supervisar las cajas',
        descripcion: 'Ver y cerrar las cajas de todos los cajeros.',
      },
    ],
  },
  {
    grupo: 'Tienda',
    permisos: [
      {
        codigo: PERMISOS.TIENDA_VER,
        nombre: 'Ver la tienda',
        descripcion: 'Consultar productos, existencias y ventas de la tienda.',
      },
      {
        codigo: PERMISOS.TIENDA_VENDER,
        nombre: 'Vender en la tienda',
        descripcion: 'Registrar ventas (se cobran en su caja) y devoluciones.',
      },
      {
        codigo: PERMISOS.TIENDA_PRODUCTOS,
        nombre: 'Productos y precios',
        descripcion: 'Crear y editar los productos de la tienda y sus precios.',
      },
      {
        codigo: PERMISOS.TIENDA_INVENTARIO,
        nombre: 'Inventario de la tienda',
        descripcion: 'Registrar entradas de mercancía y ajustes (conteo, mermas).',
      },
      {
        codigo: PERMISOS.TIENDA_ANULAR,
        nombre: 'Anular en la tienda',
        descripcion: 'Anular entradas, ajustes y ventas.',
      },
      {
        codigo: PERMISOS.TIENDA_COSTOS,
        nombre: 'Ver costos de la tienda',
        descripcion: 'Ver costos, utilidad y el valor del inventario.',
      },
    ],
  },
  {
    grupo: 'Informes',
    permisos: [
      {
        codigo: PERMISOS.INFORMES_VER,
        nombre: 'Ver informes',
        descripcion: 'Informes de ingresos, membresías y asistencia.',
      },
    ],
  },
  {
    grupo: 'Administración',
    permisos: [
      {
        codigo: PERMISOS.USUARIOS_GESTIONAR,
        nombre: 'Usuarios y roles',
        descripcion: 'Crear usuarios, asignar roles y sucursales.',
      },
      {
        codigo: PERMISOS.SUCURSALES_GESTIONAR,
        nombre: 'Sucursales',
        descripcion: 'Crear, editar e inactivar sucursales.',
      },
      {
        codigo: PERMISOS.EMPRESA_CONFIGURAR,
        nombre: 'Configurar empresa',
        descripcion: 'Datos generales de la empresa.',
      },
    ],
  },
];

/** Roles que trae toda empresa nueva (se pueden ajustar). El Administrador tiene `*`. */
export const ROLES_SUGERIDOS: { nombre: string; permisos: Permiso[] }[] = [
  {
    nombre: 'Recepción',
    permisos: [
      PERMISOS.AFILIADOS_VER,
      PERMISOS.AFILIADOS_EDITAR,
      PERMISOS.INGRESOS_REGISTRAR,
      PERMISOS.CAJA_OPERAR,
      PERMISOS.TIENDA_VER,
      PERMISOS.TIENDA_VENDER,
    ],
  },
  {
    nombre: 'Supervisor',
    permisos: [
      PERMISOS.AFILIADOS_VER,
      PERMISOS.AFILIADOS_EDITAR,
      PERMISOS.INGRESOS_REGISTRAR,
      PERMISOS.CAJA_OPERAR,
      PERMISOS.CAJA_SUPERVISAR,
      PERMISOS.INFORMES_VER,
      PERMISOS.TIENDA_VER,
      PERMISOS.TIENDA_VENDER,
      PERMISOS.TIENDA_PRODUCTOS,
      PERMISOS.TIENDA_INVENTARIO,
      PERMISOS.TIENDA_ANULAR,
      PERMISOS.TIENDA_COSTOS,
    ],
  },
];

export const ROL_ADMINISTRADOR = 'Administrador';
