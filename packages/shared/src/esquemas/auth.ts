import { z } from 'zod';
import type { LicenciaEmpresa } from '../plataforma.js';
import { nitEsValido } from '../nit.js';

// Se limpia y pasa a minúsculas antes de validar el formato.
const email = z.string().trim().toLowerCase().pipe(z.email('Correo electrónico inválido'));

export const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(128, 'La contraseña no puede superar 128 caracteres');

export const registroSchema = z.object({
  empresa: z
    .object({
      nit: z
        .string()
        .trim()
        .regex(/^\d{5,15}$/, 'El NIT o cédula debe tener solo números, sin DV'),
      dv: z.number().int().min(0).max(9),
      razonSocial: z.string().trim().min(2, 'Indique la razón social o el nombre').max(200),
    })
    .refine((e) => nitEsValido(e.nit, e.dv), {
      message: 'El dígito de verificación no corresponde al NIT',
      path: ['dv'],
    }),
  sucursal: z
    .object({
      nombre: z.string().trim().min(2).max(100).default('Principal'),
      direccion: z.string().trim().max(200).optional(),
    })
    .default({ nombre: 'Principal' }),
  usuario: z.object({
    nombre: z.string().trim().min(2, 'Indique su nombre').max(100),
    email,
    password: passwordSchema,
  }),
  /** Código que exige el servidor cuando el registro no es libre (`REGISTRO_CODIGO`). */
  codigoRegistro: z.string().trim().max(100).optional(),
});

/** Respuesta de GET /auth/registro: si el registro de empresas pide código. */
export type EstadoRegistro = {
  requiereCodigo: boolean;
  /** false: el registro de empresas está cerrado (`REGISTRO_PUBLICO=no` sin código). */
  abierto: boolean;
};

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Indique la contraseña').max(128),
});

export const seleccionarContextoSchema = z.object({
  empresaId: z.uuid(),
  sucursalId: z.uuid(),
});

export type RegistroEntrada = z.input<typeof registroSchema>;
export type Registro = z.output<typeof registroSchema>;
export type LoginEntrada = z.input<typeof loginSchema>;
export type SeleccionarContexto = z.output<typeof seleccionarContextoSchema>;

/** Respuesta de GET /auth/yo (y de registro, login y selección). */
export type Perfil = {
  usuario: { id: string; nombre: string; email: string };
  empresa: {
    id: string;
    razonSocial: string;
    nombreComercial: string | null;
    nit: string;
    dv: number;
    licencia: LicenciaEmpresa;
  } | null;
  sucursal: { id: string; nombre: string } | null;
  permisos: string[];
  empresas: {
    id: string;
    razonSocial: string;
    sucursales: { id: string; nombre: string }[];
  }[];
};
