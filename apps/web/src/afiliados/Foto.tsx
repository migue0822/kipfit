import type { AfiliadoDetalle } from '@kip/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Aviso, Boton } from '../ui';

/** Dirección de la foto (la versión cambia al cambiarla, así el navegador la guarda en caché). */
export const urlFoto = (afiliadoId: string, version: number) =>
  `/api/v1/afiliados/${afiliadoId}/foto?v=${version}`;

const LADO = 360;

/** Foto redonda del afiliado; sin foto, sus iniciales. */
export function Avatar({
  afiliadoId,
  nombre,
  version,
  tamano = 'h-9 w-9 text-xs',
}: {
  afiliadoId: string;
  nombre: string;
  version: number | null;
  tamano?: string;
}) {
  const [falla, setFalla] = useState(false);
  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  if (version === null || falla) {
    return (
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-stone-200 font-semibold text-stone-600 ${tamano}`}
      >
        {iniciales}
      </span>
    );
  }
  return (
    <img
      src={urlFoto(afiliadoId, version)}
      alt={`Foto de ${nombre}`}
      onError={() => setFalla(true)}
      className={`shrink-0 rounded-full object-cover ${tamano}`}
    />
  );
}

/** Recorta al centro en cuadrado, reduce a LADO px y devuelve un JPEG en data URL. */
function reducir(fuente: CanvasImageSource, ancho: number, alto: number): string {
  const lado = Math.min(ancho, alto);
  const c = document.createElement('canvas');
  c.width = c.height = Math.min(LADO, lado);
  c.getContext('2d')!.drawImage(
    fuente,
    (ancho - lado) / 2,
    (alto - lado) / 2,
    lado,
    lado,
    0,
    0,
    c.width,
    c.height,
  );
  return c.toDataURL('image/jpeg', 0.85);
}

/** Cambiar la foto: tomarla con la cámara o subir una imagen. Se reduce en el navegador antes de enviarla. */
export function EditorFoto({
  afiliado,
  onListo,
}: {
  afiliado: AfiliadoDetalle;
  onListo: () => void;
}) {
  const qc = useQueryClient();
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const [camara, setCamara] = useState(false);
  const [vista, setVista] = useState<string | null>(null);
  const [error, setError] = useState('');

  const detener = () => {
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
    setCamara(false);
  };
  useEffect(() => detener, []);

  const guardar = useMutation({
    mutationFn: (foto: string | null) =>
      api<AfiliadoDetalle>(`/afiliados/${afiliado.id}/foto`, { method: 'PUT', body: { foto } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['afiliados'] });
      void qc.invalidateQueries({ queryKey: ['ingresos'] });
      onListo();
    },
  });

  const abrirCamara = async () => {
    setError('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      flujo.current = s;
      setCamara(true);
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
      });
    } catch {
      setError('No se pudo abrir la cámara. Permita el acceso o suba una imagen.');
    }
  };

  const capturar = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setVista(reducir(v, v.videoWidth, v.videoHeight));
    detener();
  };

  const subir = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    try {
      const bmp = await createImageBitmap(f);
      setVista(reducir(bmp, bmp.width, bmp.height));
    } catch {
      setError('No se pudo leer esa imagen. Use un JPEG, PNG o WebP.');
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
      <p className="text-sm font-medium text-stone-700">Foto de {afiliado.nombre}</p>
      {(error || guardar.isError) && <Aviso>{error || guardar.error?.message}</Aviso>}
      <div className="flex justify-center">
        {camara ? (
          <video
            ref={video}
            playsInline
            muted
            className="aspect-square w-60 rounded-full bg-black object-cover [transform:scaleX(-1)]"
          />
        ) : vista ? (
          <img src={vista} alt="Vista previa" className="h-60 w-60 rounded-full object-cover" />
        ) : (
          <Avatar
            afiliadoId={afiliado.id}
            nombre={afiliado.nombre}
            version={afiliado.fotoVersion}
            tamano="h-40 w-40 text-4xl"
          />
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {camara ? (
          <>
            <Boton type="button" onClick={capturar}>
              Tomar foto
            </Boton>
            <Boton type="button" variante="secundario" onClick={detener}>
              Cancelar cámara
            </Boton>
          </>
        ) : (
          <>
            <Boton type="button" variante="secundario" onClick={() => void abrirCamara()}>
              Usar la cámara
            </Boton>
            <Boton type="button" variante="secundario" onClick={() => archivo.current?.click()}>
              Subir imagen
            </Boton>
            <input
              ref={archivo}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                void subir(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-3">
        {afiliado.fotoVersion !== null && !vista && !camara && (
          <Boton
            type="button"
            variante="secundario"
            disabled={guardar.isPending}
            onClick={() => guardar.mutate(null)}
          >
            Quitar foto
          </Boton>
        )}
        <Boton type="button" variante="secundario" onClick={onListo}>
          Cerrar
        </Boton>
        {vista && (
          <Boton type="button" disabled={guardar.isPending} onClick={() => guardar.mutate(vista)}>
            {guardar.isPending ? 'Guardando…' : 'Guardar foto'}
          </Boton>
        )}
      </div>
    </div>
  );
}
