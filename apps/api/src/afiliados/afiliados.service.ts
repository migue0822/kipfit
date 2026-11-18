import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  diasEntre,
  estadoMembresia,
  finMembresia,
  inicioRenovacion,
  normalizarBusqueda,
  sumarDiasFecha,
  DIAS_POR_VENCER,
  type AfiliadoDatos,
  type AfiliadoDetalle,
  type AfiliadoNuevoDatos,
  type AfiliadoResumen,
  type CambiarEstado,
  type MembresiaNuevaDatos,
  type Paginado,
  type SuscripcionVista,
  type TipoPlan,
} from '@kip/shared';
import { MAX_BYTES_FOTO } from '@kip/shared';
import type { ContextoEmpresa } from '../auth/contexto';
import { registrarAuditoria } from '../comun/auditoria';
import { aFechaDb, deFechaDb, hoyBogota } from '../comun/fechas';
import { esViolacionUnica, filtroEstado, terminosBusqueda } from '../comun/pipes';
import type { Prisma } from '../generated/prisma/client';
import { CajaService } from '../caja/caja.service';
import { PrismaService } from '../prisma/prisma.service';

const DOC_REPETIDO = 'Ya existe un afiliado con ese documento';

type FilaSuscripcion = Prisma.SuscripcionGetPayload<{
  include: { recibo: { select: { id: true; prefijo: true; numero: true; estado: true } } };
}>;

const aSuscripcionVista = (s: FilaSuscripcion): SuscripcionVista => ({
  id: s.id,
  planId: s.planId,
  planNombre: s.planNombre,
  tipo: s.tipo as TipoPlan,
  precio: s.precio.toFixed(2),
  fechaInicio: deFechaDb(s.fechaInicio),
  fechaFin: deFechaDb(s.fechaFin),
  sesionesTotal: s.sesionesTotal,
  sesionesUsadas: s.sesionesUsadas,
  congeladaDesde: s.congeladaDesde ? deFechaDb(s.congeladaDesde) : null,
  diasCongelados: s.diasCongelados,
  estado: s.estado as 'VIGENTE' | 'ANULADA',
  motivoAnulacion: s.motivoAnulacion,
  creadoEn: s.creadoEn.toISOString(),
  recibo: s.recibo
    ? {
        id: s.recibo.id,
        numero: `${s.recibo.prefijo}-${s.recibo.numero}`,
        anulado: s.recibo.estado === 'ANULADO',
      }
    : null,
});

/** La membresía que cuenta hoy: la vigente ya iniciada que termina más tarde; si ninguna, la próxima. */
export function elegirActual(vigentes: SuscripcionVista[], hoy: string): SuscripcionVista | null {
  const orden = [...vigentes].sort((a, b) => b.fechaFin.localeCompare(a.fechaFin));
  return orden.find((s) => s.fechaInicio <= hoy) ?? orden[orden.length - 1] ?? null;
}

function resumen(
  a: {
    id: string;
    documento: string;
    nombre: string;
    telefono: string | null;
    activo: boolean;
    foto: { actualizadoEn: Date } | null;
  },
  vigentes: SuscripcionVista[],
  hoy: string,
): AfiliadoResumen {
  const s = elegirActual(vigentes, hoy);
  const estado = estadoMembresia(s, hoy);
  return {
    id: a.id,
    documento: a.documento,
    nombre: a.nombre,
    telefono: a.telefono,
    activo: a.activo,
    estadoMembresia: estado,
    planNombre: s?.planNombre ?? null,
    fechaFin: s?.fechaFin ?? null,
    diasRestantes: s ? diasEntre(hoy, s.fechaFin) : null,
    sesionesRestantes: s && s.sesionesTotal !== null ? s.sesionesTotal - s.sesionesUsadas : null,
    fotoVersion: a.foto ? a.foto.actualizadoEn.getTime() : null,
  };
}

const textoBusqueda = (d: { nombre: string; documento: string; telefono?: string }) =>
  normalizarBusqueda(`${d.nombre} ${d.documento} ${d.telefono ?? ''}`);

/** Tipo de imagen según sus primeros bytes (no se confía en el encabezado). */
export function tipoDeImagen(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length > 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    b.length > 12 &&
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

@Injectable()
export class AfiliadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caja: CajaService,
  ) {}

  async listar(
    ctx: ContextoEmpresa,
    q: {
      buscar?: string;
      estado: 'activos' | 'inactivos' | 'todos';
      membresia: string;
      pagina: number;
      porPagina: number;
    },
  ): Promise<Paginado<AfiliadoResumen>> {
    const hoy = hoyBogota();
    const hoyDb = aFechaDb(hoy);
    const limite = aFechaDb(sumarDiasFecha(hoy, DIAS_POR_VENCER));
    const vigenteHoy = { estado: 'VIGENTE', fechaFin: { gte: hoyDb } };
    const filtros: Prisma.AfiliadoWhereInput[] = terminosBusqueda(q.buscar).map((t) => ({
      textoBusqueda: { contains: t },
    }));
    if (q.membresia === 'vigentes') {
      filtros.push({ suscripciones: { some: { ...vigenteHoy, fechaInicio: { lte: hoyDb } } } });
    } else if (q.membresia === 'por_vencer') {
      filtros.push({
        suscripciones: {
          some: {
            ...vigenteHoy,
            fechaInicio: { lte: hoyDb },
            fechaFin: { gte: hoyDb, lte: limite },
          },
          none: { estado: 'VIGENTE', fechaFin: { gt: limite } },
        },
      });
    } else if (q.membresia === 'vencidas') {
      filtros.push({
        suscripciones: { some: { estado: 'VIGENTE' }, none: vigenteHoy },
      });
    } else if (q.membresia === 'sin') {
      filtros.push({ suscripciones: { none: { estado: 'VIGENTE' } } });
    }
    const where: Prisma.AfiliadoWhereInput = {
      empresaId: ctx.empresaId,
      ...filtroEstado(q.estado),
      AND: filtros,
    };
    const [total, filas] = await Promise.all([
      this.prisma.afiliado.count({ where }),
      this.prisma.afiliado.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (q.pagina - 1) * q.porPagina,
        take: q.porPagina,
        include: {
          foto: { select: { actualizadoEn: true } },
          suscripciones: {
            where: { estado: 'VIGENTE' },
            orderBy: { fechaFin: 'desc' },
            take: 4,
            include: {
              recibo: { select: { id: true, prefijo: true, numero: true, estado: true } },
            },
          },
        },
      }),
    ]);
    return {
      datos: filas.map((a) => resumen(a, a.suscripciones.map(aSuscripcionVista), hoy)),
      total,
      pagina: q.pagina,
      porPagina: q.porPagina,
    };
  }

  async obtener(ctx: ContextoEmpresa, id: string): Promise<AfiliadoDetalle> {
    const a = await this.prisma.afiliado.findFirst({
      where: { id, empresaId: ctx.empresaId },
      include: {
        foto: { select: { actualizadoEn: true } },
        sucursal: { select: { nombre: true } },
        referidoPor: { select: { id: true, nombre: true } },
        suscripciones: {
          orderBy: [{ fechaInicio: 'desc' }, { creadoEn: 'desc' }],
          include: { recibo: { select: { id: true, prefijo: true, numero: true, estado: true } } },
        },
      },
    });
    if (!a) throw new NotFoundException('Afiliado no encontrado');
    const hoy = hoyBogota();
    const todas = a.suscripciones.map(aSuscripcionVista);
    return {
      ...resumen(
        a,
        todas.filter((s) => s.estado === 'VIGENTE'),
        hoy,
      ),
      fechaNacimiento: a.fechaNacimiento ? deFechaDb(a.fechaNacimiento) : null,
      notas: a.notas,
      referidoPor: a.referidoPor,
      sucursalNombre: a.sucursal.nombre,
      creadoEn: a.creadoEn.toISOString(),
      suscripciones: todas,
    };
  }

  async crear(ctx: ContextoEmpresa, d: AfiliadoNuevoDatos): Promise<AfiliadoDetalle> {
    const { planId, fechaInicio, ...datos } = d;
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        await this.validarReferido(tx, ctx, datos.referidoPorId);
        const a = await tx.afiliado.create({
          data: this.datosAfiliado(ctx, datos),
          select: { id: true },
        });
        await registrarAuditoria(tx, ctx, {
          entidad: 'afiliado',
          entidadId: a.id,
          accion: 'crear',
          despues: datos,
        });
        if (planId) await this.venderEnTx(tx, ctx, a.id, { planId, fechaInicio });
        return a.id;
      });
      return this.obtener(ctx, id);
    } catch (e) {
      if (esViolacionUnica(e)) throw new ConflictException(DOC_REPETIDO);
      throw e;
    }
  }

  async editar(ctx: ContextoEmpresa, id: string, d: AfiliadoDatos): Promise<AfiliadoDetalle> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const antes = await tx.afiliado.findFirst({ where: { id, empresaId: ctx.empresaId } });
        if (!antes) throw new NotFoundException('Afiliado no encontrado');
        if (d.referidoPorId === id)
          throw new BadRequestException('Un afiliado no se refiere a sí mismo');
        await this.validarReferido(tx, ctx, d.referidoPorId);
        await tx.afiliado.update({
          where: { id },
          data: {
            documento: d.documento,
            nombre: d.nombre,
            telefono: d.telefono ?? null,
            fechaNacimiento: d.fechaNacimiento ? aFechaDb(d.fechaNacimiento) : null,
            referidoPorId: d.referidoPorId ?? null,
            notas: d.notas ?? null,
            textoBusqueda: textoBusqueda(d),
          },
        });
        await registrarAuditoria(tx, ctx, {
          entidad: 'afiliado',
          entidadId: id,
          accion: 'editar',
          antes: {
            documento: antes.documento,
            nombre: antes.nombre,
            telefono: antes.telefono,
            fechaNacimiento: antes.fechaNacimiento ? deFechaDb(antes.fechaNacimiento) : null,
            referidoPorId: antes.referidoPorId,
            notas: antes.notas,
          },
          despues: d,
        });
      });
    } catch (e) {
      if (esViolacionUnica(e)) throw new ConflictException(DOC_REPETIDO);
      throw e;
    }
    return this.obtener(ctx, id);
  }

  async cambiarEstado(
    ctx: ContextoEmpresa,
    id: string,
    d: CambiarEstado,
  ): Promise<AfiliadoDetalle> {
    await this.prisma.$transaction(async (tx) => {
      const a = await tx.afiliado.findFirst({
        where: { id, empresaId: ctx.empresaId },
        select: { nombre: true },
      });
      if (!a) throw new NotFoundException('Afiliado no encontrado');
      await tx.afiliado.update({ where: { id }, data: { activo: d.activo } });
      await registrarAuditoria(tx, ctx, {
        entidad: 'afiliado',
        entidadId: id,
        accion: d.activo ? 'reactivar' : 'inactivar',
        despues: { nombre: a.nombre },
      });
    });
    return this.obtener(ctx, id);
  }

  // ───────────── Foto ─────────────

  /** Guarda (o quita, con null) la foto. El tipo se decide por los bytes, no por lo que diga el cliente. */
  async guardarFoto(
    ctx: ContextoEmpresa,
    id: string,
    foto: string | null,
  ): Promise<AfiliadoDetalle> {
    let datos: { tipo: string; contenido: Buffer<ArrayBuffer> } | null = null;
    if (foto) {
      const contenido = Buffer.from(
        foto.slice(foto.indexOf(',') + 1),
        'base64',
      ) as Buffer<ArrayBuffer>;
      const tipo = tipoDeImagen(contenido);
      if (!tipo) throw new BadRequestException('La foto debe ser JPEG, PNG o WebP');
      if (contenido.length > MAX_BYTES_FOTO)
        throw new BadRequestException('La foto es muy pesada (máximo 300 KB)');
      datos = { tipo, contenido };
    }
    await this.prisma.$transaction(async (tx) => {
      await this.bloquearAfiliado(tx, ctx, id);
      if (datos) {
        await tx.afiliadoFoto.upsert({
          where: { afiliadoId: id },
          create: { afiliadoId: id, empresaId: ctx.empresaId, ...datos },
          update: { ...datos, actualizadoEn: new Date() },
        });
      } else {
        await tx.afiliadoFoto.deleteMany({ where: { afiliadoId: id, empresaId: ctx.empresaId } });
      }
      await registrarAuditoria(tx, ctx, {
        entidad: 'afiliado',
        entidadId: id,
        accion: datos ? 'cambiar_foto' : 'quitar_foto',
      });
    });
    return this.obtener(ctx, id);
  }

  async leerFoto(ctx: ContextoEmpresa, id: string) {
    const f = await this.prisma.afiliadoFoto.findFirst({
      where: { afiliadoId: id, empresaId: ctx.empresaId },
      select: { tipo: true, contenido: true },
    });
    if (!f) throw new NotFoundException('El afiliado no tiene foto');
    return f;
  }

  // ───────────── Membresías ─────────────

  /** Vender o renovar: crea la membresía a partir de un plan (guarda su foto y su precio). */
  async vender(ctx: ContextoEmpresa, afiliadoId: string, d: MembresiaNuevaDatos) {
    await this.prisma.$transaction((tx) => this.venderEnTx(tx, ctx, afiliadoId, d));
    return this.obtener(ctx, afiliadoId);
  }

  async congelar(ctx: ContextoEmpresa, afiliadoId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.bloquearAfiliado(tx, ctx, afiliadoId);
      const s = await this.suscripcion(tx, ctx, afiliadoId, id);
      const hoy = hoyBogota();
      if (s.estado !== 'VIGENTE') throw new ConflictException('La membresía está anulada');
      if (s.congeladaDesde) throw new ConflictException('La membresía ya está congelada');
      if (deFechaDb(s.fechaFin) < hoy)
        throw new ConflictException('La membresía ya venció: no se puede congelar');
      if (deFechaDb(s.fechaInicio) > hoy)
        throw new ConflictException('La membresía aún no ha empezado');
      await tx.suscripcion.update({ where: { id }, data: { congeladaDesde: aFechaDb(hoy) } });
      await registrarAuditoria(tx, ctx, {
        entidad: 'suscripcion',
        entidadId: id,
        accion: 'congelar',
        despues: { afiliadoId, desde: hoy },
      });
    });
    return this.obtener(ctx, afiliadoId);
  }

  /** Descongelar corre la fecha fin los días que estuvo congelada (y la de las membresías que siguen). */
  async descongelar(ctx: ContextoEmpresa, afiliadoId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.bloquearAfiliado(tx, ctx, afiliadoId);
      const s = await this.suscripcion(tx, ctx, afiliadoId, id);
      if (!s.congeladaDesde) throw new ConflictException('La membresía no está congelada');
      const hoy = hoyBogota();
      const dias = Math.max(0, diasEntre(deFechaDb(s.congeladaDesde), hoy));
      const finAnterior = deFechaDb(s.fechaFin);
      await tx.suscripcion.update({
        where: { id },
        data: {
          congeladaDesde: null,
          diasCongelados: s.diasCongelados + dias,
          fechaFin: aFechaDb(sumarDiasFecha(finAnterior, dias)),
        },
      });
      if (dias > 0) {
        const siguientes = await tx.suscripcion.findMany({
          where: {
            afiliadoId,
            estado: 'VIGENTE',
            id: { not: id },
            fechaInicio: { gt: s.fechaFin },
          },
        });
        for (const n of siguientes) {
          await tx.suscripcion.update({
            where: { id: n.id },
            data: {
              fechaInicio: aFechaDb(sumarDiasFecha(deFechaDb(n.fechaInicio), dias)),
              fechaFin: aFechaDb(sumarDiasFecha(deFechaDb(n.fechaFin), dias)),
            },
          });
        }
      }
      await registrarAuditoria(tx, ctx, {
        entidad: 'suscripcion',
        entidadId: id,
        accion: 'descongelar',
        despues: { afiliadoId, diasCongelados: dias, fechaFin: sumarDiasFecha(finAnterior, dias) },
      });
    });
    return this.obtener(ctx, afiliadoId);
  }

  /** Anular no borra: la membresía queda en el historial con su motivo. */
  async anular(ctx: ContextoEmpresa, afiliadoId: string, id: string, motivo: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.bloquearAfiliado(tx, ctx, afiliadoId);
      const s = await this.suscripcion(tx, ctx, afiliadoId, id);
      if (s.estado === 'ANULADA') throw new ConflictException('La membresía ya está anulada');
      // Si se cobró, el recibo se anula con ella (solo con la caja del cobro abierta).
      await this.caja.anularReciboDeMembresia(tx, ctx, id, motivo);
      await tx.suscripcion.update({
        where: { id },
        data: {
          estado: 'ANULADA',
          motivoAnulacion: motivo,
          anuladaEn: new Date(),
          congeladaDesde: null,
        },
      });
      await registrarAuditoria(tx, ctx, {
        entidad: 'suscripcion',
        entidadId: id,
        accion: 'anular',
        despues: { afiliadoId, motivo, plan: s.planNombre },
      });
    });
    return this.obtener(ctx, afiliadoId);
  }

  // ───────────── Internos ─────────────

  private datosAfiliado(ctx: ContextoEmpresa, d: AfiliadoDatos) {
    return {
      empresaId: ctx.empresaId,
      sucursalId: ctx.sucursalId,
      documento: d.documento,
      nombre: d.nombre,
      telefono: d.telefono ?? null,
      fechaNacimiento: d.fechaNacimiento ? aFechaDb(d.fechaNacimiento) : null,
      referidoPorId: d.referidoPorId ?? null,
      notas: d.notas ?? null,
      textoBusqueda: textoBusqueda(d),
    };
  }

  private async validarReferido(tx: Prisma.TransactionClient, ctx: ContextoEmpresa, id?: string) {
    if (!id) return;
    const r = await tx.afiliado.count({ where: { id, empresaId: ctx.empresaId } });
    if (r === 0) throw new BadRequestException('El afiliado que lo refirió no existe');
  }

  /** Serializa las ventas y cambios de membresía de un mismo afiliado. */
  private async bloquearAfiliado(tx: Prisma.TransactionClient, ctx: ContextoEmpresa, id: string) {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM afiliado WHERE id = ${id}::uuid AND empresa_id = ${ctx.empresaId}::uuid FOR UPDATE`;
    if (filas.length === 0) throw new NotFoundException('Afiliado no encontrado');
  }

  private async suscripcion(
    tx: Prisma.TransactionClient,
    ctx: ContextoEmpresa,
    afiliadoId: string,
    id: string,
  ) {
    const s = await tx.suscripcion.findFirst({
      where: { id, afiliadoId, empresaId: ctx.empresaId },
    });
    if (!s) throw new NotFoundException('Membresía no encontrada');
    return s;
  }

  private async venderEnTx(
    tx: Prisma.TransactionClient,
    ctx: ContextoEmpresa,
    afiliadoId: string,
    d: MembresiaNuevaDatos,
  ) {
    await this.bloquearAfiliado(tx, ctx, afiliadoId);
    const afiliado = await tx.afiliado.findFirstOrThrow({
      where: { id: afiliadoId, empresaId: ctx.empresaId },
      select: { activo: true },
    });
    if (!afiliado.activo)
      throw new ConflictException('El afiliado está inactivo: reactívelo primero');
    const plan = await tx.planGimnasio.findFirst({
      where: { id: d.planId, empresaId: ctx.empresaId },
    });
    if (!plan) throw new BadRequestException('El plan no existe');
    if (!plan.activo) throw new ConflictException('El plan está inactivo');

    const hoy = hoyBogota();
    const ultima = await tx.suscripcion.findFirst({
      where: { afiliadoId, estado: 'VIGENTE' },
      orderBy: { fechaFin: 'desc' },
      select: { fechaFin: true },
    });
    const finActual = ultima ? deFechaDb(ultima.fechaFin) : null;
    const inicio = d.fechaInicio ?? inicioRenovacion(finActual, hoy);
    if (inicio < hoy)
      throw new BadRequestException('La membresía no puede empezar en una fecha pasada');
    if (finActual && inicio <= finActual && finActual >= hoy) {
      throw new ConflictException(
        `El afiliado ya tiene membresía hasta el ${finActual}: la nueva puede empezar desde el ${sumarDiasFecha(finActual, 1)}`,
      );
    }
    const fin = finMembresia(inicio, plan.dias);
    const s = await tx.suscripcion.create({
      data: {
        empresaId: ctx.empresaId,
        sucursalId: ctx.sucursalId,
        afiliadoId,
        planId: plan.id,
        planNombre: plan.nombre,
        tipo: plan.tipo,
        precio: plan.precio,
        fechaInicio: aFechaDb(inicio),
        fechaFin: aFechaDb(fin),
        sesionesTotal: plan.sesiones,
        creadoPorId: ctx.usuarioId,
      },
    });
    await registrarAuditoria(tx, ctx, {
      entidad: 'suscripcion',
      entidadId: s.id,
      accion: 'crear',
      despues: { afiliadoId, plan: plan.nombre, precio: plan.precio.toFixed(2), inicio, fin },
    });
    if (d.pagos) {
      await this.caja.cobrarMembresia(tx, ctx, {
        afiliadoId,
        suscripcionId: s.id,
        concepto: `${plan.nombre} del ${inicio} al ${fin}`,
        valor: plan.precio.toFixed(2),
        pagos: d.pagos,
      });
    }
  }
}
