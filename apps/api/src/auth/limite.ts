import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Cuenta intentos por clave (IP, correo) en una ventana de tiempo, en memoria del proceso.
 * Frena la adivinanza de contraseñas y el registro masivo cuando la API está en internet.
 * Con un solo servidor basta; si algún día hay varios, cada uno lleva su cuenta.
 */
export class LimiteIntentos {
  private readonly intentos = new Map<string, { cuenta: number; desde: number }>();

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs: number,
    private readonly ahora: () => number = Date.now,
  ) {}

  /** Lanza 429 si la clave ya agotó sus intentos en la ventana. */
  verificar(clave: string) {
    const r = this.vigente(clave);
    if (r && r.cuenta >= this.maximo) {
      const minutos = Math.max(1, Math.ceil((r.desde + this.ventanaMs - this.ahora()) / 60_000));
      throw new HttpException(
        `Demasiados intentos. Espere ${minutos} minuto${minutos === 1 ? '' : 's'} e intente de nuevo.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  registrar(clave: string) {
    const r = this.vigente(clave);
    if (r) r.cuenta++;
    else this.intentos.set(clave, { cuenta: 1, desde: this.ahora() });
    if (this.intentos.size > 10_000) this.limpiar();
  }

  olvidar(clave: string) {
    this.intentos.delete(clave);
  }

  private vigente(clave: string) {
    const r = this.intentos.get(clave);
    if (r && this.ahora() - r.desde >= this.ventanaMs) {
      this.intentos.delete(clave);
      return undefined;
    }
    return r;
  }

  private limpiar() {
    const limite = this.ahora() - this.ventanaMs;
    for (const [clave, r] of this.intentos) if (r.desde <= limite) this.intentos.delete(clave);
  }
}

/** Código que exige el registro de empresas; sin él (o vacío), el registro es libre. */
export function codigoRegistro(): string | undefined {
  return process.env.REGISTRO_CODIGO?.trim() || undefined;
}

/** Compara el código digitado con `REGISTRO_CODIGO` sin revelar por el tiempo cuánto coincide. */
export function exigirCodigoRegistro(digitado: string | undefined) {
  const esperado = codigoRegistro();
  if (!esperado) return;
  const a = createHash('sha256')
    .update(digitado ?? '')
    .digest();
  const b = createHash('sha256').update(esperado).digest();
  if (!timingSafeEqual(a, b)) {
    throw new ForbiddenException(
      digitado ? 'El código de registro no es válido' : 'Indique el código de registro',
    );
  }
}

/** `REGISTRO_PUBLICO=no`: no se registran empresas (salvo que haya `REGISTRO_CODIGO`). */
export function registroAbierto(): boolean {
  if (codigoRegistro()) return true;
  return !/^(no|false|0|cerrado)$/i.test(process.env.REGISTRO_PUBLICO?.trim() ?? '');
}

export function exigirRegistroAbierto() {
  if (!registroAbierto()) {
    throw new ForbiddenException(
      'El registro de empresas está cerrado. Para usar Kipfit comuníquese con nosotros.',
    );
  }
}
