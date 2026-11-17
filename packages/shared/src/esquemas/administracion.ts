import { z } from 'zod';
import { opcional } from '../comun.js';
import { PERMISOS, type Permiso } from '../permisos.js';
import { passwordSchema } from './auth.js';

const CODIGOS = Object.values(PERMISOS) as [Permiso, ...Permiso[]];
const email = z.string().trim().toLowerCase().pipe(z.email('Correo electrónico inválido'));

// ───────────── Roles ─────────────

export const rolSchema = z.object({
  nombre: z.string().trim().min(2, 'Indique el nombre del rol').max(60),
  permisos: z
    .array(z.enum(CODIGOS, { error: 'Permiso desconocido' }))
    .min(1, 'Marque al menos un permiso')
    .transform((p) => [...new Set(p)].sort()),
});
export type RolEntrada = z.input<typeof rolSchema>;
export type RolDatos = z.output<typeof rolSchema>;

export type Rol = {
  id: string;
  nombre: string;
  permisos: string[];
  activo: boolean;
  /** El rol con acceso total (`*`): no se edita ni se inactiva. */
  esAdministrador: boolean;
  usuarios: number; // usuarios activos con este rol
};

// ───────────── Usuarios ─────────────

const sucursalIds = z
  .array(z.uuid())
  .max(200)
  .default([])
  .transform((s) => [...new Set(s)]);

export const usuarioNuevoSchema = z.object({
  nombre: z.string().trim().min(2, 'Indique el nombre').max(100),
  email,
  /** Solo se usa si el correo no tiene cuenta todavía. */
  password: opcional(passwordSchema),
  rolId: z.uuid('Seleccione el rol'),
  /** Vacío = todas las sucursales de la empresa. */
  sucursalIds,
});
export type UsuarioNuevoEntrada = z.input<typeof usuarioNuevoSchema>;
export type UsuarioNuevoDatos = z.output<typeof usuarioNuevoSchema>;

export const usuarioEdicionSchema = z.object({
  rolId: z.uuid('Seleccione el rol'),
  sucursalIds,
});
export type UsuarioEdicionDatos = z.output<typeof usuarioEdicionSchema>;

export const restablecerPasswordSchema = z.object({ password: passwordSchema });
export type RestablecerPasswordDatos = z.output<typeof restablecerPasswordSchema>;

export const cambiarPasswordSchema = z
  .object({
    actual: z.string().min(1, 'Indique su contraseña actual').max(128),
    nueva: passwordSchema,
  })
  .refine((d) => d.actual !== d.nueva, {
    message: 'La nueva contraseña debe ser distinta de la actual',
    path: ['nueva'],
  });
export type CambiarPasswordDatos = z.output<typeof cambiarPasswordSchema>;

export type UsuarioEmpresa = {
  id: string; // id del usuario
  nombre: string;
  email: string;
  rol: { id: string; nombre: string };
  /** Vacío = todas las sucursales. */
  sucursales: { id: string; nombre: string }[];
  activo: boolean; // la membresía en esta empresa
  esUsted: boolean;
  /** Tiene acceso a otras empresas: su contraseña solo la cambia él mismo. */
  otrasEmpresas: boolean;
};

export type UsuarioCreado = UsuarioEmpresa & {
  /** El correo ya tenía cuenta: entra con su contraseña de siempre. */
  cuentaExistente: boolean;
};

// ───────────── Sucursales ─────────────

export const sucursalSchema = z.object({
  codigo: z
    .string()
    .trim()
    .regex(/^\d{2}$/, 'Código de 2 dígitos, ej.: 03'),
  nombre: z.string().trim().min(2, 'Indique el nombre').max(100),
  direccion: opcional(z.string().trim().max(200)),
  telefono: opcional(z.string().trim().max(30)),
});
export type SucursalEntrada = z.input<typeof sucursalSchema>;
export type SucursalDatos = z.output<typeof sucursalSchema>;

export type Sucursal = {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  activa: boolean;
};
