import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import {
  decidirIngreso,
  type IngresoNuevoDatos,
  type IngresoVista,
  type OrigenIngreso,
  type ResumenIngresos,
  type ResultadoIngreso,
  type EstadoMembresia,
  type SuscripcionVista,
} from '@kip/shared';
import { Subject } from 'rxjs';
import type { ContextoEmpresa } from '../auth/contexto';
import { registrarAuditoria } from '../comun/auditoria';
import { aFechaDb, deFechaDb, hoyBogota } from '../comun/fechas';
import { esViolacionUnica } from '../comun/pipes';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { elegirActual } from '../afiliados/afiliados.service';

type Fila = Prisma.IngresoGetPayload<{
  include: {
    afiliado: { select: { nombre: true; documento: true } };
    suscripcion: { select: { sesionesTotal: true; sesionesUsadas: true } };
  };
}>;

const INCLUIR = {
  afiliado: { select: { nombre: true, documento: true } },
  suscripcion: { select: { sesionesTotal: true, sesionesUsadas: true } },
} as const;

export type EventoIngreso = {
  empresaId: string;
  sucursalId: string;
  tipo: 'ingreso' | 'cambio';
  ingreso: IngresoVista;
};

export function aVista(i: Fila): IngresoVista {
  const s = i.suscripcion;
  return {
    id: i.id,
    afiliadoId: i.afiliadoId,
    afiliadoNombre: i.afiliado.nombre,
    documento: i.afiliado.documento,
    fechaHora: i.fechaHora.toISOString(),
    origen: i.origen as OrigenIngreso,
    resultado: i.resultado as ResultadoIngreso,
    estadoMembresia: i.estadoMembresia as EstadoMembresia,
    planNombre: i.planNombre,
    venceEl: i.venceEl ? deFechaDb(i.venceEl) : null,
    diasVencido: i.diasVencido,
    descuentaSesion: i.descuentaSesion,
    sesionesRestantes: s && s.sesionesTotal !== null ? s.sesionesTotal - s.sesionesUsadas : null,
    alertaPendiente: !i.alertaRevisada && !i.anuladoEn,
    anulado: i.anuladoEn !== null,
    motivoAnulacion: i.motivoAnulacion,
  };
}

@Injectable()
export class IngresosService {
  /** Aviso en tiempo real a recepción (una sola instancia de la API: basta la memoria). */
  readonly eventos = new Subject<EventoIngreso>();

  constructor(private readonly prisma: PrismaService) {}

  /** Registra el ingreso por documento. Reenviar el mismo `id` devuelve el ya guardado. */
  async registrar(ctx: ContextoEmpresa, d: IngresoNuevoDatos): Promise<IngresoVista> {
    let repetido = false;
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        if (d.id) {
          const previo = await tx.ingreso.findFirst({
            where: { id: d.id, empresaId: ctx.empresaId },
            select: { id: true },
          });
          if (previo) {
            repetido = true;
            return previo.id;
          }
        }
        const af = await tx.afiliado.findFirst({
          where: { empresaId: ctx.empresaId, documento: d.documento },
          select: { id: true, activo: true },
        });
        if (!af) throw new NotFoundException('No hay un afiliado con ese documento');
        const bloqueo = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM afiliado WHERE id = ${af.id}::uuid AND empresa_id = ${ctx.empresaId}::uuid FOR UPDATE`;
        if (bloqueo.length === 0)
          throw new NotFoundException('No hay un afiliado con ese documento');

        const hoy = hoyBogota();
        const vigentes = await tx.suscripcion.findMany({
          where: { afiliadoId: af.id, empresaId: ctx.empresaId, estado: 'VIGENTE' },
        });
        const vistas = vigentes.map(
          (s) =>
            ({
              id: s.id,
              fechaInicio: deFechaDb(s.fechaInicio),
              fechaFin: deFechaDb(s.fechaFin),
            }) as SuscripcionVista,
        );
        const elegida = elegirActual(vistas, hoy);
        const s = elegida ? vigentes.find((v) => v.id === elegida.id)! : null;
        const yaHoy =
          (await tx.ingreso.count({
            where: {
              afiliadoId: af.id,
              empresaId: ctx.empresaId,
              fecha: aFechaDb(hoy),
              anuladoEn: null,
            },
          })) > 0;
        const dec = af.activo
          ? decidirIngreso(
              s && {
                tipo: s.tipo,
                fechaInicio: deFechaDb(s.fechaInicio),
                fechaFin: deFechaDb(s.fechaFin),
                sesionesTotal: s.sesionesTotal,
                sesionesUsadas: s.sesionesUsadas,
                congeladaDesde: s.congeladaDesde ? deFechaDb(s.congeladaDesde) : null,
              },
              hoy,
              yaHoy,
            )
          : decidirIngreso(null, hoy, yaHoy);
        if (dec.descuentaSesion && s) {
          await tx.suscripcion.update({
            where: { id: s.id },
            data: { sesionesUsadas: { increment: 1 } },
          });
        }
        const creado = await tx.ingreso.create({
          data: {
            ...(d.id ? { id: d.id } : { id: crypto.randomUUID() }),
            empresaId: ctx.empresaId,
            sucursalId: ctx.sucursalId,
            afiliadoId: af.id,
            suscripcionId: s?.id ?? null,
            fecha: aFechaDb(hoy),
            origen: d.origen,
            resultado: dec.resultado,
            estadoMembresia: dec.estado,
            planNombre: s?.planNombre ?? null,
            venceEl: s?.fechaFin ?? null,
            diasVencido: dec.diasVencido,
            descuentaSesion: dec.descuentaSesion,
            alertaRevisada: dec.resultado === 'PERMITIDO',
            registradoPorId: ctx.usuarioId,
          },
          select: { id: true },
        });
        return creado.id;
      });
    } catch (e) {
      if (esViolacionUnica(e)) throw new ConflictException('El ingreso ya existe');
      throw e;
    }
    const vista = await this.obtener(ctx, id);
    if (!repetido) this.avisar(ctx, 'ingreso', vista);
    return { ...vista, ...(repetido ? { repetido: true } : {}) };
  }

  async obtener(ctx: ContextoEmpresa, id: string): Promise<IngresoVista> {
    const i = await this.prisma.ingreso.findFirst({
      where: { id, empresaId: ctx.empresaId },
      include: INCLUIR,
    });
    if (!i) throw new NotFoundException('Ingreso no encontrado');
    return aVista(i);
  }

  /** Ingresos de un día de la sucursal de la sesión (hoy por defecto), el más reciente primero. */
  async listar(ctx: ContextoEmpresa, fecha?: string): Promise<ResumenIngresos> {
    const dia = fecha ?? hoyBogota();
    const filas = await this.prisma.ingreso.findMany({
      where: { empresaId: ctx.empresaId, sucursalId: ctx.sucursalId, fecha: aFechaDb(dia) },
      include: INCLUIR,
      orderBy: { fechaHora: 'desc' },
      take: 1000,
    });
    const ingresos = filas.map(aVista);
    const vigentes = ingresos.filter((i) => !i.anulado);
    return {
      fecha: dia,
      total: vigentes.length,
      alertas: vigentes.filter((i) => i.resultado === 'ALERTA').length,
      pendientes: vigentes.filter((i) => i.alertaPendiente).length,
      ingresos,
    };
  }

  /** Historial de un afiliado (últimos 50). */
  async deAfiliado(ctx: ContextoEmpresa, afiliadoId: string): Promise<IngresoVista[]> {
    const filas = await this.prisma.ingreso.findMany({
      where: { empresaId: ctx.empresaId, afiliadoId },
      include: INCLUIR,
      orderBy: { fechaHora: 'desc' },
      take: 50,
    });
    return filas.map(aVista);
  }

  /** Recepción acepta la alerta (deja pasar a la persona). */
  async revisar(ctx: ContextoEmpresa, id: string): Promise<IngresoVista> {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.ingreso.updateMany({
        where: { id, empresaId: ctx.empresaId, alertaRevisada: false, anuladoEn: null },
        data: { alertaRevisada: true },
      });
      if (r.count === 0) {
        const existe = await tx.ingreso.count({ where: { id, empresaId: ctx.empresaId } });
        if (!existe) throw new NotFoundException('Ingreso no encontrado');
        throw new ConflictException('La alerta ya estaba revisada o el ingreso está anulado');
      }
      await registrarAuditoria(tx, ctx, { entidad: 'ingreso', entidadId: id, accion: 'revisar' });
    });
    const v = await this.obtener(ctx, id);
    this.avisar(ctx, 'cambio', v);
    return v;
  }

  /** Anular devuelve la sesión de la tiquetera; el ingreso queda en el historial. */
  async anular(ctx: ContextoEmpresa, id: string, motivo: string): Promise<IngresoVista> {
    await this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM ingreso WHERE id = ${id}::uuid AND empresa_id = ${ctx.empresaId}::uuid FOR UPDATE`;
      if (filas.length === 0) throw new NotFoundException('Ingreso no encontrado');
      const i = await tx.ingreso.findFirstOrThrow({ where: { id, empresaId: ctx.empresaId } });
      if (i.anuladoEn) throw new ConflictException('El ingreso ya está anulado');
      if (i.descuentaSesion && i.suscripcionId) {
        await tx.suscripcion.update({
          where: { id: i.suscripcionId },
          data: { sesionesUsadas: { decrement: 1 } },
        });
      }
      await tx.ingreso.update({
        where: { id },
        data: { anuladoEn: new Date(), motivoAnulacion: motivo, alertaRevisada: true },
      });
      await registrarAuditoria(tx, ctx, {
        entidad: 'ingreso',
        entidadId: id,
        accion: 'anular',
        despues: { motivo },
      });
    });
    const v = await this.obtener(ctx, id);
    this.avisar(ctx, 'cambio', v);
    return v;
  }

  /** Ingresos vigentes de cada empresa en el mes en curso (consola de plataforma). */
  async delMes(empresaIds: string[]): Promise<Map<string, number>> {
    const hoy = hoyBogota();
    const desde = aFechaDb(`${hoy.slice(0, 8)}01`);
    const filas = await this.prisma.ingreso.groupBy({
      by: ['empresaId'],
      where: { empresaId: { in: empresaIds }, fecha: { gte: desde }, anuladoEn: null },
      _count: { _all: true },
    });
    return new Map(filas.map((f) => [f.empresaId, f._count._all]));
  }

  private avisar(ctx: ContextoEmpresa, tipo: EventoIngreso['tipo'], ingreso: IngresoVista) {
    this.eventos.next({ empresaId: ctx.empresaId, sucursalId: ctx.sucursalId, tipo, ingreso });
  }
}
