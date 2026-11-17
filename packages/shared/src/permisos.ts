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
  INFORMES_VER: 'informes.ver',
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
    permisos: [PERMISOS.AFILIADOS_VER, PERMISOS.AFILIADOS_EDITAR, PERMISOS.INGRESOS_REGISTRAR],
  },
  {
    nombre: 'Supervisor',
    permisos: [
      PERMISOS.AFILIADOS_VER,
      PERMISOS.AFILIADOS_EDITAR,
      PERMISOS.INGRESOS_REGISTRAR,
      PERMISOS.INFORMES_VER,
    ],
  },
];

export const ROL_ADMINISTRADOR = 'Administrador';
