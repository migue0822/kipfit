import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PERMISOS,
  tienePermiso,
  type AjusteDatos,
  type AnularDocumentoDatos,
  type DocumentoDetalle,
  type DocumentoResumen,
  type EntradaDatos,
  type FilaKardex,
  type TipoDocumentoTienda,
  documentosQuerySchema,
  kardexQuerySchema,
} from '@kip/shared';
import type { z } from 'zod';
import type { ContextoEmpresa } from '../auth/contexto';
import { registrarAuditoria } from '../comun/auditoria';
import { finDiaBogota, inicioDiaBogota } from '../comun/fechas';
import { tomarConsecutivo, type TipoNumeracion } from '../comun/numeracion';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { a2, Decimal } from './costo';
import { aplicarPasos, bloquearExistencias, revertirMovimientos, type Paso } from './movimientos';

type Tx = Prisma.TransactionClient;

type FilaDocumento = Prisma.DocumentoGetPayload<{ include: { lineas: true } }>;

@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

  private veCostos(ctx: ContextoEmpresa) {
    return tienePermiso(ctx.permisos, PERMISOS.TIENDA_COSTOS);
  }

  // ───────────── Entrada de mercancía ─────────────

  /** Compra: entra por unidades al costo digitado; el valor exacto = cantidad × costo (2 decimales). */
  async entrada(ctx: ContextoEmpresa, d: EntradaDatos): Promise<DocumentoDetalle> {
    const id = await this.prisma.$transaction(async (tx) => {
      const productos = await this.productosValidos(
        tx,
        ctx,
        d.lineas.map((l) => l.productoId),
      );
      const { documento } = await this.crearDocumento(tx, ctx, 'ENTRADA', 'ENTRADA', {
        referencia: d.referencia ?? null,
        proveedor: d.proveedor ?? null,
        observaciones: d.observaciones ?? null,
      });
      const lineas = d.lineas.map((l) => ({
        ...l,
        costo: new Decimal(l.costoUnitario),
        valor: a2(new Decimal(l.cantidad).times(l.costoUnitario)),
      }));
      const pasos: Paso[] = lineas.map((l) => ({
        productoId: l.productoId,
        unidades: l.cantidad,
        valor: l.valor,
      }));
      await aplicarPasos(tx, ctx, documento, pasos);
      await tx.documentoLinea.createMany({
        data: lineas.map((l, i) => ({
          empresaId: ctx.empresaId,
          documentoId: documento.id,
          productoId: l.productoId,
          productoNombre: productos.get(l.productoId)!,
          cantidad: l.cantidad,
          costoUnitario: l.costo,
          valor: l.valor,
          orden: i,
        })),
      });
      const total = lineas.reduce((s, l) => s.plus(l.valor), new Decimal(0));
      await tx.documento.update({ where: { id: documento.id }, data: { valorTotal: total } });
      await registrarAuditoria(tx, ctx, {
        entidad: 'documento',
        entidadId: documento.id,
        accion: 'crear',
        despues: {
          tipo: 'ENTRADA',
          numero: `${documento.prefijo}-${documento.numero}`,
          total: total.toFixed(2),
        },
      });
      return documento.id;
    });
    return this.detalle(ctx, id);
  }

  // ───────────── Ajuste (conteo, mermas) ─────────────

  /**
   * Lleva la existencia a lo contado. Si desde que se cargó la pantalla cambió, 409 (la pantalla recarga sin perder lo
   * digitado). Lo que sobra entra al costo promedio; lo que falta sale al costo promedio.
   */
  async ajuste(ctx: ContextoEmpresa, d: AjusteDatos): Promise<DocumentoDetalle> {
    const id = await this.prisma.$transaction(async (tx) => {
      const productos = await this.productosValidos(
        tx,
        ctx,
        d.lineas.map((l) => l.productoId),
      );
      const { documento } = await this.crearDocumento(tx, ctx, 'AJUSTE', 'AJUSTE', {
        motivo: d.motivo,
        observaciones: d.observaciones ?? null,
      });
      const saldos = await bloquearExistencias(
        tx,
        ctx,
        d.lineas.map((l) => l.productoId),
      );
      for (const l of d.lineas) {
        const actual = saldos.get(l.productoId)?.cantidad ?? 0;
        if (actual !== l.sistema)
          throw new ConflictException(
            `La existencia de ${productos.get(l.productoId)} cambió (ahora hay ${actual}). Revise y vuelva a guardar.`,
          );
      }
      const con = d.lineas.filter((l) => l.contado !== l.sistema);
      const aplicados = await aplicarPasos(
        tx,
        ctx,
        documento,
        con.map((l) => ({ productoId: l.productoId, unidades: l.contado - l.sistema })),
      );
      await tx.documentoLinea.createMany({
        data: con.map((l, i) => ({
          empresaId: ctx.empresaId,
          documentoId: documento.id,
          productoId: l.productoId,
          productoNombre: productos.get(l.productoId)!,
          cantidad: l.contado - l.sistema,
          sistema: l.sistema,
          costoUnitario: aplicados[i]!.costoUnitario,
          valor: aplicados[i]!.valor,
          orden: i,
        })),
      });
      const total = aplicados.reduce((s, a) => s.plus(a.valor), new Decimal(0));
      await tx.documento.update({ where: { id: documento.id }, data: { valorTotal: total } });
      await registrarAuditoria(tx, ctx, {
        entidad: 'documento',
        entidadId: documento.id,
        accion: 'crear',
        despues: {
          tipo: 'AJUSTE',
          numero: `${documento.prefijo}-${documento.numero}`,
          motivo: d.motivo,
          total: total.toFixed(2),
        },
      });
      return documento.id;
    });
    return this.detalle(ctx, id);
  }

  // ───────────── Anular ─────────────

  /** Reversa con el valor exacto. Falla si lo que entró ya se vendió (la existencia quedaría negativa). */
  async anular(
    ctx: ContextoEmpresa,
    id: string,
    d: AnularDocumentoDatos,
  ): Promise<DocumentoDetalle> {
    await this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<
        { estado: string; tipo: string; sucursal_id: string; numero: string }[]
      >`
        SELECT estado, tipo, sucursal_id, prefijo || '-' || numero AS numero FROM documento
        WHERE id = ${id}::uuid AND empresa_id = ${ctx.empresaId}::uuid
        FOR UPDATE`;
      const doc = filas[0];
      if (!doc) throw new NotFoundException('Documento no encontrado');
      if (doc.estado === 'ANULADO') throw new ConflictException('El documento ya está anulado');
      if (doc.tipo === 'VENTA' || doc.tipo === 'DEVOLUCION')
        throw new BadRequestException('Las ventas y devoluciones se anulan desde Ventas');
      if (doc.sucursal_id !== ctx.sucursalId)
        throw new BadRequestException('Para anularlo, entre a la sucursal donde se registró');
      const ahora = new Date();
      await revertirMovimientos(tx, ctx, id, ahora);
      await tx.documento.update({
        where: { id },
        data: { estado: 'ANULADO', anuladoEn: ahora, motivoAnulacion: d.motivo },
      });
      await registrarAuditoria(tx, ctx, {
        entidad: 'documento',
        entidadId: id,
        accion: 'anular',
        despues: { numero: doc.numero, motivo: d.motivo },
      });
    });
    return this.detalle(ctx, id);
  }

  // ───────────── Consultas ─────────────

  async documentos(
    ctx: ContextoEmpresa,
    q: z.output<typeof documentosQuerySchema>,
  ): Promise<DocumentoResumen[]> {
    const filas = await this.prisma.documento.findMany({
      where: {
        empresaId: ctx.empresaId,
        sucursalId: ctx.sucursalId,
        tipo: q.tipo ?? { in: ['ENTRADA', 'AJUSTE'] },
        ...(q.desde || q.hasta
          ? {
              fecha: {
                ...(q.desde ? { gte: inicioDiaBogota(q.desde) } : {}),
                ...(q.hasta ? { lt: finDiaBogota(q.hasta) } : {}),
              },
            }
          : {}),
      },
      include: { lineas: true },
      orderBy: { fecha: 'desc' },
      take: 200,
    });
    return this.conUsuarios(ctx, filas);
  }

  async detalle(ctx: ContextoEmpresa, id: string): Promise<DocumentoDetalle> {
    const f = await this.prisma.documento.findFirst({
      where: { id, empresaId: ctx.empresaId },
      include: { lineas: { orderBy: { orden: 'asc' } } },
    });
    if (!f) throw new NotFoundException('Documento no encontrado');
    const [r] = await this.conUsuarios(ctx, [f]);
    const costos = this.veCostos(ctx);
    return {
      ...r!,
      observaciones: f.observaciones,
      motivoAnulacion: f.motivoAnulacion,
      anuladoEn: f.anuladoEn?.toISOString() ?? null,
      lineas: f.lineas.map((l) => ({
        productoId: l.productoId,
        productoNombre: l.productoNombre,
        cantidad: l.cantidad,
        sistema: l.sistema,
        costoUnitario: costos ? (l.costoUnitario?.toFixed(4) ?? null) : null,
        valor: costos ? l.valor.toFixed(2) : null,
      })),
    };
  }

  async kardex(ctx: ContextoEmpresa, q: z.output<typeof kardexQuerySchema>): Promise<FilaKardex[]> {
    const costos = this.veCostos(ctx);
    const filas = await this.prisma.movimientoInventario.findMany({
      where: {
        empresaId: ctx.empresaId,
        sucursalId: ctx.sucursalId,
        productoId: q.productoId,
        ...(q.desde || q.hasta
          ? {
              fecha: {
                ...(q.desde ? { gte: inicioDiaBogota(q.desde) } : {}),
                ...(q.hasta ? { lt: finDiaBogota(q.hasta) } : {}),
              },
            }
          : {}),
      },
      include: { documento: { select: { prefijo: true, numero: true, tipo: true } } },
      orderBy: { id: 'desc' },
      take: 500,
    });
    return filas.map((m) => ({
      id: m.id.toString(),
      fecha: m.fecha.toISOString(),
      documento: `${m.documento.prefijo}-${m.documento.numero}`,
      tipo: m.documento.tipo as TipoDocumentoTienda,
      anulacion: m.esAnulacion,
      cantidad: m.cantidad,
      saldoCantidad: m.saldoCantidad,
      costoUnitario: costos ? m.costoUnitario.toFixed(4) : null,
      valor: costos ? m.valor.toFixed(2) : null,
      saldoValor: costos ? m.saldoValor.toFixed(2) : null,
      costoPromedio: costos ? m.costoPromedio.toFixed(4) : null,
    }));
  }

  // ───────────── Internos ─────────────

  private async conUsuarios(
    ctx: ContextoEmpresa,
    filas: FilaDocumento[],
  ): Promise<DocumentoResumen[]> {
    const ids = [...new Set(filas.map((f) => f.creadoPorId).filter((x): x is string => !!x))];
    const usuarios = ids.length
      ? await this.prisma.usuario.findMany({
          where: { id: { in: ids } },
          select: { id: true, nombre: true },
        })
      : [];
    const nombre = new Map(usuarios.map((u) => [u.id, u.nombre]));
    const costos = this.veCostos(ctx);
    return filas.map((f) => ({
      id: f.id,
      numero: `${f.prefijo}-${f.numero}`,
      tipo: f.tipo as TipoDocumentoTienda,
      fecha: f.fecha.toISOString(),
      anulado: f.estado === 'ANULADO',
      referencia: f.referencia,
      proveedor: f.proveedor,
      motivo: f.motivo,
      valorTotal: costos ? f.valorTotal.toFixed(2) : null,
      unidades: f.lineas.reduce((s, l) => s + Math.abs(l.cantidad), 0),
      creadoPor: f.creadoPorId ? (nombre.get(f.creadoPorId) ?? null) : null,
    }));
  }

  /** Productos de la empresa y activos; devuelve id → nombre. */
  private async productosValidos(tx: Tx, ctx: ContextoEmpresa, ids: string[]) {
    const productos = await tx.producto.findMany({
      where: { id: { in: ids }, empresaId: ctx.empresaId },
      select: { id: true, nombre: true, activo: true },
    });
    if (productos.length !== new Set(ids).size)
      throw new BadRequestException('Algún producto no existe');
    const inactivo = productos.find((p) => !p.activo);
    if (inactivo) throw new ConflictException(`El producto «${inactivo.nombre}» está inactivo`);
    return new Map(productos.map((p) => [p.id, p.nombre]));
  }

  /** Toma el consecutivo (bloquea la numeración) y crea el encabezado. Orden de bloqueo: numeración → existencias. */
  private async crearDocumento(
    tx: Tx,
    ctx: ContextoEmpresa,
    tipo: TipoDocumentoTienda,
    numeracion: TipoNumeracion,
    datos: Partial<Prisma.DocumentoUncheckedCreateInput>,
  ) {
    const { prefijo, numero } = await tomarConsecutivo(tx, {
      empresaId: ctx.empresaId,
      sucursalId: ctx.sucursalId,
      tipo: numeracion,
    });
    const documento = await tx.documento.create({
      data: {
        ...datos,
        empresaId: ctx.empresaId,
        sucursalId: ctx.sucursalId,
        tipo,
        prefijo,
        numero,
        creadoPorId: ctx.usuarioId,
      },
    });
    return { documento };
  }
}
