import { z } from 'zod';

// Mensajes de validación por defecto en español, en la API y en la web.
z.config(z.locales.es());
// Longitud de textos con mensajes claros ("Máximo 60 caracteres"); el resto, los de la traducción.
z.config({
  customError: (i) => {
    if (i.code === 'too_big' && i.origin === 'string') return `Máximo ${i.maximum} caracteres`;
    if (i.code === 'too_small' && i.origin === 'string') {
      return Number(i.minimum) <= 1 ? 'Obligatorio' : `Mínimo ${i.minimum} caracteres`;
    }
    return undefined;
  },
});

export * from './comun.js';
export * from './nit.js';
export * from './permisos.js';
export * from './esquemas/empresa.js';
export * from './esquemas/auth.js';
export * from './esquemas/administracion.js';
export * from './plataforma.js';
export * from './esquemas/afiliados.js';
