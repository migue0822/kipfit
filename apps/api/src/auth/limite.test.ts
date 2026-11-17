import { ForbiddenException, HttpException } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import {
  exigirCodigoRegistro,
  exigirRegistroAbierto,
  LimiteIntentos,
  registroAbierto,
} from './limite';

describe('LimiteIntentos', () => {
  it('bloquea al agotar los intentos y libera al terminar la ventana', () => {
    let t = 0;
    const l = new LimiteIntentos(3, 60_000, () => t);
    for (let i = 0; i < 3; i++) {
      l.verificar('a');
      l.registrar('a');
    }
    expect(() => l.verificar('a')).toThrow(HttpException);
    expect(() => l.verificar('a')).toThrow('Espere 1 minuto');
    l.verificar('b'); // otra clave no se afecta
    t = 60_000;
    expect(() => l.verificar('a')).not.toThrow();
  });

  it('olvidar reinicia la cuenta', () => {
    const l = new LimiteIntentos(1, 60_000);
    l.registrar('a');
    expect(() => l.verificar('a')).toThrow();
    l.olvidar('a');
    expect(() => l.verificar('a')).not.toThrow();
  });
});

describe('exigirCodigoRegistro', () => {
  afterEach(() => {
    delete process.env.REGISTRO_CODIGO;
  });

  it('sin REGISTRO_CODIGO el registro es libre', () => {
    expect(() => exigirCodigoRegistro(undefined)).not.toThrow();
  });

  it('con REGISTRO_CODIGO exige el código exacto', () => {
    process.env.REGISTRO_CODIGO = 'familia-2026';
    expect(() => exigirCodigoRegistro(undefined)).toThrow('Indique el código de registro');
    expect(() => exigirCodigoRegistro('otro')).toThrow(ForbiddenException);
    expect(() => exigirCodigoRegistro('familia-2026')).not.toThrow();
  });
});

describe('registro público', () => {
  afterEach(() => {
    delete process.env.REGISTRO_PUBLICO;
  });

  it('abierto si no se configura (desarrollo y pruebas)', () => {
    expect(registroAbierto()).toBe(true);
  });

  it('REGISTRO_PUBLICO=no lo cierra', () => {
    process.env.REGISTRO_PUBLICO = 'no';
    expect(registroAbierto()).toBe(false);
    expect(() => exigirRegistroAbierto()).toThrow(/registro de empresas está cerrado/);
    process.env.REGISTRO_PUBLICO = 'si';
    expect(registroAbierto()).toBe(true);
  });
});
