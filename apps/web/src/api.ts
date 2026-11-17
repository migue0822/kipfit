export type ErrorCampo = { campo: string; mensaje: string };

/** Error de la API con el mensaje para el usuario y, si aplica, los campos inválidos. */
export class ErrorApi extends Error {
  constructor(
    public readonly estado: number,
    mensaje: string,
    public readonly errores: ErrorCampo[] = [],
  ) {
    super(mensaje);
  }
}

export async function api<T>(ruta: string, opciones: { method?: string; body?: unknown } = {}) {
  const r = await fetch(`/api/v1${ruta}`, {
    method: opciones.method ?? 'GET',
    credentials: 'include',
    headers: opciones.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
  });
  if (r.status === 204) return undefined as T;

  const datos: unknown = await r.json().catch(() => null);
  if (!r.ok) {
    const cuerpo = (datos ?? {}) as { message?: unknown; mensaje?: string; errores?: ErrorCampo[] };
    const mensaje =
      cuerpo.mensaje ??
      (typeof cuerpo.message === 'string' ? cuerpo.message : undefined) ??
      'Ocurrió un error, intente de nuevo';
    throw new ErrorApi(r.status, mensaje, cuerpo.errores ?? []);
  }
  return datos as T;
}

/** Descarga un archivo de la API (con la sesión) y lo guarda con el nombre que manda el servidor. */
export async function descargar(ruta: string, nombrePorDefecto: string): Promise<string> {
  const r = await fetch(`/api/v1${ruta}`, { credentials: 'include' });
  if (!r.ok) {
    const datos = (await r.json().catch(() => null)) as {
      mensaje?: string;
      message?: unknown;
    } | null;
    throw new ErrorApi(
      r.status,
      datos?.mensaje ??
        (typeof datos?.message === 'string' ? datos.message : 'No se pudo descargar el archivo'),
    );
  }
  const nombre =
    /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? nombrePorDefecto;
  const url = URL.createObjectURL(await r.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return nombre;
}
