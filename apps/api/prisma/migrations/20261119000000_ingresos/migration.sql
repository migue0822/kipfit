-- Etapa 2: ingresos de los afiliados al gimnasio.

CREATE TABLE "ingreso" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "afiliado_id" UUID NOT NULL,
    "suscripcion_id" UUID,
    "fecha_hora" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha" DATE NOT NULL,
    "origen" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "estado_membresia" TEXT NOT NULL,
    "plan_nombre" TEXT,
    "vence_el" DATE,
    "dias_vencido" INTEGER NOT NULL DEFAULT 0,
    "descuenta_sesion" BOOLEAN NOT NULL DEFAULT false,
    "alerta_revisada" BOOLEAN NOT NULL DEFAULT true,
    "registrado_por_id" UUID,
    "anulado_en" TIMESTAMPTZ,
    "motivo_anulacion" TEXT,

    CONSTRAINT "ingreso_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ingreso_empresa_id_sucursal_id_fecha_fecha_hora_idx" ON "ingreso"("empresa_id", "sucursal_id", "fecha", "fecha_hora");
CREATE INDEX "ingreso_empresa_id_afiliado_id_fecha_hora_idx" ON "ingreso"("empresa_id", "afiliado_id", "fecha_hora");

ALTER TABLE "ingreso" ADD CONSTRAINT "ingreso_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ingreso" ADD CONSTRAINT "ingreso_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ingreso" ADD CONSTRAINT "ingreso_afiliado_id_fkey" FOREIGN KEY ("afiliado_id") REFERENCES "afiliado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ingreso" ADD CONSTRAINT "ingreso_suscripcion_id_fkey" FOREIGN KEY ("suscripcion_id") REFERENCES "suscripcion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reglas que Prisma no conoce.
ALTER TABLE "ingreso" ADD CONSTRAINT "ingreso_origen_check" CHECK ("origen" IN ('RECEPCION', 'TABLET'));
ALTER TABLE "ingreso" ADD CONSTRAINT "ingreso_resultado_check" CHECK ("resultado" IN ('PERMITIDO', 'ALERTA'));
ALTER TABLE "ingreso" ADD CONSTRAINT "ingreso_dias_vencido_check" CHECK ("dias_vencido" >= 0);
ALTER TABLE "ingreso" ADD CONSTRAINT "ingreso_anulacion_check" CHECK (("anulado_en" IS NULL) = ("motivo_anulacion" IS NULL));
-- Solo la tiquetera descuenta sesión, y solo si el ingreso tiene membresía.
ALTER TABLE "ingreso" ADD CONSTRAINT "ingreso_sesion_check" CHECK ("descuenta_sesion" = false OR "suscripcion_id" IS NOT NULL);

-- Aislamiento por empresa (RLS).
ALTER TABLE "ingreso" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "ingreso" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
