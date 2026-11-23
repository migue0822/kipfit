import { PERMISOS, tienePermiso, type Perfil, type TurnoVista } from '@kip/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api';
import { Aviso, Boton, Campo } from '../ui';

/**
 * Deja pasar solo con la caja del usuario abierta; si no, pide abrirla (con su base en efectivo).
 * `onCancelar` (opcional) ofrece salir sin abrir.
 */
export function ExigirCaja({
  perfil,
  motivo,
  onCancelar,
  children,
}: {
  perfil: Perfil;
  motivo: string;
  onCancelar?: () => void;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const [base, setBase] = useState('');
  const caja = useQuery({
    queryKey: ['caja', 'actual'],
    queryFn: () => api<TurnoVista | null>('/caja/actual'),
  });
  const abrir = useMutation({
    mutationFn: () =>
      api<TurnoVista>('/caja/abrir', { method: 'POST', body: { base: base || undefined } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['caja'] }),
  });
  if (caja.isPending) return <p className="text-sm text-stone-500">Verificando la caja…</p>;
  if (caja.isError) return <Aviso>{caja.error.message}</Aviso>;
  if (caja.data) return <>{children}</>;

  const puede = tienePermiso(perfil.permisos, PERMISOS.CAJA_OPERAR);
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        abrir.mutate();
      }}
      className="mx-auto max-w-md space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4"
    >
      <h2 className="font-semibold text-stone-900">Primero abra su caja</h2>
      <p className="text-sm text-stone-600">
        {motivo} Para continuar, abra su caja con la base en efectivo con la que empieza.
      </p>
      {!puede ? (
        <Aviso>
          Su rol no puede abrir la caja. Pida a un administrador el permiso de operar la caja.
        </Aviso>
      ) : (
        <>
          {abrir.isError && <Aviso>{abrir.error.message}</Aviso>}
          <Campo
            etiqueta="Base en efectivo"
            inputMode="decimal"
            placeholder="0"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          />
          <Boton type="submit" cargando={abrir.isPending}>
            Abrir caja
          </Boton>
        </>
      )}
      {onCancelar && (
        <button type="button" className="ml-3 text-sm text-stone-500" onClick={onCancelar}>
          Ahora no
        </button>
      )}
    </form>
  );
}
