import { BadRequestException } from '@nestjs/common';
import { rolSchema } from '@kip/shared';
import { describe, expect, it } from 'vitest';
import { nombreCampo, ZodPipe } from './zod.pipe';

describe('ZodPipe', () => {
  it('nombra el campo y la regla en el mensaje', () => {
    const pipe = new ZodPipe(rolSchema);
    try {
      pipe.transform({ nombre: 'x'.repeat(61), permisos: ['afiliados.ver'] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const cuerpo = (e as BadRequestException).getResponse() as {
        mensaje: string;
        errores: { campo: string; mensaje: string }[];
      };
      expect(cuerpo.mensaje).toBe('Datos inválidos. nombre: Máximo 60 caracteres');
      expect(cuerpo.errores).toEqual([{ campo: 'nombre', mensaje: 'Máximo 60 caracteres' }]);
    }
  });

  it('nombres legibles de campos anidados', () => {
    expect(nombreCampo(['lineas', 2, 'cantidad'])).toBe('líneas 3 › cantidad');
    expect(nombreCampo(['medioPago'])).toBe('medio pago');
    expect(nombreCampo(['razonSocial'])).toBe('razón social');
  });
});
