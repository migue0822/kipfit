-- Etapa 1: planes, afiliados y membresías (suscripciones).

CREATE TABLE "plan_gimnasio" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "precio" DECIMAL(18,2) NOT NULL,
    "dias" INTEGER NOT NULL,
    "sesiones" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_gimnasio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "afiliado" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "documento" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "fecha_nacimiento" DATE,
    "referido_por_id" UUID,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "texto_busqueda" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "afiliado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suscripcion" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "afiliado_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "precio" DECIMAL(18,2) NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "sesiones_total" INTEGER,
    "sesiones_usadas" INTEGER NOT NULL DEFAULT 0,
    "congelada_desde" DATE,
    "dias_congelados" INTEGER NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
    "motivo_anulacion" TEXT,
    "anulada_en" TIMESTAMPTZ,
    "creado_por_id" UUID,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suscripcion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_gimnasio_empresa_id_nombre_key" ON "plan_gimnasio"("empresa_id", "nombre");
CREATE UNIQUE INDEX "afiliado_empresa_id_documento_key" ON "afiliado"("empresa_id", "documento");
CREATE INDEX "afiliado_empresa_id_nombre_idx" ON "afiliado"("empresa_id", "nombre");
CREATE INDEX "suscripcion_empresa_id_afiliado_id_fecha_fin_idx" ON "suscripcion"("empresa_id", "afiliado_id", "fecha_fin");
CREATE INDEX "suscripcion_empresa_id_estado_fecha_fin_idx" ON "suscripcion"("empresa_id", "estado", "fecha_fin");

ALTER TABLE "plan_gimnasio" ADD CONSTRAINT "plan_gimnasio_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "afiliado" ADD CONSTRAINT "afiliado_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "afiliado" ADD CONSTRAINT "afiliado_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "afiliado" ADD CONSTRAINT "afiliado_referido_por_id_fkey" FOREIGN KEY ("referido_por_id") REFERENCES "afiliado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "suscripcion" ADD CONSTRAINT "suscripcion_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suscripcion" ADD CONSTRAINT "suscripcion_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suscripcion" ADD CONSTRAINT "suscripcion_afiliado_id_fkey" FOREIGN KEY ("afiliado_id") REFERENCES "afiliado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suscripcion" ADD CONSTRAINT "suscripcion_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan_gimnasio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que Prisma no conoce.
ALTER TABLE "plan_gimnasio" ADD CONSTRAINT "plan_gimnasio_tipo_check" CHECK ("tipo" IN ('MENSUAL', 'TIQUETERA'));
ALTER TABLE "plan_gimnasio" ADD CONSTRAINT "plan_gimnasio_valores_check" CHECK (
  "precio" >= 0 AND "dias" > 0 AND
  (("tipo" = 'TIQUETERA' AND "sesiones" > 0) OR ("tipo" = 'MENSUAL' AND "sesiones" IS NULL))
);
ALTER TABLE "suscripcion" ADD CONSTRAINT "suscripcion_estado_check" CHECK ("estado" IN ('VIGENTE', 'ANULADA'));
ALTER TABLE "suscripcion" ADD CONSTRAINT "suscripcion_fechas_check" CHECK ("fecha_fin" >= "fecha_inicio" AND "dias_congelados" >= 0 AND "precio" >= 0);
ALTER TABLE "suscripcion" ADD CONSTRAINT "suscripcion_sesiones_check" CHECK (
  ("sesiones_total" IS NULL AND "sesiones_usadas" = 0) OR
  ("sesiones_total" IS NOT NULL AND "sesiones_usadas" >= 0 AND "sesiones_usadas" <= "sesiones_total")
);
ALTER TABLE "afiliado" ADD CONSTRAINT "afiliado_referido_check" CHECK ("referido_por_id" IS NULL OR "referido_por_id" <> "id");

-- Aislamiento por empresa (RLS), como el resto de las tablas de negocio.
ALTER TABLE "plan_gimnasio" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "plan_gimnasio" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
ALTER TABLE "afiliado" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "afiliado" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
ALTER TABLE "suscripcion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "suscripcion" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
