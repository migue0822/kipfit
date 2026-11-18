import { Injectable } from '@nestjs/common';
import {
  aCentavos,
  deCentavos,
  diasEntre,
  type FilaCaja,
  type FilaVencimiento,
  type InformeCajas,
  type InformeCobros,
  type InformeIngresos,
  type InformeVencimientos,
  type MedioPago,
  type PeriodoInforme,
} from '@kip/shared';
import type { ContextoEmpresa } from '../auth/contexto';
import { CajaService } from '../caja/caja.service';
import {
  aFechaDb,
  deFechaDb,
  finDiaBogota,
  hoyBogota,
  inicioDiaBogota,
  sumarDias,
} from '../comun/fechas';
import { PrismaService } from '../prisma/prisma.service';

const ZONA = 'America/Bogota';

@Injectable()
export class InformesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caja: CajaService,
  ) {}

  /** Lo cobrado (recibos vigentes) de la sucursal en el período, por día de Colombia. */
  async cobros(ctx: ContextoEmpresa, p: PeriodoInforme): Promise<InformeCobros> {
    const ini = inicioDiaBogota(p.desde);
    const fin = finDiaBogota(p.hasta);
    const e = ctx.empresaId;
    const s = ctx.sucursalId;
    const [porDia, porMedio, porPlan, anulados] = await Promise.all([
      this.prisma.$queryRaw<{ fecha: Date; recibos: number; valor: string }[]>`
        SELECT (r.fecha_hora AT TIME ZONE ${ZONA})::date AS fecha, count(*)::int AS recibos, sum(r.valor)::text AS valor
        FROM recibo r
        WHERE r.empresa_id = ${e}::uuid AND r.sucursal_id = ${s}::uuid AND r.estado = 'VIGENTE'
          AND r.fecha_hora >= ${ini}::timestamptz AND r.fecha_hora < ${fin}::timestamptz
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ medio: MedioPago; valor: string }[]>`
        SELECT p.medio, sum(p.valor)::text AS valor
        FROM recibo_pago p JOIN recibo r ON r.id = p.recibo_id
        WHERE r.empresa_id = ${e}::uuid AND r.sucursal_id = ${s}::uuid AND r.estado = 'VIGENTE'
          AND r.fecha_hora >= ${ini}::timestamptz AND r.fecha_hora < ${fin}::timestamptz
        GROUP BY p.medio ORDER BY sum(p.valor) DESC`,
      this.prisma.$queryRaw<{ plan: string; cantidad: number; valor: string }[]>`
        SELECT sc.plan_nombre AS plan, count(*)::int AS cantidad, sum(r.valor)::text AS valor
        FROM recibo r JOIN suscripcion sc ON sc.id = r.suscripcion_id
        WHERE r.empresa_id = ${e}::uuid AND r.sucursal_id = ${s}::uuid AND r.estado = 'VIGENTE'
          AND r.fecha_hora >= ${ini}::timestamptz AND r.fecha_hora < ${fin}::timestamptz
        GROUP BY sc.plan_nombre ORDER BY sum(r.valor) DESC`,
      this.prisma.recibo.count({
        where: {
          empresaId: e,
          sucursalId: s,
          estado: 'ANULADO',
          fechaHora: { gte: ini, lt: fin },
        },
      }),
    ]);
    const dinero = (v: string) => deCentavos(aCentavos(v));
    const total = porDia.reduce((a, d) => a + aCentavos(d.valor), 0n);
    return {
      desde: p.desde,
      hasta: p.hasta,
      total: deCentavos(total),
      recibos: porDia.reduce((a, d) => a + d.recibos, 0),
      anulados,
      porMedio: porMedio.map((m) => ({ medio: m.medio, valor: dinero(m.valor) })),
      porDia: porDia.map((d) => ({
        fecha: deFechaDb(d.fecha),
        recibos: d.recibos,
        valor: dinero(d.valor),
      })),
      porPlan: porPlan.map((x) => ({ plan: x.plan, cantidad: x.cantidad, valor: dinero(x.valor) })),
    };
  }

  /** Ingresos vigentes de la sucursal: por día, por hora (pico) y quiénes vienen más. */
  async ingresos(ctx: ContextoEmpresa, p: PeriodoInforme): Promise<InformeIngresos> {
    const e = ctx.empresaId;
    const s = ctx.sucursalId;
    const d = aFechaDb(p.desde);
    const h = aFechaDb(p.hasta);
    const [porDia, porHora, asiduos, personas] = await Promise.all([
      this.prisma.$queryRaw<{ fecha: Date; total: number; alertas: number }[]>`
        SELECT fecha, count(*)::int AS total, count(*) FILTER (WHERE resultado = 'ALERTA')::int AS alertas
        FROM ingreso
        WHERE empresa_id = ${e}::uuid AND sucursal_id = ${s}::uuid AND anulado_en IS NULL
          AND fecha >= ${d}::date AND fecha <= ${h}::date
        GROUP BY fecha ORDER BY fecha`,
      this.prisma.$queryRaw<{ hora: number; total: number }[]>`
        SELECT extract(hour FROM fecha_hora AT TIME ZONE ${ZONA})::int AS hora, count(*)::int AS total
        FROM ingreso
        WHERE empresa_id = ${e}::uuid AND sucursal_id = ${s}::uuid AND anulado_en IS NULL
          AND fecha >= ${d}::date AND fecha <= ${h}::date
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ id: string; nombre: string; documento: string; ingresos: number }[]>`
        SELECT a.id, a.nombre, a.documento, count(*)::int AS ingresos
        FROM ingreso i JOIN afiliado a ON a.id = i.afiliado_id
        WHERE i.empresa_id = ${e}::uuid AND i.sucursal_id = ${s}::uuid AND i.anulado_en IS NULL
          AND i.fecha >= ${d}::date AND i.fecha <= ${h}::date
        GROUP BY a.id, a.nombre, a.documento ORDER BY count(*) DESC, a.nombre LIMIT 10`,
      this.prisma.$queryRaw<{ n: number }[]>`
        SELECT count(DISTINCT afiliado_id)::int AS n FROM ingreso
        WHERE empresa_id = ${e}::uuid AND sucursal_id = ${s}::uuid AND anulado_en IS NULL
          AND fecha >= ${d}::date AND fecha <= ${h}::date`,
    ]);
    const horas = new Map(porHora.map((x) => [x.hora, x.total]));
    return {
      desde: p.desde,
      hasta: p.hasta,
      total: porDia.reduce((a, x) => a + x.total, 0),
      afiliados: personas[0]?.n ?? 0,
      alertas: porDia.reduce((a, x) => a + x.alertas, 0),
      porDia: porDia.map((x) => ({
        fecha: deFechaDb(x.fecha),
        total: x.total,
        alertas: x.alertas,
      })),
      porHora: Array.from({ length: 24 }, (_, hora) => ({ hora, total: horas.get(hora) ?? 0 })),
      masAsiduos: asiduos.map((x) => ({
        afiliadoId: x.id,
        nombre: x.nombre,
        documento: x.documento,
        ingresos: x.ingresos,
      })),
    };
  }

  /**
   * Afiliados activos cuya cobertura termina pronto o terminó hace poco. La cobertura termina en el último día de
   * sus membresías vigentes (si renovó por adelantado, cuenta la nueva); las congeladas no vencen.
   */
  async vencimientos(
    ctx: ContextoEmpresa,
    dias: number,
    vencidasDias: number,
  ): Promise<InformeVencimientos> {
    const hoy = hoyBogota();
    const desde = aFechaDb(sumarDias(hoy, -vencidasDias));
    const hasta = aFechaDb(sumarDias(hoy, dias));
    const afiliados = await this.prisma.afiliado.findMany({
      where: {
        empresaId: ctx.empresaId,
        activo: true,
        suscripciones: { some: { estado: 'VIGENTE', fechaFin: { gte: desde, lte: hasta } } },
      },
      select: {
        id: true,
        nombre: true,
        documento: true,
        telefono: true,
        suscripciones: {
          where: { estado: 'VIGENTE' },
          orderBy: { fechaFin: 'desc' },
          take: 1,
          select: {
            planNombre: true,
            fechaFin: true,
            congeladaDesde: true,
            sesionesTotal: true,
            sesionesUsadas: true,
          },
        },
      },
    });
    const porVencer: FilaVencimiento[] = [];
    const vencidas: FilaVencimiento[] = [];
    for (const a of afiliados) {
      const u = a.suscripciones[0];
      if (!u || u.congeladaDesde) continue;
      const fin = deFechaDb(u.fechaFin);
      const d = diasEntre(hoy, fin);
      if (d > dias || d < -vencidasDias) continue; // la última membresía puede salir del rango aunque otra entrara
      const fila: FilaVencimiento = {
        afiliadoId: a.id,
        nombre: a.nombre,
        documento: a.documento,
        telefono: a.telefono,
        plan: u.planNombre,
        fechaFin: fin,
        dias: d,
        estado: d < 0 ? 'VENCIDA' : d <= 7 ? 'POR_VENCER' : 'VIGENTE',
        sesionesRestantes: u.sesionesTotal !== null ? u.sesionesTotal - u.sesionesUsadas : null,
      };
      (d < 0 ? vencidas : porVencer).push(fila);
    }
    porVencer.sort((x, y) => x.dias - y.dias || x.nombre.localeCompare(y.nombre));
    vencidas.sort((x, y) => y.dias - x.dias || x.nombre.localeCompare(y.nombre));
    return { hoy, porVencer, vencidas };
  }

  /** Cierres de caja del período con su cuadre. */
  async cajas(ctx: ContextoEmpresa, p: PeriodoInforme): Promise<InformeCajas> {
    const turnos = await this.caja.turnosDelPeriodo(ctx, p.desde, p.hasta);
    const filas: FilaCaja[] = turnos.map((t) => ({
      id: t.id,
      numero: t.numero,
      cajero: t.cajeroNombre,
      abiertoEn: t.abiertoEn,
      cerradoEn: t.cerradoEn,
      estado: t.estado,
      base: t.resumen.base,
      cobrosEfectivo: t.resumen.efectivoCobros,
      otrosMedios: deCentavos(
        Object.values(t.resumen.otrosMedios).reduce((a, v) => a + aCentavos(v ?? '0'), 0n),
      ),
      ingresos: t.resumen.ingresos,
      egresos: t.resumen.egresos,
      esperado: t.resumen.esperado,
      contado: t.contado,
      diferencia: t.diferencia,
      observaciones: t.observaciones,
    }));
    return {
      desde: p.desde,
      hasta: p.hasta,
      turnos: filas,
      abiertas: filas.filter((f) => f.estado === 'ABIERTO').length,
      diferenciaTotal: deCentavos(filas.reduce((a, f) => a + aCentavos(f.diferencia ?? '0'), 0n)),
      cobrosTotal: deCentavos(turnos.reduce((a, t) => a + aCentavos(t.resumen.totalCobros), 0n)),
    };
  }
}
