import { PERMISO_TOTAL, ROL_ADMINISTRADOR, ROLES_SUGERIDOS, type Registro } from '@kip/shared';
import { aFechaDb } from '../comun/fechas';
import { crearNumeraciones } from '../comun/numeracion';
import type { Prisma } from '../generated/prisma/client';

/**
 * Crea la empresa con su sucursal principal, sus numeraciones, los roles y la membresía de
 * administrador del usuario. Corre dentro de la transacción del registro.
 */
export async function crearEmpresaEnTx(
  tx: Prisma.TransactionClient,
  datos: Pick<Registro, 'empresa' | 'sucursal'>,
  usuarioId: string,
  licencia: {
    planId?: string | null;
    /** Fin de la demostración o de lo pagado; null = sin vencimiento. */
    pagadoHasta?: string | null;
    notas?: string;
    /** Desde la consola de plataforma: quién la creó (no es usuario de Kipfit). */
    creadaPor?: string;
  } = {},
) {
  const empresa = await tx.empresa.create({
    data: {
      nit: datos.empresa.nit,
      dv: datos.empresa.dv,
      razonSocial: datos.empresa.razonSocial,
      planId: licencia.planId ?? null,
      pagadoHasta: licencia.pagadoHasta ? aFechaDb(licencia.pagadoHasta) : null,
      licenciaNotas: licencia.notas || null,
    },
    select: { id: true, nit: true, razonSocial: true },
  });
  const sucursal = await tx.sucursal.create({
    data: {
      empresaId: empresa.id,
      codigo: '01',
      nombre: datos.sucursal.nombre,
      direccion: datos.sucursal.direccion,
    },
  });
  await crearNumeraciones(tx, sucursal);

  const rol = await tx.rol.create({
    data: { empresaId: empresa.id, nombre: ROL_ADMINISTRADOR, permisos: [PERMISO_TOTAL] },
  });
  await tx.rol.createMany({
    data: ROLES_SUGERIDOS.map((r) => ({ empresaId: empresa.id, ...r })),
  });
  await tx.membresia.create({
    data: { usuarioId, empresaId: empresa.id, rolId: rol.id },
  });
  await tx.auditoria.create({
    data: {
      empresaId: empresa.id,
      sucursalId: sucursal.id,
      usuarioId: licencia.creadaPor ? null : usuarioId,
      entidad: 'empresa',
      entidadId: empresa.id,
      accion: licencia.creadaPor ? 'plataforma_crear' : 'registro',
      despues: {
        nit: empresa.nit,
        razonSocial: empresa.razonSocial,
        planId: licencia.planId ?? null,
        pagadoHasta: licencia.pagadoHasta ?? null,
        ...(licencia.creadaPor ? { por: licencia.creadaPor } : {}),
      },
    },
  });
  return { empresaId: empresa.id, sucursalId: sucursal.id };
}
