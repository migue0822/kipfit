import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  cambiarPasswordSchema,
  loginSchema,
  registroSchema,
  seleccionarContextoSchema,
  type CambiarPasswordDatos,
  type EstadoRegistro,
  type LoginEntrada,
  type Perfil,
  type Registro,
  type SeleccionarContexto,
} from '@kip/shared';
import type { Request, Response } from 'express';
import { ZodPipe } from '../comun/zod.pipe';
import { AuthService } from './auth.service';
import type { ContextoSesion } from './contexto';
import { borrarCookieSesion, ponerCookieSesion } from './cookie';
import { Contexto, Publico } from './decoradores';
import {
  codigoRegistro,
  exigirCodigoRegistro,
  exigirRegistroAbierto,
  LimiteIntentos,
  registroAbierto,
} from './limite';

const MINUTO = 60_000;
/** Contraseñas fallidas: por correo (protege la cuenta) y por IP (frena barridos de correos). */
const fallosPorCorreo = new LimiteIntentos(10, 15 * MINUTO);
const fallosPorIp = new LimiteIntentos(30, 15 * MINUTO);
/** Registros de empresa por IP, exitosos o no. */
const registrosPorIp = new LimiteIntentos(10, 60 * MINUTO);

function meta(req: Request) {
  return { ip: req.ip, agente: req.get('user-agent') };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** GET /api/v1/auth/registro — si registrar una empresa exige código (`REGISTRO_CODIGO`). */
  @Publico()
  @Get('registro')
  estadoRegistro(): EstadoRegistro {
    return { requiereCodigo: codigoRegistro() !== undefined, abierto: registroAbierto() };
  }

  /** POST /api/v1/auth/registro — crea empresa, sucursal principal y usuario administrador. */
  @Publico()
  @Post('registro')
  async registro(
    @Body(new ZodPipe(registroSchema)) datos: Registro,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Perfil> {
    exigirRegistroAbierto();
    const ip = `ip:${req.ip}`;
    registrosPorIp.verificar(ip);
    registrosPorIp.registrar(ip);
    exigirCodigoRegistro(datos.codigoRegistro);
    const { token, perfil } = await this.auth.registrar(datos, meta(req));
    ponerCookieSesion(res, token);
    return perfil;
  }

  /** POST /api/v1/auth/login */
  @Publico()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) datos: LoginEntrada,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Perfil> {
    const ip = `ip:${req.ip}`;
    const correo = `correo:${datos.email.trim().toLowerCase()}`;
    fallosPorIp.verificar(ip);
    fallosPorCorreo.verificar(correo);
    let sesion: Awaited<ReturnType<AuthService['login']>>;
    try {
      sesion = await this.auth.login(datos, meta(req));
    } catch (e) {
      if (e instanceof UnauthorizedException) {
        fallosPorIp.registrar(ip);
        fallosPorCorreo.registrar(correo);
      }
      throw e;
    }
    fallosPorCorreo.olvidar(correo);
    const { token, perfil } = sesion;
    ponerCookieSesion(res, token);
    return perfil;
  }

  /** POST /api/v1/auth/seleccionar — cambia la empresa y sucursal activas. */
  @Post('seleccionar')
  @HttpCode(200)
  seleccionar(
    @Contexto() ctx: ContextoSesion,
    @Body(new ZodPipe(seleccionarContextoSchema)) datos: SeleccionarContexto,
  ): Promise<Perfil> {
    return this.auth.seleccionar(ctx, datos);
  }

  /** GET /api/v1/auth/yo — usuario, empresa y sucursal activas, permisos. */
  @Get('yo')
  yo(@Contexto() ctx: ContextoSesion): Promise<Perfil> {
    return this.auth.perfil(ctx);
  }

  /** POST /api/v1/auth/password — cambia la contraseña propia y cierra las demás sesiones. */
  @Post('password')
  @HttpCode(204)
  async cambiarPassword(
    @Contexto() ctx: ContextoSesion,
    @Body(new ZodPipe(cambiarPasswordSchema)) d: CambiarPasswordDatos,
  ) {
    await this.auth.cambiarPassword(ctx, d);
  }

  /** POST /api/v1/auth/logout — revoca la sesión actual. */
  @Post('logout')
  @HttpCode(204)
  async logout(@Contexto() ctx: ContextoSesion, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(ctx);
    borrarCookieSesion(res);
  }
}
