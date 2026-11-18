import type { PlanGimnasio, ResultadoImportarAfiliados } from '@kip/shared';
import { MAX_FILAS_IMPORTAR_AFILIADOS } from '@kip/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api } from '../api';
import { Panel } from '../componentes';
import { Aviso, Boton } from '../ui';
import { descargarPlantilla, leerArchivo, type LecturaArchivo } from './importar';

/** Importar afiliados desde Excel: bajar la plantilla, llenarla y subirla. Todo o nada. */
export function ImportarAfiliados({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const planes = useQuery({
    queryKey: ['planes'],
    queryFn: () => api<PlanGimnasio[]>('/planes'),
    enabled: abierto,
  });
  const [lectura, setLectura] = useState<(LecturaArchivo & { nombre: string }) | null>(null);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportarAfiliados | null>(null);

  const cerrar = () => {
    setLectura(null);
    setError('');
    setResultado(null);
    onCerrar();
  };

  const subir = useMutation({
    mutationFn: (l: LecturaArchivo) =>
      api<ResultadoImportarAfiliados>('/afiliados/importar', {
        method: 'POST',
        body: { filas: l.filas },
      }),
    onSuccess: (r) => {
      setResultado(r);
      setLectura(null);
      void qc.invalidateQueries({ queryKey: ['afiliados'] });
    },
  });

  const alElegir = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    setResultado(null);
    subir.reset();
    setTrabajando(true);
    try {
      setLectura({ ...(await leerArchivo(f, planes.data ?? [])), nombre: f.name });
    } catch (e) {
      setLectura(null);
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    } finally {
      setTrabajando(false);
    }
  };

  const conErrores = lectura && lectura.errores.length > 0;
  const exceso = lectura && lectura.filas.length > MAX_FILAS_IMPORTAR_AFILIADOS;

  return (
    <Panel titulo="Importar afiliados desde Excel" abierto={abierto} onCerrar={cerrar} amplio>
      <div className="space-y-5 text-sm text-stone-700">
        <section className="space-y-2">
          <h3 className="font-medium text-stone-900">1. Descargue la plantilla</h3>
          <p>
            Llénela con un afiliado por fila (documento y nombre son obligatorios). Si quiere cargar
            la membresía que ya tenían, escoja el plan y la fecha en que vence; puede ser una fecha
            pasada. No se genera ningún cobro.
          </p>
          <Boton
            variante="secundario"
            disabled={planes.isPending}
            onClick={() => void descargarPlantilla(planes.data ?? [])}
          >
            Descargar plantilla de Excel
          </Boton>
          {planes.data && planes.data.filter((p) => p.activo).length === 0 && (
            <p className="text-xs text-amber-700">
              Todavía no hay planes activos: la plantilla servirá para cargar afiliados sin
              membresía.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-medium text-stone-900">2. Suba el archivo lleno</h3>
          <input
            ref={entrada}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              void alElegir(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Boton
            disabled={trabajando || planes.isPending || subir.isPending}
            onClick={() => entrada.current?.click()}
          >
            {trabajando ? 'Leyendo…' : 'Escoger archivo (.xlsx)'}
          </Boton>
          {error && <Aviso>{error}</Aviso>}
        </section>

        {lectura && (
          <section className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
            <p className="font-medium text-stone-900">{lectura.nombre}</p>
            {conErrores ? (
              <>
                <Aviso>
                  Hay {lectura.errores.length} {lectura.errores.length === 1 ? 'error' : 'errores'}.
                  No se cargó nada: corrija el archivo y vuelva a subirlo.
                </Aviso>
                <ul className="max-h-72 divide-y divide-stone-200 overflow-y-auto rounded border border-stone-200 bg-white">
                  {lectura.errores.slice(0, 200).map((e, i) => (
                    <li key={i} className="px-3 py-1.5 text-xs">
                      <span className="font-medium">Fila {e.fila}</span>
                      {e.columna && <span className="text-stone-500"> · {e.columna}</span>}:{' '}
                      {e.mensaje}
                    </li>
                  ))}
                </ul>
                {lectura.errores.length > 200 && (
                  <p className="text-xs text-stone-500">Se muestran los primeros 200 errores.</p>
                )}
              </>
            ) : lectura.filas.length === 0 ? (
              <Aviso>
                No se encontraron filas con datos. ¿Borró todo o cambió los títulos de la primera
                fila?
              </Aviso>
            ) : exceso ? (
              <Aviso>
                El archivo tiene {lectura.filas.length} filas; el máximo es{' '}
                {MAX_FILAS_IMPORTAR_AFILIADOS}. Divídalo en varios.
              </Aviso>
            ) : (
              <>
                <p>
                  Listo para cargar <b>{lectura.filas.length}</b>{' '}
                  {lectura.filas.length === 1 ? 'afiliado' : 'afiliados'}, de los cuales{' '}
                  {lectura.filas.filter((f) => f.planId).length} traen membresía. Los que ya existan
                  (mismo documento) se dejan como están.
                </p>
                {subir.isError && <Aviso>{subir.error.message}</Aviso>}
                <Boton disabled={subir.isPending} onClick={() => subir.mutate(lectura)}>
                  {subir.isPending ? 'Importando…' : `Importar ${lectura.filas.length} afiliados`}
                </Boton>
              </>
            )}
          </section>
        )}

        {resultado && (
          <section className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-medium text-emerald-900">
              Se crearon {resultado.creados} {resultado.creados === 1 ? 'afiliado' : 'afiliados'}
              {resultado.conMembresia > 0 ? `, ${resultado.conMembresia} con su membresía` : ''}.
            </p>
            {resultado.omitidos.length > 0 && (
              <p className="text-xs text-stone-700">
                Ya existían y no se tocaron ({resultado.omitidos.length}):{' '}
                {resultado.omitidos.slice(0, 30).join(', ')}
                {resultado.omitidos.length > 30 ? '…' : ''}
              </p>
            )}
            <Boton variante="secundario" onClick={cerrar}>
              Cerrar
            </Boton>
          </section>
        )}
      </div>
    </Panel>
  );
}
