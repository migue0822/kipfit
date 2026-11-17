import { z } from 'zod';
import { opcional } from '../comun.js';

export const empresaDatosSchema = z.object({
  razonSocial: z.string().trim().min(2, 'Indique la razón social').max(200),
  nombreComercial: opcional(z.string().trim().max(200)),
  direccion: opcional(z.string().trim().max(200)),
  telefono: opcional(z.string().trim().max(30)),
  email: opcional(z.string().trim().toLowerCase().pipe(z.email('Correo electrónico inválido'))),
});

export type EmpresaDatosEntrada = z.input<typeof empresaDatosSchema>;
export type EmpresaDatos = z.output<typeof empresaDatosSchema>;

/** Respuesta de GET/PUT /empresa. */
export type EmpresaConfiguracion = {
  id: string;
  nit: string;
  dv: number;
  razonSocial: string;
  nombreComercial: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
};
