import type { CookieOptions, Response } from 'express';

export const COOKIE_SESION = 'kip_sesion';

/** Duración de una sesión sin actividad. Se renueva sola mientras se use. */
export const DURACION_SESION_MS = 12 * 60 * 60 * 1000;

function opciones(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

export function ponerCookieSesion(res: Response, token: string) {
  res.cookie(COOKIE_SESION, token, { ...opciones(), maxAge: DURACION_SESION_MS });
}

export function borrarCookieSesion(res: Response) {
  res.clearCookie(COOKIE_SESION, opciones());
}
