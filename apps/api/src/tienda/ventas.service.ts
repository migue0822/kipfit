import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  aCentavos,
  deCentavos,
  PERMISOS,
  tienePermiso,
  type AnularDocumentoDatos,
  type DevolucionDatos,
  type DevolucionVista,
  type MedioDevolucion,
  type MedioPago,
  type VentaDatos,
  type VentaDetalle,
  type VentaResumen,
  ventasQuerySchema,
} from '@kip/shared';
import type { z } from 'zod';
import type { ContextoEmpresa } from '../auth/contexto';
import { CajaService } from '../caja/caja.service';
import { registrarAuditoria } from '../comun/auditoria';
import { finDiaBogota, hoyBogota, inicioDiaBogota } from '../comun/fechas';
import { tomarConsecutivo } from '../comun/numeracion';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { a2, Decimal } from './costo';
import { aplicarPasos, revertirMovimientos } from './movimientos';

type Tx = Prisma.TransactionClient;
type FilaVenta = Prisma.DocumentoGetPayload<{
  include: { lineas: true; afiliado: { select: { nombre: true; documento: true } } };
}>;

const numero = (d: { prefijo: string; numero: bigint }) => `${d.prefijo}-${d.numero}`;

/**
 * Ventas de la tienda cobradas por la caja, anulaciones y devoluciones.
 * Orden de bloqueo: documento → turno (compartido) → numeración → existencias.
 */
@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caja: CajaService,
  ) {}

  private veCostos(ctx: ContextoEmpresa) {
    return tienePermiso(ctx.permisos, PERMISOS.TIENDA_COSTOS);
  }

  // ───────────── Vender ─────────────

  async vender(ctx: ContextoEmpresa, d: VentaDatos): Promise<VentaDetalle> {
    const id = await this.prisma.$transaction(
      async (tx) => {
        const turnoId = await this.caja.turnoParaVenta(tx, ctx);
        const productos = await tx.producto.findMany({
          where: { id: { in: d.lineas.map((l) => l.productoId) }, empresaId: ctx.empresaId },
        });
        if (productos.length !== d.lineas.length) {
          throw new BadRequestException('Algún producto no existe');
        }
        const porId = new Map(productos.map((p) => [p.id, p]));
        for (const p of productos) {
          if (!p.activo) throw new ConflictException(`El producto «${p.nombre}» está inactivo`);
          if (!p.precioVenta.gt(0)) {
            throw new ConflictException(`El producto «${p.nombre}» no tiene precio de venta`);
          }
        }
        const lineas = d.lineas.map((l) => {
          const p = porId.get(l.productoId)!;
          return {
            ...l,
            nombre: p.nombre,
            precio: p.precioVenta,
            total: a2(p.precioVenta.times(l.cantidad)),
          };
        });
        const total = lineas.reduce((s, l) => s.plus(l.total), new Decimal(0));
        if (aCentavos(d.total) !== aCentavos(total.toFixed(2))) {
          throw new ConflictException(
            'Los precios cambiaron mientras vendía. Revise el total y cobre de nuevo',
          );
        }
        if (d.afiliadoId) {
          const a = await tx.afiliado.findFirst({
            where: { id: d.afiliadoId, empresaId: ctx.empresaId },
            select: { id: true },
          });
          if (!a) throw new BadRequestException('El afiliado no existe');
        }
        const efectivo = d.pagos
          .filter((p) => p.medio === 'EFECTIVO')
          .reduce((a, p) => a + aCentavos(p.valor), 0n);
        const recibido = efectivo > 0n ? aCentavos(d.recibido ?? deCentavos(efectivo)) : null;

        const { prefijo, numero: num } = await tomarConsecutivo(tx, {
          empresaId: ctx.empresaId,
          sucursalId: ctx.sucursalId,
          tipo: 'VENTA',
        });
        const doc = await tx.documento.create({
          data: {
            empresaId: ctx.empresaId,
            sucursalId: ctx.sucursalId,
            tipo: 'VENTA',
            prefijo,
            numero: num,
            observaciones: d.observaciones ?? null,
            valorTotal: total,
            turnoId,
            afiliadoId: d.afiliadoId,
            recibido: recibido === null ? null : deCentavos(recibido),
            cambio: recibido === null ? null : deCentavos(recibido - efectivo),
            creadoPorId: ctx.usuarioId,
          },
        });
        await this.caja.cobrarVenta(tx, ctx, {
          turnoId,
          documentoId: doc.id,
          afiliadoId: d.afiliadoId,
          concepto: `Venta de la tienda ${prefijo}-${num}`,
          valor: total.toFixed(2),
          pagos: d.pagos,
        });
        const aplicados = await aplicarPasos(
          tx,
          ctx,
          doc,
          lineas.map((l) => ({ productoId: l.productoId, unidades: -l.cantidad })),
        );
        await tx.documentoLinea.createMany({
          data: lineas.map((l, i) => ({
            empresaId: ctx.empresaId,
            documentoId: doc.id,
            productoId: l.productoId,
            productoNombre: l.nombre,
            cantidad: l.cantidad,
            costoUnitario: aplicados[i]!.costoUnitario,
            // Costo de lo vendido (positivo).
            valor: aplicados[i]!.valor.abs(),
            precio: l.precio,
            total: l.total,
            orden: i,
          })),
        });
        await registrarAuditoria(tx, ctx, {
          entidad: 'documento',
          entidadId: doc.id,
          accion: 'crear',
          despues: {
            tipo: 'VENTA',
            numero: `${prefijo}-${num}`,
            total: total.toFixed(2),
            pagos: d.pagos,
          },
        });
        return doc.id;
      },
      { timeout: 30_000 },
    );
    return this.detalle(ctx, id);
  }

  // ───────────── Anular una venta ─────────────

  async anular(ctx: ContextoEmpresa, id: string, d: AnularDocumentoDatos): Promise<VentaDetalle> {
    await this.prisma.$transaction(async (tx) => {
      const doc = await this.bloquear(tx, ctx, id, 'VENTA');
      if (doc.estado === 'ANULADO') throw new ConflictException('La venta ya está anulada');
      const dev = await tx.documento.count({
        where: { documentoOrigenId: id, estado: 'VIGENTE', empresaId: ctx.empresaId },
      });
      if (dev > 0) {
        throw new ConflictException('La venta tiene devoluciones: anúlelas primero');
      }
      await this.caja.anularReciboDeVenta(tx, ctx, id, d.motivo);
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
        despues: { numero: numero(doc), motivo: d.motivo },
      });
    });
    return this.detalle(ctx, id);
  }

  // ───────────── Devolución ─────────────

  async devolver(ctx: ContextoEmpresa, ventaId: string, d: DevolucionDatos): Promise<VentaDetalle> {
    await this.prisma.$transaction(
      async (tx) => {
        const venta = await this.bloquear(tx, ctx, ventaId, 'VENTA');
        if (venta.estado === 'ANULADO') throw new ConflictException('La venta está anulada');
        const lineas = await tx.documentoLinea.findMany({ where: { documentoId: ventaId } });
        const previas = await this.devueltoPorProducto(tx, ventaId);
        const items = d.lineas.map((l) => {
          const orig = lineas.find((x) => x.productoId === l.productoId);
          if (!orig) throw new BadRequestException('Ese producto no está en la venta');
          const antes = previas.get(l.productoId) ?? { cantidad: 0, valor: new Decimal(0) };
          const quedan = orig.cantidad - antes.cantidad;
          if (l.cantidad > quedan) {
            throw new ConflictException(
              `De «${orig.productoNombre}» solo se pueden devolver ${quedan} (vendidas ${orig.cantidad}, ya devueltas ${antes.cantidad})`,
            );
          }
          const completa = l.cantidad === quedan;
          return {
            productoId: l.productoId,
            nombre: orig.productoNombre,
            cantidad: l.cantidad,
            precio: orig.precio ?? new Decimal(0),
            total: a2((orig.precio ?? new Decimal(0)).times(l.cantidad)),
            // Al completar la línea se devuelve exactamente el costo que falta.
            costo: completa
              ? orig.valor.minus(antes.valor)
              : a2(orig.valor.times(l.cantidad).div(orig.cantidad)),
          };
        });
        const total = items.reduce((s, i) => s.plus(i.total), new Decimal(0));

        // Turno antes que numeración (solo si el dinero sale de la caja).
        if (d.medio === 'EFECTIVO') await this.caja.turnoParaVenta(tx, ctx);
        const { prefijo, numero: num } = await tomarConsecutivo(tx, {
          empresaId: ctx.empresaId,
          sucursalId: ctx.sucursalId,
          tipo: 'DEVOLUCION',
        });
        const doc = await tx.documento.create({
          data: {
            empresaId: ctx.empresaId,
            sucursalId: ctx.sucursalId,
            tipo: 'DEVOLUCION',
            prefijo,
            numero: num,
            motivo: d.motivo,
            valorTotal: total,
            documentoOrigenId: ventaId,
            afiliadoId: venta.afiliadoId,
            medioDevolucion: d.medio,
            creadoPorId: ctx.usuarioId,
          },
        });
        if (d.medio === 'EFECTIVO') {
          const turnoId = await this.caja.egresoDeDevolucion(tx, ctx, {
            documentoId: doc.id,
            valor: total.toFixed(2),
            concepto: `Devolución ${prefijo}-${num} de la venta ${numero(venta)}`,
          });
          await tx.documento.update({ where: { id: doc.id }, data: { turnoId } });
        }
        await aplicarPasos(
          tx,
          ctx,
          doc,
          items.map((i) => ({ productoId: i.productoId, unidades: i.cantidad, valor: i.costo })),
        );
        await tx.documentoLinea.createMany({
          data: items.map((i, k) => ({
            empresaId: ctx.empresaId,
            documentoId: doc.id,
            productoId: i.productoId,
            productoNombre: i.nombre,
            cantidad: i.cantidad,
            costoUnitario: i.costo.div(i.cantidad),
            valor: i.costo,
            precio: i.precio,
            total: i.total,
            orden: k,
          })),
        });
        await registrarAuditoria(tx, ctx, {
          entidad: 'documento',
          entidadId: doc.id,
          accion: 'crear',
          despues: {
            tipo: 'DEVOLUCION',
            numero: `${prefijo}-${num}`,
            venta: numero(venta),
            total: total.toFixed(2),
            medio: d.medio,
            motivo: d.motivo,
          },
        });
      },
      { timeout: 30_000 },
    );
    return this.detalle(ctx, ventaId);
  }

  async anularDevolucion(
    ctx: ContextoEmpresa,
    id: string,
    d: AnularDocumentoDatos,
  ): Promise<VentaDetalle> {
    const previo = await this.prisma.documento.findFirst({
      where: { id, empresaId: ctx.empresaId, tipo: 'DEVOLUCION' },
      select: { documentoOrigenId: true },
    });
    if (!previo?.documentoOrigenId) throw new NotFoundException('Devolución no encontrada');
    const ventaId = previo.documentoOrigenId;
    await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, ctx, ventaId, 'VENTA');
      const doc = await this.bloquear(tx, ctx, id, 'DEVOLUCION');
      if (doc.estado === 'ANULADO') throw new ConflictException('La devolución ya está anulada');
      await this.caja.anularEgresoDeDevolucion(tx, ctx, id, d.motivo);
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
        despues: { numero: numero(doc), motivo: d.motivo },
      });
    });
    return this.detalle(ctx, ventaId);
  }

  // ───────────── Consultas ─────────────

  async listar(
    ctx: ContextoEmpresa,
    q: z.output<typeof ventasQuerySchema>,
  ): Promise<VentaResumen[]> {
    const hoy = hoyBogota();
    const filas = await this.prisma.documento.findMany({
      where: {
        empresaId: ctx.empresaId,
        sucursalId: ctx.sucursalId,
        tipo: 'VENTA',
        fecha: {
          gte: inicioDiaBogota(q.desde ?? hoy),
          lt: finDiaBogota(q.hasta ?? q.desde ?? hoy),
        },
      },
      include: {
        lineas: true,
        afiliado: { select: { nombre: true, documento: true } },
      },
      orderBy: { fecha: 'desc' },
      take: 500,
    });
    const res = await this.resumenes(ctx, filas);
    const b = q.buscar?.toLowerCase();
    if (!b) return res;
    return res.filter(
      (r) => r.numero.toLowerCase().includes(b) || (r.afiliado ?? '').toLowerCase().includes(b),
    );
  }

  async detalle(ctx: ContextoEmpresa, id: string): Promise<VentaDetalle> {
    const f = await this.prisma.documento.findFirst({
      where: { id, empresaId: ctx.empresaId, tipo: 'VENTA' },
      include: {
        lineas: { orderBy: { orden: 'asc' } },
        afiliado: { select: { nombre: true, documento: true } },
      },
    });
    if (!f) throw new NotFoundException('Venta no encontrada');
    const costos = this.veCostos(ctx);
    const [[r], recibo, devs, emp, suc] = await Promise.all([
      this.resumenes(ctx, [f]),
      this.prisma.recibo.findFirst({
        where: { documentoId: id },
        include: { pagos: true, turno: { select: { estado: true } } },
      }),
      this.prisma.documento.findMany({
        where: { documentoOrigenId: id, empresaId: ctx.empresaId },
        include: { lineas: { orderBy: { orden: 'asc' } } },
        orderBy: { fecha: 'asc' },
      }),
      this.prisma.empresa.findUnique({
        where: { id: ctx.empresaId },
        select: { razonSocial: true, nombreComercial: true },
      }),
      this.prisma.sucursal.findUnique({ where: { id: ctx.sucursalId }, select: { nombre: true } }),
    ]);
    const vigentes = devs.filter((x) => x.estado === 'VIGENTE');
    const devueltas = new Map<string, number>();
    for (const dv of vigentes)
      for (const l of dv.lineas)
        devueltas.set(l.productoId, (devueltas.get(l.productoId) ?? 0) + l.cantidad);
    return {
      ...r!,
      observaciones: f.observaciones,
      motivoAnulacion: f.motivoAnulacion,
      reciboId: recibo?.id ?? null,
      reciboNumero: recibo ? numero(recibo) : null,
      afiliadoDocumento: f.afiliado?.documento ?? null,
      pagos: (recibo?.pagos ?? []).map((p) => ({
        medio: p.medio as MedioPago,
        valor: p.valor.toFixed(2),
      })),
      recibido: f.recibido?.toFixed(2) ?? null,
      cambio: f.cambio?.toFixed(2) ?? null,
      lineas: f.lineas.map((l) => ({
        productoId: l.productoId,
        productoNombre: l.productoNombre,
        cantidad: l.cantidad,
        precio: (l.precio ?? new Decimal(0)).toFixed(2),
        total: (l.total ?? new Decimal(0)).toFixed(2),
        devueltas: devueltas.get(l.productoId) ?? 0,
        costo: costos ? l.valor.toFixed(2) : null,
      })),
      devoluciones: devs.map((x): DevolucionVista => ({
        id: x.id,
        numero: numero(x),
        fecha: x.fecha.toISOString(),
        anulada: x.estado === 'ANULADO',
        motivo: x.motivo,
        medio: (x.medioDevolucion ?? 'OTRO') as MedioDevolucion,
        total: x.valorTotal.toFixed(2),
        lineas: x.lineas.map((l) => ({
          productoNombre: l.productoNombre,
          cantidad: l.cantidad,
          total: (l.total ?? new Decimal(0)).toFixed(2),
        })),
      })),
      empresa: emp?.nombreComercial ?? emp?.razonSocial ?? '',
      sucursal: suc?.nombre ?? '',
      anulable:
        f.estado === 'VIGENTE' && vigentes.length === 0 && recibo?.turno.estado === 'ABIERTO',
    };
  }

  // ───────────── Internos ─────────────

  /** Bloquea el documento (FOR UPDATE) y exige que sea de la empresa, del tipo y de la sucursal de la sesión. */
  private async bloquear(tx: Tx, ctx: ContextoEmpresa, id: string, tipo: 'VENTA' | 'DEVOLUCION') {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM documento
      WHERE id = ${id}::uuid AND empresa_id = ${ctx.empresaId}::uuid AND tipo = ${tipo}
      FOR UPDATE`;
    if (filas.length === 0) throw new NotFoundException('Documento no encontrado');
    const doc = await tx.documento.findFirstOrThrow({ where: { id } });
    if (doc.sucursalId !== ctx.sucursalId) {
      throw new ForbiddenException('Entre a la sucursal donde se registró para hacerlo');
    }
    return doc;
  }

  /** Unidades y costo ya devueltos de cada producto de la venta (devoluciones vigentes). */
  private async devueltoPorProducto(tx: Tx, ventaId: string) {
    const lineas = await tx.documentoLinea.findMany({
      where: { documento: { documentoOrigenId: ventaId, estado: 'VIGENTE' } },
      select: { productoId: true, cantidad: true, valor: true },
    });
    const m = new Map<string, { cantidad: number; valor: Decimal }>();
    for (const l of lineas) {
      const a = m.get(l.productoId) ?? { cantidad: 0, valor: new Decimal(0) };
      m.set(l.productoId, { cantidad: a.cantidad + l.cantidad, valor: a.valor.plus(l.valor) });
    }
    return m;
  }

  private async resumenes(ctx: ContextoEmpresa, filas: FilaVenta[]): Promise<VentaResumen[]> {
    if (filas.length === 0) return [];
    const ids = filas.map((f) => f.id);
    const [recibos, devs, usuarios] = await Promise.all([
      this.prisma.recibo.findMany({
        where: { documentoId: { in: ids } },
        select: { documentoId: true, pagos: { select: { medio: true } } },
      }),
      this.prisma.documento.findMany({
        where: { documentoOrigenId: { in: ids }, estado: 'VIGENTE', empresaId: ctx.empresaId },
        select: { documentoOrigenId: true, valorTotal: true },
      }),
      this.prisma.usuario.findMany({
        where: { id: { in: filas.map((f) => f.creadoPorId).filter((x): x is string => !!x) } },
        select: { id: true, nombre: true },
      }),
    ]);
    const medios = new Map(
      recibos.map((r) => [r.documentoId, r.pagos.map((p) => p.medio as MedioPago)]),
    );
    const devuelto = new Map<string, Decimal>();
    for (const x of devs) {
      const k = x.documentoOrigenId!;
      devuelto.set(k, (devuelto.get(k) ?? new Decimal(0)).plus(x.valorTotal));
    }
    const nombre = new Map(usuarios.map((u) => [u.id, u.nombre]));
    return filas.map((f) => ({
      id: f.id,
      numero: numero(f),
      fecha: f.fecha.toISOString(),
      anulada: f.estado === 'ANULADO',
      total: f.valorTotal.toFixed(2),
      devuelto: (devuelto.get(f.id) ?? new Decimal(0)).toFixed(2),
      unidades: f.lineas.reduce((s, l) => s + l.cantidad, 0),
      afiliado: f.afiliado?.nombre ?? null,
      cajero: f.creadoPorId ? (nombre.get(f.creadoPorId) ?? null) : null,
      medios: medios.get(f.id) ?? [],
    }));
  }
}
