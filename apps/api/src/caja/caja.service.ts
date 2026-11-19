import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  aCentavos,
  calcularCuadre,
  deCentavos,
  PERMISOS,
  tienePermiso,
  type AbrirCajaDatos,
  type CerrarCajaDatos,
  type DetalleTurno,
  type MedioPago,
  type MovimientoCajaDatos,
  type MovimientoVista,
  type PagoDatos,
  type ReciboVista,
  type ResumenCuadre,
  type TipoMovimiento,
  type TurnoVista,
} from '@kip/shared';
import type { ContextoEmpresa } from '../auth/contexto';
import { registrarAuditoria } from '../comun/auditoria';
import { finDiaBogota, hoyBogota, inicioDiaBogota } from '../comun/fechas';
import { esViolacionUnica } from '../comun/pipes';
import { tomarConsecutivo } from '../comun/numeracion';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;
type FilaTurno = Prisma.TurnoCajaGetPayload<object>;
type FilaRecibo = Prisma.ReciboGetPayload<{
  include: { pagos: true; afiliado: { select: { nombre: true; documento: true } } };
}>;

const nombreNumero = (prefijo: string, numero: bigint) => `${prefijo}-${numero}`;

const aMovimiento = (m: Prisma.MovimientoCajaGetPayload<object>): MovimientoVista => ({
  id: m.id,
  numero: nombreNumero(m.prefijo, m.numero),
  tipo: m.tipo as TipoMovimiento,
  concepto: m.concepto,
  valor: m.valor.toFixed(2),
  fechaHora: m.fechaHora.toISOString(),
  anulado: m.estado === 'ANULADO',
  motivoAnulacion: m.motivoAnulacion,
});

@Injectable()
export class CajaService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────── Turnos ─────────────

  /** La caja abierta del usuario en la sucursal de la sesión (null si no tiene). */
  async actual(ctx: ContextoEmpresa): Promise<TurnoVista | null> {
    const t = await this.prisma.turnoCaja.findFirst({
      where: {
        empresaId: ctx.empresaId,
        sucursalId: ctx.sucursalId,
        cajeroId: ctx.usuarioId,
        estado: 'ABIERTO',
      },
    });
    return t ? this.vista(this.prisma, t) : null;
  }

  async abrir(ctx: ContextoEmpresa, d: AbrirCajaDatos): Promise<TurnoVista> {
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const { prefijo, numero } = await tomarConsecutivo(tx, {
          empresaId: ctx.empresaId,
          sucursalId: ctx.sucursalId,
          tipo: 'TURNO',
        });
        const t = await tx.turnoCaja.create({
          data: {
            empresaId: ctx.empresaId,
            sucursalId: ctx.sucursalId,
            cajeroId: ctx.usuarioId,
            prefijo,
            numero,
            base: d.base ?? '0',
          },
        });
        await registrarAuditoria(tx, ctx, {
          entidad: 'turno_caja',
          entidadId: t.id,
          accion: 'abrir',
          despues: { numero: nombreNumero(prefijo, numero), base: t.base.toFixed(2) },
        });
        return t.id;
      });
      return this.detalleTurnoSimple(id, ctx);
    } catch (e) {
      if (esViolacionUnica(e))
        throw new ConflictException('Ya tiene una caja abierta en esta sucursal');
      throw e;
    }
  }

  /** Cierra la caja propia, o cualquiera con `caja.supervisar`. Si el efectivo no cuadra exige observaciones. */
  async cerrar(ctx: ContextoEmpresa, id: string, d: CerrarCajaDatos): Promise<TurnoVista> {
    await this.prisma.$transaction(async (tx) => {
      // Exclusivo: espera a los cobros en curso y los nuevos encuentran el turno cerrado.
      const bloqueo = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM turno_caja WHERE id = ${id}::uuid AND empresa_id = ${ctx.empresaId}::uuid FOR UPDATE`;
      if (bloqueo.length === 0) throw new NotFoundException('Caja no encontrada');
      const t = await tx.turnoCaja.findFirstOrThrow({ where: { id, empresaId: ctx.empresaId } });
      if (t.sucursalId !== ctx.sucursalId)
        throw new ConflictException('La caja es de otra sucursal');
      if (t.cajeroId !== ctx.usuarioId && !tienePermiso(ctx.permisos, PERMISOS.CAJA_SUPERVISAR)) {
        throw new ForbiddenException('Solo el cajero o un supervisor cierra esta caja');
      }
      if (t.estado !== 'ABIERTO') throw new ConflictException('La caja ya está cerrada');
      const resumen = await this.resumen(tx, t);
      const diferencia = aCentavos(d.contado) - aCentavos(resumen.esperado);
      if (diferencia !== 0n && !d.observaciones) {
        throw new BadRequestException('El efectivo no cuadra: escriba una observación para cerrar');
      }
      await tx.turnoCaja.update({
        where: { id },
        data: {
          estado: 'CERRADO',
          cerradoEn: new Date(),
          cerradoPorId: ctx.usuarioId,
          contado: d.contado,
          esperado: resumen.esperado,
          diferencia: deCentavos(diferencia),
          observaciones: d.observaciones ?? null,
          resumen: resumen as unknown as Prisma.InputJsonValue,
        },
      });
      await registrarAuditoria(tx, ctx, {
        entidad: 'turno_caja',
        entidadId: id,
        accion: 'cerrar',
        despues: {
          contado: d.contado,
          esperado: resumen.esperado,
          diferencia: deCentavos(diferencia),
        },
      });
    });
    return this.detalleTurnoSimple(id, ctx);
  }

  /** Turnos abiertos en un rango de días (hoy por defecto); sin `caja.supervisar` solo los propios. */
  async listar(ctx: ContextoEmpresa, desde?: string, hasta?: string): Promise<TurnoVista[]> {
    const hoy = hoyBogota();
    const filas = await this.prisma.turnoCaja.findMany({
      where: {
        empresaId: ctx.empresaId,
        sucursalId: ctx.sucursalId,
        ...(tienePermiso(ctx.permisos, PERMISOS.CAJA_SUPERVISAR)
          ? {}
          : { cajeroId: ctx.usuarioId }),
        abiertoEn: { gte: inicioDiaBogota(desde ?? hoy), lt: finDiaBogota(hasta ?? desde ?? hoy) },
      },
      orderBy: { abiertoEn: 'desc' },
      take: 200,
    });
    return Promise.all(filas.map((t) => this.vista(this.prisma, t)));
  }

  /** Todas las cajas de la sucursal en un rango de días (para los informes: el permiso lo exige el controlador). */
  async turnosDelPeriodo(
    ctx: ContextoEmpresa,
    desde: string,
    hasta: string,
  ): Promise<TurnoVista[]> {
    const filas = await this.prisma.turnoCaja.findMany({
      where: {
        empresaId: ctx.empresaId,
        sucursalId: ctx.sucursalId,
        abiertoEn: { gte: inicioDiaBogota(desde), lt: finDiaBogota(hasta) },
      },
      orderBy: { abiertoEn: 'asc' },
      take: 2000,
    });
    return Promise.all(filas.map((t) => this.vista(this.prisma, t)));
  }

  async detalle(ctx: ContextoEmpresa, id: string): Promise<DetalleTurno> {
    const t = await this.prisma.turnoCaja.findFirst({ where: { id, empresaId: ctx.empresaId } });
    if (!t) throw new NotFoundException('Caja no encontrada');
    if (t.cajeroId !== ctx.usuarioId && !tienePermiso(ctx.permisos, PERMISOS.CAJA_SUPERVISAR)) {
      throw new ForbiddenException('Solo el cajero o un supervisor ve esta caja');
    }
    const [recibos, movimientos] = await Promise.all([
      this.prisma.recibo.findMany({
        where: { turnoId: id, empresaId: ctx.empresaId },
        include: { pagos: true, afiliado: { select: { nombre: true, documento: true } } },
        orderBy: { fechaHora: 'asc' },
      }),
      this.prisma.movimientoCaja.findMany({
        where: { turnoId: id, empresaId: ctx.empresaId },
        orderBy: { fechaHora: 'asc' },
      }),
    ]);
    return {
      ...(await this.vista(this.prisma, t)),
      recibos: await Promise.all(recibos.map((r) => this.reciboVista(r))),
      movimientos: movimientos.map(aMovimiento),
    };
  }

  // ───────────── Movimientos (ingresos y egresos de caja) ─────────────

  async crearMovimiento(ctx: ContextoEmpresa, d: MovimientoCajaDatos): Promise<MovimientoVista> {
    const m = await this.prisma.$transaction(async (tx) => {
      const t = await this.turnoPropioCompartido(tx, ctx);
      if (d.tipo === 'EGRESO') await this.exigirEfectivo(tx, t, aCentavos(d.valor));
      const { prefijo, numero } = await tomarConsecutivo(tx, {
        empresaId: ctx.empresaId,
        sucursalId: ctx.sucursalId,
        tipo: 'MOVIMIENTO',
      });
      const creado = await tx.movimientoCaja.create({
        data: {
          empresaId: ctx.empresaId,
          sucursalId: ctx.sucursalId,
          turnoId: t.id,
          tipo: d.tipo,
          concepto: d.concepto,
          valor: d.valor,
          prefijo,
          numero,
          creadoPorId: ctx.usuarioId,
        },
      });
      await registrarAuditoria(tx, ctx, {
        entidad: 'movimiento_caja',
        entidadId: creado.id,
        accion: 'crear',
        despues: { tipo: d.tipo, concepto: d.concepto, valor: d.valor },
      });
      return creado;
    });
    return aMovimiento(m);
  }

  /** Se anula (no se borra) y solo con el turno abierto; un ingreso anulado no puede dejar la caja en negativo. */
  async anularMovimiento(
    ctx: ContextoEmpresa,
    id: string,
    motivo: string,
  ): Promise<MovimientoVista> {
    const m = await this.prisma.$transaction(async (tx) => {
      const mv = await tx.movimientoCaja.findFirst({ where: { id, empresaId: ctx.empresaId } });
      if (!mv) throw new NotFoundException('Movimiento no encontrado');
      if (mv.documentoId) {
        throw new ConflictException(
          'Este egreso es de una devolución de la tienda: se anula anulando la devolución',
        );
      }
      const t = await this.turnoCompartido(tx, ctx, mv.turnoId);
      if (t.estado !== 'ABIERTO')
        throw new ConflictException('La caja de este movimiento ya está cerrada');
      if (t.cajeroId !== ctx.usuarioId && !tienePermiso(ctx.permisos, PERMISOS.CAJA_SUPERVISAR)) {
        throw new ForbiddenException('Solo el cajero o un supervisor anula este movimiento');
      }
      const r = await tx.movimientoCaja.updateMany({
        where: { id, empresaId: ctx.empresaId, estado: 'VIGENTE' },
        data: { estado: 'ANULADO', anuladoEn: new Date(), motivoAnulacion: motivo },
      });
      if (r.count === 0) throw new ConflictException('El movimiento ya está anulado');
      await this.exigirNoNegativo(tx, t);
      await registrarAuditoria(tx, ctx, {
        entidad: 'movimiento_caja',
        entidadId: id,
        accion: 'anular',
        despues: { motivo },
      });
      return tx.movimientoCaja.findFirstOrThrow({ where: { id } });
    });
    return aMovimiento(m);
  }

  // ───────────── Cobros (los usa la venta de membresías) ─────────────

  /**
   * Crea el recibo de una membresía recién vendida, dentro de la misma transacción. Exige la caja abierta del
   * usuario y que los pagos sumen exactamente el valor. Orden de bloqueo: afiliado → turno (compartido) → numeración.
   */
  async cobrarMembresia(
    tx: Tx,
    ctx: ContextoEmpresa,
    d: {
      afiliadoId: string;
      suscripcionId: string;
      concepto: string;
      valor: string;
      pagos: PagoDatos[];
    },
  ): Promise<{ id: string; numero: string }> {
    if (!tienePermiso(ctx.permisos, PERMISOS.CAJA_OPERAR)) {
      throw new ForbiddenException('Su rol no puede cobrar: falta el permiso de operar la caja');
    }
    const total = aCentavos(d.valor);
    const suma = d.pagos.reduce((a, p) => a + aCentavos(p.valor), 0n);
    if (suma !== total) {
      throw new BadRequestException(
        `Los pagos suman ${deCentavos(suma)} y el valor a cobrar es ${deCentavos(total)}`,
      );
    }
    const t = await this.turnoPropioCompartido(tx, ctx);
    const { prefijo, numero } = await tomarConsecutivo(tx, {
      empresaId: ctx.empresaId,
      sucursalId: ctx.sucursalId,
      tipo: 'RECIBO',
    });
    const r = await tx.recibo.create({
      data: {
        empresaId: ctx.empresaId,
        sucursalId: ctx.sucursalId,
        turnoId: t.id,
        afiliadoId: d.afiliadoId,
        suscripcionId: d.suscripcionId,
        prefijo,
        numero,
        concepto: d.concepto,
        valor: deCentavos(total),
        creadoPorId: ctx.usuarioId,
        pagos: {
          create: d.pagos.map((p) => ({
            empresaId: ctx.empresaId,
            medio: p.medio,
            valor: deCentavos(aCentavos(p.valor)),
          })),
        },
      },
    });
    await registrarAuditoria(tx, ctx, {
      entidad: 'recibo',
      entidadId: r.id,
      accion: 'crear',
      despues: { numero: nombreNumero(prefijo, numero), valor: deCentavos(total), pagos: d.pagos },
    });
    return { id: r.id, numero: nombreNumero(prefijo, numero) };
  }

  /**
   * Anula el recibo de una membresía (si tiene uno vigente). Solo con la caja del cobro abierta; el efectivo
   * devuelto tiene que estar en la caja.
   */
  async anularReciboDeMembresia(
    tx: Tx,
    ctx: ContextoEmpresa,
    suscripcionId: string,
    motivo: string,
  ) {
    const r = await tx.recibo.findFirst({
      where: { suscripcionId, empresaId: ctx.empresaId, estado: 'VIGENTE' },
    });
    if (!r) return;
    const t = await this.turnoCompartido(tx, ctx, r.turnoId);
    if (t.estado !== 'ABIERTO') {
      throw new ConflictException(
        'La membresía se cobró en una caja que ya está cerrada: no se puede anular el cobro',
      );
    }
    await tx.recibo.update({
      where: { id: r.id },
      data: {
        estado: 'ANULADO',
        anuladoEn: new Date(),
        motivoAnulacion: motivo,
        anuladoTurnoId: t.id,
      },
    });
    await this.exigirNoNegativo(tx, t);
    await registrarAuditoria(tx, ctx, {
      entidad: 'recibo',
      entidadId: r.id,
      accion: 'anular',
      despues: { motivo },
    });
  }

  // ───────────── Tienda: ventas y devoluciones ─────────────

  /** La caja abierta del usuario para vender (compartida: el cierre espera). Devuelve su id. */
  async turnoParaVenta(tx: Tx, ctx: ContextoEmpresa): Promise<string> {
    if (!tienePermiso(ctx.permisos, PERMISOS.CAJA_OPERAR)) {
      throw new ForbiddenException('Su rol no puede cobrar: falta el permiso de operar la caja');
    }
    const t = await this.turnoPropioCompartido(tx, ctx);
    return t.id;
  }

  /** Recibo de caja de una venta de la tienda (el turno ya está bloqueado por `turnoParaVenta`). */
  async cobrarVenta(
    tx: Tx,
    ctx: ContextoEmpresa,
    d: {
      turnoId: string;
      documentoId: string;
      afiliadoId: string | null;
      concepto: string;
      valor: string;
      pagos: PagoDatos[];
    },
  ): Promise<{ id: string; numero: string }> {
    const total = aCentavos(d.valor);
    const suma = d.pagos.reduce((a, p) => a + aCentavos(p.valor), 0n);
    if (suma !== total) {
      throw new BadRequestException(
        `Los pagos suman ${deCentavos(suma)} y el total de la venta es ${deCentavos(total)}`,
      );
    }
    const { prefijo, numero } = await tomarConsecutivo(tx, {
      empresaId: ctx.empresaId,
      sucursalId: ctx.sucursalId,
      tipo: 'RECIBO',
    });
    const r = await tx.recibo.create({
      data: {
        empresaId: ctx.empresaId,
        sucursalId: ctx.sucursalId,
        turnoId: d.turnoId,
        afiliadoId: d.afiliadoId,
        documentoId: d.documentoId,
        prefijo,
        numero,
        concepto: d.concepto,
        valor: deCentavos(total),
        creadoPorId: ctx.usuarioId,
        pagos: {
          create: d.pagos.map((p) => ({
            empresaId: ctx.empresaId,
            medio: p.medio,
            valor: deCentavos(aCentavos(p.valor)),
          })),
        },
      },
    });
    await registrarAuditoria(tx, ctx, {
      entidad: 'recibo',
      entidadId: r.id,
      accion: 'crear',
      despues: { numero: nombreNumero(prefijo, numero), valor: deCentavos(total), pagos: d.pagos },
    });
    return { id: r.id, numero: nombreNumero(prefijo, numero) };
  }

  /** Anula el recibo de una venta: solo con la caja del cobro abierta y sin dejar el efectivo en negativo. */
  async anularReciboDeVenta(tx: Tx, ctx: ContextoEmpresa, documentoId: string, motivo: string) {
    const r = await tx.recibo.findFirst({
      where: { documentoId, empresaId: ctx.empresaId, estado: 'VIGENTE' },
    });
    if (!r) return;
    const t = await this.turnoCompartido(tx, ctx, r.turnoId);
    if (t.estado !== 'ABIERTO') {
      throw new ConflictException(
        'La venta se cobró en una caja que ya está cerrada: no se puede anular. Haga una devolución',
      );
    }
    await tx.recibo.update({
      where: { id: r.id },
      data: {
        estado: 'ANULADO',
        anuladoEn: new Date(),
        motivoAnulacion: motivo,
        anuladoTurnoId: t.id,
      },
    });
    await this.exigirNoNegativo(tx, t);
    await registrarAuditoria(tx, ctx, {
      entidad: 'recibo',
      entidadId: r.id,
      accion: 'anular',
      despues: { motivo },
    });
  }

  /**
   * Devolución en efectivo: egreso de la caja abierta de quien devuelve, ligado al documento DV.
   * Devuelve el id del turno para guardarlo en el documento.
   */
  async egresoDeDevolucion(
    tx: Tx,
    ctx: ContextoEmpresa,
    d: { documentoId: string; valor: string; concepto: string },
  ): Promise<string> {
    const t = await this.turnoPropioCompartido(tx, ctx);
    await this.exigirEfectivo(tx, t, aCentavos(d.valor));
    const { prefijo, numero } = await tomarConsecutivo(tx, {
      empresaId: ctx.empresaId,
      sucursalId: ctx.sucursalId,
      tipo: 'MOVIMIENTO',
    });
    const mv = await tx.movimientoCaja.create({
      data: {
        empresaId: ctx.empresaId,
        sucursalId: ctx.sucursalId,
        turnoId: t.id,
        tipo: 'EGRESO',
        concepto: d.concepto,
        valor: d.valor,
        prefijo,
        numero,
        documentoId: d.documentoId,
        creadoPorId: ctx.usuarioId,
      },
    });
    await registrarAuditoria(tx, ctx, {
      entidad: 'movimiento_caja',
      entidadId: mv.id,
      accion: 'crear',
      despues: { tipo: 'EGRESO', concepto: d.concepto, valor: d.valor },
    });
    return t.id;
  }

  /** Anula el egreso de una devolución (si lo tiene): solo con su caja abierta. */
  async anularEgresoDeDevolucion(
    tx: Tx,
    ctx: ContextoEmpresa,
    documentoId: string,
    motivo: string,
  ) {
    const mv = await tx.movimientoCaja.findFirst({
      where: { documentoId, empresaId: ctx.empresaId, estado: 'VIGENTE' },
    });
    if (!mv) return;
    const t = await this.turnoCompartido(tx, ctx, mv.turnoId);
    if (t.estado !== 'ABIERTO') {
      throw new ConflictException(
        'El dinero de esta devolución salió de una caja que ya está cerrada: no se puede anular',
      );
    }
    await tx.movimientoCaja.update({
      where: { id: mv.id },
      data: { estado: 'ANULADO', anuladoEn: new Date(), motivoAnulacion: motivo },
    });
    await this.exigirNoNegativo(tx, t);
    await registrarAuditoria(tx, ctx, {
      entidad: 'movimiento_caja',
      entidadId: mv.id,
      accion: 'anular',
      despues: { motivo },
    });
  }

  async recibo(ctx: ContextoEmpresa, id: string): Promise<ReciboVista> {
    const r = await this.prisma.recibo.findFirst({
      where: { id, empresaId: ctx.empresaId },
      include: { pagos: true, afiliado: { select: { nombre: true, documento: true } } },
    });
    if (!r) throw new NotFoundException('Recibo no encontrado');
    return this.reciboVista(r);
  }

  // ───────────── Internos ─────────────

  private async detalleTurnoSimple(id: string, ctx: ContextoEmpresa) {
    const t = await this.prisma.turnoCaja.findFirstOrThrow({
      where: { id, empresaId: ctx.empresaId },
    });
    return this.vista(this.prisma, t);
  }

  /** La caja abierta del usuario, bloqueada en modo compartido (el cierre espera a esta transacción). */
  private async turnoPropioCompartido(tx: Tx, ctx: ContextoEmpresa): Promise<FilaTurno> {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM turno_caja
      WHERE empresa_id = ${ctx.empresaId}::uuid AND sucursal_id = ${ctx.sucursalId}::uuid
        AND cajero_id = ${ctx.usuarioId}::uuid AND estado = 'ABIERTO'
      FOR SHARE`;
    const f = filas[0];
    if (!f) throw new ConflictException('Abra su caja antes de cobrar o registrar movimientos');
    return tx.turnoCaja.findFirstOrThrow({ where: { id: f.id } });
  }

  private async turnoCompartido(tx: Tx, ctx: ContextoEmpresa, id: string): Promise<FilaTurno> {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM turno_caja WHERE id = ${id}::uuid AND empresa_id = ${ctx.empresaId}::uuid FOR SHARE`;
    if (filas.length === 0) throw new NotFoundException('Caja no encontrada');
    return tx.turnoCaja.findFirstOrThrow({ where: { id } });
  }

  private async resumen(db: Tx | PrismaService, t: FilaTurno): Promise<ResumenCuadre> {
    if (t.estado === 'CERRADO' && t.resumen) return t.resumen as unknown as ResumenCuadre;
    const [recibos, movimientos] = await Promise.all([
      db.recibo.findMany({
        where: { turnoId: t.id },
        select: { estado: true, pagos: { select: { medio: true, valor: true } } },
      }),
      db.movimientoCaja.findMany({
        where: { turnoId: t.id },
        select: { tipo: true, estado: true, valor: true },
      }),
    ]);
    return calcularCuadre({
      base: t.base.toFixed(2),
      recibos: recibos.map((r) => ({
        estado: r.estado,
        pagos: r.pagos.map((p) => ({ medio: p.medio, valor: p.valor.toFixed(2) })),
      })),
      movimientos: movimientos.map((m) => ({
        tipo: m.tipo,
        estado: m.estado,
        valor: m.valor.toFixed(2),
      })),
    });
  }

  /** Un egreso (o devolución) no puede ser mayor que el efectivo que hay en la caja. */
  private async exigirEfectivo(tx: Tx, t: FilaTurno, valor: bigint) {
    // Serializa las salidas de efectivo de un mismo turno.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'efectivo:' + t.id}))`;
    const r = await this.resumen(tx, t);
    if (aCentavos(r.esperado) < valor) {
      throw new ConflictException(
        `En la caja solo hay ${r.esperado} en efectivo: el egreso es mayor`,
      );
    }
  }

  private async exigirNoNegativo(tx: Tx, t: FilaTurno) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'efectivo:' + t.id}))`;
    const r = await this.resumen(tx, t);
    if (aCentavos(r.esperado) < 0n) {
      throw new ConflictException('Con este cambio el efectivo de la caja quedaría en negativo');
    }
  }

  private async vista(db: Tx | PrismaService, t: FilaTurno): Promise<TurnoVista> {
    const cajero = await this.prisma.usuario.findUnique({
      where: { id: t.cajeroId },
      select: { nombre: true },
    });
    return {
      id: t.id,
      numero: nombreNumero(t.prefijo, t.numero),
      cajeroId: t.cajeroId,
      cajeroNombre: cajero?.nombre ?? '',
      abiertoEn: t.abiertoEn.toISOString(),
      base: t.base.toFixed(2),
      estado: t.estado as 'ABIERTO' | 'CERRADO',
      cerradoEn: t.cerradoEn?.toISOString() ?? null,
      contado: t.contado?.toFixed(2) ?? null,
      esperado: t.esperado?.toFixed(2) ?? null,
      diferencia: t.diferencia?.toFixed(2) ?? null,
      observaciones: t.observaciones,
      resumen: await this.resumen(db, t),
    };
  }

  private async reciboVista(r: FilaRecibo): Promise<ReciboVista> {
    const [emp, suc, cajero] = await Promise.all([
      this.prisma.empresa.findUnique({
        where: { id: r.empresaId },
        select: { razonSocial: true, nombreComercial: true },
      }),
      this.prisma.sucursal.findUnique({ where: { id: r.sucursalId }, select: { nombre: true } }),
      r.creadoPorId
        ? this.prisma.usuario.findUnique({ where: { id: r.creadoPorId }, select: { nombre: true } })
        : null,
    ]);
    return {
      id: r.id,
      numero: nombreNumero(r.prefijo, r.numero),
      turnoId: r.turnoId,
      afiliadoId: r.afiliadoId,
      afiliadoNombre: r.afiliado?.nombre ?? null,
      afiliadoDocumento: r.afiliado?.documento ?? null,
      concepto: r.concepto,
      valor: r.valor.toFixed(2),
      fechaHora: r.fechaHora.toISOString(),
      anulado: r.estado === 'ANULADO',
      motivoAnulacion: r.motivoAnulacion,
      pagos: r.pagos.map((p) => ({ medio: p.medio as MedioPago, valor: p.valor.toFixed(2) })),
      empresa: emp?.nombreComercial ?? emp?.razonSocial ?? '',
      sucursal: suc?.nombre ?? '',
      cajero: cajero?.nombre ?? null,
    };
  }
}
