import { ConflictException } from '@nestjs/common';
import { CONTACTO_PLATAFORMA, PERMISO_TOTAL } from '@kip/shared';
import type { Prisma } from '../generated/prisma/client';

/**
 * Serializa los cambios de usuarios y roles de una empresa. Evita, por ejemplo,
 * que dos administradores se inactiven el uno al otro al mismo tiempo y la
 * empresa quede sin ninguno.
 */
export async function bloquearAdministracion(tx: Prisma.TransactionClient, empresaId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`administracion:${empresaId}`}))`;
}

/** Falla si, sin el usuario indicado, la empresa quedaría sin administradores activos. */
export async function exigirOtroAdministrador(
  tx: Prisma.TransactionClient,
  empresaId: string,
  usuarioId: string,
) {
  const otros = await tx.membresia.count({
    where: {
      empresaId,
      activa: true,
      usuarioId: { not: usuarioId },
      usuario: { activo: true },
      rol: { permisos: { has: PERMISO_TOTAL } },
    },
  });
  if (otros === 0) {
    throw new ConflictException('La empresa debe conservar al menos un administrador activo');
  }
}

/** El plan de la empresa limita los usuarios y las sucursales activos (sin plan o sin límite = libre). */
export async function exigirCupoPlan(
  tx: Prisma.TransactionClient,
  empresaId: string,
  que: 'usuarios' | 'sucursales',
) {
  const empresa = await tx.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: { plan: { select: { nombre: true, maxUsuarios: true, maxSucursales: true } } },
  });
  const maximo = que === 'usuarios' ? empresa.plan?.maxUsuarios : empresa.plan?.maxSucursales;
  if (maximo == null) return;
  const activos =
    que === 'usuarios'
      ? await tx.membresia.count({ where: { empresaId, activa: true, usuario: { activo: true } } })
      : await tx.sucursal.count({ where: { empresaId, activa: true } });
  if (activos >= maximo) {
    const cuales =
      que === 'usuarios'
        ? maximo === 1
          ? 'usuario activo'
          : 'usuarios activos'
        : maximo === 1
          ? 'sucursal activa'
          : 'sucursales activas';
    throw new ConflictException(
      `Su plan (${empresa.plan!.nombre}) permite ${maximo} ${cuales}. Para agregar más, comuníquese con ${CONTACTO_PLATAFORMA.nombre} (${CONTACTO_PLATAFORMA.telefono}).`,
    );
  }
}
