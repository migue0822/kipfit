-- Licencias (se manejan desde la consola de plataforma de OrdenKipu): planes, licencia de cada empresa y pagos.

-- Planes (comunes a todas las empresas, sin empresa_id): precio y límites de usuarios y sucursales.
CREATE TABLE "plan" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio_mensual" DECIMAL(18,2) NOT NULL,
    "max_usuarios" INTEGER,
    "max_sucursales" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_precio_check" CHECK ("precio_mensual" >= 0),
    CONSTRAINT "plan_max_usuarios_check" CHECK ("max_usuarios" > 0),
    CONSTRAINT "plan_max_sucursales_check" CHECK ("max_sucursales" > 0)
);
CREATE UNIQUE INDEX "plan_nombre_key" ON "plan"("nombre");

-- Licencia de la empresa. Las que ya existen quedan sin plan y sin vencimiento.
ALTER TABLE "empresa"
    ADD COLUMN "plan_id" UUID,
    ADD COLUMN "pagado_hasta" DATE,
    ADD COLUMN "licencia_estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    ADD COLUMN "licencia_notas" TEXT,
    ADD CONSTRAINT "empresa_licencia_estado_check"
        CHECK ("licencia_estado" IN ('ACTIVA', 'SUSPENDIDA', 'RETIRADA'));
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pagos: cada uno corre `pagado_hasta`; anularlo lo devuelve al anterior. Lo registra un administrador de
-- la consola (se guarda su nombre: no es usuario de Kipfit).
CREATE TABLE "pago_licencia" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "meses" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "medio" TEXT NOT NULL,
    "referencia" TEXT,
    "observaciones" TEXT,
    "pagado_hasta_anterior" DATE,
    "pagado_hasta" DATE NOT NULL,
    "registrado_por" TEXT NOT NULL,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "motivo_anulacion" TEXT,
    "anulado_en" TIMESTAMPTZ,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pago_licencia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pago_licencia_meses_check" CHECK ("meses" > 0),
    CONSTRAINT "pago_licencia_valor_check" CHECK ("valor" >= 0)
);
CREATE INDEX "pago_licencia_empresa_id_fecha_idx" ON "pago_licencia"("empresa_id", "fecha");
ALTER TABLE "pago_licencia" ADD CONSTRAINT "pago_licencia_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pago_licencia" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aislamiento_empresa" ON "pago_licencia" USING ("empresa_id" = empresa_actual()) WITH CHECK ("empresa_id" = empresa_actual());

-- Las empresas no modifican planes ni pagos de licencia (solo la consola, sin el rol limitado).
REVOKE INSERT, UPDATE, DELETE ON "plan", "pago_licencia" FROM kip_app;
