import {
  empresaDatosSchema,
  type EmpresaConfiguracion,
  type EmpresaDatosEntrada,
} from '@kip/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { EncabezadoPagina } from '../componentes';
import { Aviso, Boton, Campo, erroresDeApi, validar, type Errores } from '../ui';

export function Empresa() {
  const empresa = useQuery({
    queryKey: ['empresa'],
    queryFn: () => api<EmpresaConfiguracion>('/empresa'),
  });
  return (
    <>
      <EncabezadoPagina
        titulo="Empresa"
        descripcion="Datos de la empresa. Salen en el encabezado de las tirillas."
      />
      {empresa.isError && <Aviso>{empresa.error.message}</Aviso>}
      {empresa.data && <EmpresaFormulario key={empresa.dataUpdatedAt} empresa={empresa.data} />}
    </>
  );
}

function EmpresaFormulario({ empresa: e }: { empresa: EmpresaConfiguracion }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    razonSocial: e.razonSocial,
    nombreComercial: e.nombreComercial ?? '',
    direccion: e.direccion ?? '',
    telefono: e.telefono ?? '',
    email: e.email ?? '',
  });
  const [errores, setErrores] = useState<Errores>({});
  const [guardado, setGuardado] = useState(false);
  const guardar = useMutation({
    mutationFn: (body: EmpresaDatosEntrada) =>
      api<EmpresaConfiguracion>('/empresa', { method: 'PUT', body }),
    onSuccess: () => {
      setGuardado(true);
      void qc.invalidateQueries({ queryKey: ['empresa'] });
      // El menú muestra el nombre de la empresa desde el perfil.
      void qc.invalidateQueries({ queryKey: ['perfil'] });
    },
  });

  const campo = (k: keyof typeof f) => ({
    value: f[k],
    error: errores[k],
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => {
      setGuardado(false);
      setF({ ...f, [k]: ev.target.value });
    },
  });

  function enviar(ev: FormEvent) {
    ev.preventDefault();
    const { datos, errores } = validar(empresaDatosSchema, f);
    setErrores(errores);
    if (datos) guardar.mutate(datos, { onError: (err) => setErrores(erroresDeApi(err)) });
  }

  return (
    <form
      onSubmit={enviar}
      noValidate
      className="max-w-2xl space-y-4 rounded-lg border border-stone-200 bg-white p-5"
    >
      {guardar.isError && <Aviso>{guardar.error.message}</Aviso>}
      <p className="text-sm text-stone-600">
        NIT{' '}
        <span className="font-medium tabular-nums text-stone-900">
          {e.nit}-{e.dv}
        </span>{' '}
        (no se cambia)
      </p>
      <Campo etiqueta="Razón social o nombre" {...campo('razonSocial')} />
      <Campo
        etiqueta="Nombre comercial"
        ayuda="Si lo tiene, sale en grande en la tirilla."
        {...campo('nombreComercial')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Dirección" {...campo('direccion')} />
        <Campo etiqueta="Teléfono" inputMode="tel" {...campo('telefono')} />
      </div>
      <Campo etiqueta="Correo" type="email" {...campo('email')} />
      <div className="flex items-center gap-3 border-t border-stone-200 pt-4">
        <Boton type="submit" cargando={guardar.isPending}>
          Guardar
        </Boton>
        {guardado && <span className="text-sm text-emerald-700">Cambios guardados.</span>}
      </div>
    </form>
  );
}
