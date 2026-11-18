import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  estadoLicencia,
  extenderLicencia,
  passwordSchema,
  PERMISO_TOTAL,
  type CrearEmpresaPlataforma,
  type DetalleEmpresaPlataforma,
  type EmpresaPlataforma,
  type EstadoLicencia,
  type LicenciaDatos,
  type PagoLicencia,
  type PagoLicenciaDatos,
  type PlanDatos,
  type PlanPlataforma,
} from '@kip/shared';
import { crearEmpresaEnTx } from '../auth/crear-empresa';
import { hashPassword } from '../auth/password';
import { aJson } from '../comun/auditoria';
import { aFechaDb, deFechaDb, hoyBogota } from '../comun/fechas';
import { esViolacionUnica } from '../comun/pipes';
import type { Prisma } from '../generated/prisma/client';
import { IngresosService } from '../ingresos/ingresos.service';
import { PrismaService } from '../prisma/prisma.service';

const selectEmpresa = {
  id: true,
  nit: true,
  dv: true,
  razonSocial: true,
  creadoEn: true,
  licenciaEstado: true,
  pagadoHasta: true,
  licenciaNotas: true,
  telefono: true,
  plan: { select: { id: true, nombre: true, precioMensual: true } },
  _count: {
    select: {
      membresias: { where: { activa: true, usuario: { activo: true } } },
      sucursales: { where: { activa: true } },
      pagosLicencia: { where: { anulado: false } },
    },
  },
} satisfies Prisma.EmpresaSelect;

type FilaEmpresa = Prisma.EmpresaGetPayload<{ select: typeof selectEmpresa }>;

/**
 * Plataforma de Kipfit: todas las empresas, sus planes, licencias, demostraciones y pagos. La usa la
 * consola de OrdenKipu (sin empresa: ve todas). `quien` = administrador de la consola; cada cambio queda
 * en la auditoría de la empresa afectada con su nombre.
 */
@Injectable()
export class PlataformaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingresosSvc: IngresosService,
  ) {}

  // ------------------------------------------------------------ empresas

  async empresas(): Promise<EmpresaPlataforma[]> {
    const filas = await this.prisma.empresa.findMany({
      select: selectEmpresa,
      orderBy: { razonSocial: 'asc' },
    });
    return this.completar(filas);
  }

  async empresa(id: string): Promise<DetalleEmpresaPlataforma> {
    const fila = await this.prisma.empresa.findUnique({ where: { id }, select: selectEmpresa });
    if (!fila) throw new NotFoundException('Empresa no encontrada');
    const [empresa] = await this.completar([fila]);
    const pagos = await this.prisma.pagoLicencia.findMany({
      where: { empresaId: id },
      orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
    });
    return {
      ...empresa!,
      pagos: pagos.map((p): PagoLicencia => ({
        id: p.id,
        fecha: deFechaDb(p.fecha),
        meses: p.meses,
        valor: p.valor.toFixed(2),
        medio: p.medio as PagoLicencia['medio'],
        referencia: p.referencia,
        observaciones: p.observaciones,
        pagadoHastaAnterior: p.pagadoHastaAnterior ? deFechaDb(p.pagadoHastaAnterior) : null,
        pagadoHasta: deFechaDb(p.pagadoHasta),
        registradoPor: p.registradoPor,
        anulado: p.anulado,
        motivoAnulacion: p.motivoAnulacion,
        creadoEn: p.creadoEn.toISOString(),
      })),
    };
  }

  /** Crea la empresa completa; el administrador es una cuenta nueva o una que ya existe en Kipfit. */
  async crearEmpresa(quien: string, d: CrearEmpresaPlataforma) {
    if (
      await this.prisma.empresa.findUnique({ where: { nit: d.empresa.nit }, select: { id: true } })
    ) {
      throw new ConflictException('Ya existe una empresa registrada con ese NIT');
    }
    if (d.planId) await this.planUsable(this.prisma, d.planId, null);
    const existente = await this.prisma.usuario.findUnique({
      where: { email: d.usuario.email },
      select: { id: true },
    });
    let hash: string | null = null;
    if (!existente) {
      const clave = passwordSchema.safeParse(d.usuario.password ?? '');
      if (!clave.success) {
        throw new BadRequestException(
          d.usuario.password
            ? clave.error.issues[0]!.message
            : 'El correo no tiene cuenta en Kipfit: indique una contraseña inicial para el administrador',
        );
      }
      hash = await hashPassword(clave.data);
    }
    try {
      const { empresaId } = await this.prisma.$transaction(async (tx) => {
        const usuarioId =
          existente?.id ??
          (
            await tx.usuario.create({
              data: { email: d.usuario.email, nombre: d.usuario.nombre, hashPassword: hash! },
              select: { id: true },
            })
          ).id;
        return crearEmpresaEnTx(tx, d, usuarioId, {
          planId: d.planId,
          pagadoHasta: d.pagadoHasta,
          notas: d.notas,
          creadaPor: quien,
        });
      });
      return { ...(await this.empresa(empresaId)), cuentaExistente: Boolean(existente) };
    } catch (e) {
      if (esViolacionUnica(e)) {
        throw new ConflictException('El correo o el NIT ya están registrados');
      }
      throw e;
    }
  }

  /** Plan, vencimiento, estado y notas. RETIRADA quita el acceso (la empresa se inactiva). */
  async cambiarLicencia(quien: string, id: string, d: LicenciaDatos) {
    await this.prisma.$transaction(async (tx) => {
      const antes = await this.bloquearEmpresa(tx, id);
      if (d.planId) await this.planUsable(tx, d.planId, antes.planId);
      const despues = {
        planId: d.planId,
        pagadoHasta: d.pagadoHasta,
        licenciaEstado: d.estado,
        licenciaNotas: d.notas || null,
      };
      await tx.empresa.update({
        where: { id },
        data: {
          ...despues,
          pagadoHasta: d.pagadoHasta ? aFechaDb(d.pagadoHasta) : null,
          activa: d.estado !== 'RETIRADA',
        },
        select: { id: true },
      });
      await this.auditar(tx, quien, id, 'licencia', id, 'editar', antes, despues);
    });
    return this.empresa(id);
  }

  /** Registra el pago y corre "pagado hasta" los meses pagados (la demostración termina). */
  async registrarPago(quien: string, id: string, d: PagoLicenciaDatos) {
    if (d.fecha > hoyBogota()) {
      throw new BadRequestException('La fecha del pago no puede ser futura');
    }
    await this.prisma.$transaction(async (tx) => {
      const e = await this.bloquearEmpresa(tx, id);
      if (e.licenciaEstado === 'RETIRADA') {
        throw new ConflictException('La empresa está retirada: cámbiela a activa antes del pago');
      }
      const nuevo = extenderLicencia(e.pagadoHasta, d.fecha, d.meses);
      const pago = await tx.pagoLicencia.create({
        data: {
          empresaId: id,
          fecha: aFechaDb(d.fecha),
          meses: d.meses,
          valor: d.valor,
          medio: d.medio,
          referencia: d.referencia || null,
          observaciones: d.observaciones || null,
          pagadoHastaAnterior: e.pagadoHasta ? aFechaDb(e.pagadoHasta) : null,
          pagadoHasta: aFechaDb(nuevo),
          registradoPor: quien,
        },
        select: { id: true },
      });
      await tx.empresa.update({
        where: { id },
        data: { pagadoHasta: aFechaDb(nuevo) },
        select: { id: true },
      });
      await this.auditar(tx, quien, id, 'pago_licencia', pago.id, 'crear', undefined, {
        ...d,
        pagadoHastaAnterior: e.pagadoHasta,
        pagadoHasta: nuevo,
      });
    });
    return this.empresa(id);
  }

  /**
   * Anula un pago y devuelve "pagado hasta" a como estaba. Solo el último vigente y si la fecha
   * no se cambió a mano después (si no, se corrige en la licencia).
   */
  async anularPago(quien: string, pagoId: string, motivo: string) {
    const pago = await this.prisma.pagoLicencia.findUnique({
      where: { id: pagoId },
      select: { empresaId: true },
    });
    if (!pago) throw new NotFoundException('Pago no encontrado');
    await this.prisma.$transaction(async (tx) => {
      const e = await this.bloquearEmpresa(tx, pago.empresaId);
      const p = await tx.pagoLicencia.findUniqueOrThrow({ where: { id: pagoId } });
      if (p.anulado) throw new ConflictException('El pago ya está anulado');
      const ultimo = await tx.pagoLicencia.findFirst({
        where: { empresaId: p.empresaId, anulado: false },
        orderBy: { creadoEn: 'desc' },
        select: { id: true },
      });
      if (ultimo?.id !== p.id || e.pagadoHasta !== deFechaDb(p.pagadoHasta)) {
        throw new ConflictException(
          'Solo se anula el último pago y si "pagado hasta" no se cambió después; corrija la fecha en la licencia',
        );
      }
      await tx.pagoLicencia.update({
        where: { id: p.id },
        data: { anulado: true, motivoAnulacion: motivo, anuladoEn: new Date() },
      });
      await tx.empresa.update({
        where: { id: p.empresaId },
        data: { pagadoHasta: p.pagadoHastaAnterior },
        select: { id: true },
      });
      await this.auditar(tx, quien, p.empresaId, 'pago_licencia', p.id, 'anular', undefined, {
        motivo,
        pagadoHasta: p.pagadoHastaAnterior ? deFechaDb(p.pagadoHastaAnterior) : null,
      });
    });
    return this.empresa(pago.empresaId);
  }

  // ------------------------------------------------------------ planes

  async planes(): Promise<PlanPlataforma[]> {
    const planes = await this.prisma.plan.findMany({
      orderBy: [{ activo: 'desc' }, { precioMensual: 'asc' }],
      include: {
        _count: { select: { empresas: { where: { licenciaEstado: { not: 'RETIRADA' } } } } },
      },
    });
    return planes.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      precioMensual: p.precioMensual.toFixed(2),
      modulos: [],
      maxUsuarios: p.maxUsuarios,
      maxSucursales: p.maxSucursales,
      activo: p.activo,
      empresas: p._count.empresas,
    }));
  }

  async crearPlan(d: PlanDatos) {
    try {
      await this.prisma.plan.create({ data: d });
    } catch (e) {
      if (esViolacionUnica(e)) throw new ConflictException('Ya existe un plan con ese nombre');
      throw e;
    }
    return this.planes();
  }

  /** Cambiar un plan aplica de inmediato a todas sus empresas. */
  async editarPlan(id: string, d: PlanDatos) {
    try {
      await this.prisma.plan.update({ where: { id }, data: d });
    } catch (e) {
      if (esViolacionUnica(e)) throw new ConflictException('Ya existe un plan con ese nombre');
      if ((e as { code?: string }).code === 'P2025') {
        throw new NotFoundException('Plan no encontrado');
      }
      throw e;
    }
    return this.planes();
  }

  /** Un plan inactivo no se asigna a empresas nuevas; las que lo tienen lo conservan. */
  async estadoPlan(id: string, activo: boolean) {
    const r = await this.prisma.plan.updateMany({ where: { id }, data: { activo } });
    if (r.count === 0) throw new NotFoundException('Plan no encontrado');
    return this.planes();
  }

  // ------------------------------------------------------------ apoyo

  private async completar(filas: FilaEmpresa[]): Promise<EmpresaPlataforma[]> {
    const ids = filas.map((f) => f.id);
    const hoy = hoyBogota();
    const [ingresos, admins, delMes] = await Promise.all([
      this.prisma.sesion.groupBy({
        by: ['empresaId'],
        where: { empresaId: { in: ids } },
        _max: { creadoEn: true },
      }),
      this.prisma.membresia.findMany({
        where: {
          empresaId: { in: ids },
          activa: true,
          usuario: { activo: true },
          rol: { permisos: { has: PERMISO_TOTAL } },
        },
        orderBy: { usuario: { creadoEn: 'asc' } },
        select: { empresaId: true, usuario: { select: { nombre: true, email: true } } },
      }),
      this.ingresosSvc.delMes(ids),
    ]);
    const ingreso = new Map(ingresos.map((i) => [i.empresaId, i._max.creadoEn]));
    const admin = new Map<string, { nombre: string; email: string }>();
    for (const a of admins) if (!admin.has(a.empresaId)) admin.set(a.empresaId, a.usuario);

    return filas.map((f) => {
      const pagadoHasta = f.pagadoHasta ? deFechaDb(f.pagadoHasta) : null;
      const l = estadoLicencia({ estado: f.licenciaEstado, pagadoHasta, hoy });
      return {
        id: f.id,
        nit: f.nit,
        dv: f.dv,
        razonSocial: f.razonSocial,
        creadoEn: f.creadoEn.toISOString(),
        estado: f.licenciaEstado as EstadoLicencia,
        pagadoHasta,
        soloLectura: f.licenciaEstado === 'RETIRADA' || l.soloLectura,
        diasRestantes: l.diasRestantes,
        enDemo: pagadoHasta !== null && f._count.pagosLicencia === 0,
        plan: f.plan
          ? { id: f.plan.id, nombre: f.plan.nombre, precioMensual: f.plan.precioMensual.toFixed(2) }
          : null,
        notas: f.licenciaNotas,
        usuariosActivos: f._count.membresias,
        sucursalesActivas: f._count.sucursales,
        ultimoIngreso: ingreso.get(f.id)?.toISOString() ?? null,
        // La consola comparte la forma con OrdenKipu: aquí son los ingresos vigentes del mes.
        ventasMes: delMes.get(f.id) ?? 0,
        administrador: admin.get(f.id) ?? null,
        telefono: f.telefono,
      };
    });
  }

  /** Bloquea la fila de la empresa (serializa pagos y cambios de licencia) y la devuelve. */
  private async bloquearEmpresa(tx: Prisma.TransactionClient, id: string) {
    const [e] = await tx.$queryRaw<
      {
        plan_id: string | null;
        pagado_hasta: Date | null;
        licencia_estado: string;
        licencia_notas: string | null;
      }[]
    >`SELECT plan_id, pagado_hasta, licencia_estado, licencia_notas FROM empresa WHERE id = ${id}::uuid FOR UPDATE`;
    if (!e) throw new NotFoundException('Empresa no encontrada');
    return {
      planId: e.plan_id,
      pagadoHasta: e.pagado_hasta ? deFechaDb(e.pagado_hasta) : null,
      licenciaEstado: e.licencia_estado,
      licenciaNotas: e.licencia_notas,
    };
  }

  /** El plan existe y está activo (o es el que la empresa ya tiene). */
  private async planUsable(
    tx: Prisma.TransactionClient | PrismaService,
    planId: string,
    actual: string | null,
  ) {
    const plan = await tx.plan.findUnique({ where: { id: planId }, select: { activo: true } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    if (!plan.activo && planId !== actual) {
      throw new BadRequestException('El plan está inactivo: elija otro o reactívelo');
    }
  }

  private auditar(
    tx: Prisma.TransactionClient,
    quien: string,
    empresaId: string,
    entidad: string,
    entidadId: string,
    accion: string,
    antes: unknown,
    despues: unknown,
  ) {
    return tx.auditoria.create({
      data: {
        empresaId,
        usuarioId: null,
        entidad,
        entidadId,
        accion: `plataforma_${accion}`,
        antes: aJson(antes),
        despues: aJson({ ...(despues as object), por: quien }),
      },
    });
  }
}
