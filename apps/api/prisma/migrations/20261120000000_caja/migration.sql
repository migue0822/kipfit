-- Etapa 3: caja por turno, recibos de cobro de membresías y movimientos de caja.

CREATE TABLE "turno_caja" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "cajero_id" UUID NOT NULL,
    "prefijo" TEXT NOT NULL,
    "numero" BIGINT NOT NULL,
    "abierto_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "base" DECIMAL(18,2) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTO',
    "cerrado_en" TIMESTAMPTZ,
    "cerrado_por_id" UUID,
    "contado" DECIMAL(18,2),
    "esperado" DECIMAL(18,2),
    "diferencia" DECIMAL(18,2),
    "observaciones" TEXT,
    "resumen" JSONB,

    CONSTRAINT "turno_caja_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recibo" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "turno_id" UUID NOT NULL,
    "afiliado_id" UUID NOT NULL,
    "suscripcion_id" UUID NOT NULL,
    "prefijo" TEXT NOT NULL,
    "numero" BIGINT NOT NULL,
    "concepto" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "fecha_hora" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
    "anulado_en" TIMESTAMPTZ,
    "motivo_anulacion" TEXT,
    "anulado_turno_id" UUID,
    "creado_por_id" UUID,

    CONSTRAINT "recibo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recibo_pago" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "recibo_id" UUID NOT NULL,
    "medio" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "recibo_pago_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "movimiento_caja" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "turno_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "prefijo" TEXT NOT NULL,
    "numero" BIGINT NOT NULL,
    "fecha_hora" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
    "anulado_en" TIMESTAMPTZ,
    "motivo_anulacion" TEXT,
    "creado_por_id" UUID,

    CONSTRAINT "movimiento_caja_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "turno_caja_empresa_id_prefijo_numero_key" ON "turno_caja"("empresa_id", "prefijo", "numero");
CREATE INDEX "turno_caja_empresa_id_sucursal_id_abierto_en_idx" ON "turno_caja"("empresa_id", "sucursal_id", "abierto_en");
CREATE UNIQUE INDEX "recibo_suscripcion_id_key" ON "recibo"("suscripcion_id");
CREATE UNIQUE INDEX "recibo_empresa_id_prefijo_numero_key" ON "recibo"("empresa_id", "prefijo", "numero");
CREATE INDEX "recibo_empresa_id_sucursal_id_fecha_hora_idx" ON "recibo"("empresa_id", "sucursal_id", "fecha_hora");
CREATE INDEX "recibo_empresa_id_afiliado_id_idx" ON "recibo"("empresa_id", "afiliado_id");
CREATE INDEX "recibo_turno_id_idx" ON "recibo"("turno_id");
CREATE UNIQUE INDEX "recibo_pago_recibo_id_medio_key" ON "recibo_pago"("recibo_id", "medio");
CREATE INDEX "recibo_pago_empresa_id_idx" ON "recibo_pago"("empresa_id");
CREATE UNIQUE INDEX "movimiento_caja_empresa_id_prefijo_numero_key" ON "movimiento_caja"("empresa_id", "prefijo", "numero");
CREATE INDEX "movimiento_caja_turno_id_idx" ON "movimiento_caja"("turno_id");

ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_afiliado_id_fkey" FOREIGN KEY ("afiliado_id") REFERENCES "afiliado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_suscripcion_id_fkey" FOREIGN KEY ("suscripcion_id") REFERENCES "suscripcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recibo_pago" ADD CONSTRAINT "recibo_pago_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recibo_pago" ADD CONSTRAINT "recibo_pago_recibo_id_fkey" FOREIGN KEY ("recibo_id") REFERENCES "recibo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que Prisma no conoce.
-- Un turno abierto por cajero y sucursal.
CREATE UNIQUE INDEX "turno_caja_abierto_unico" ON "turno_caja"("sucursal_id", "cajero_id") WHERE "estado" = 'ABIERTO';
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_estado_check" CHECK ("estado" IN ('ABIERTO', 'CERRADO'));
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_base_check" CHECK ("base" >= 0);
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_cierre_check" CHECK (
  ("estado" = 'ABIERTO' AND "cerrado_en" IS NULL AND "contado" IS NULL)
  OR ("estado" = 'CERRADO' AND "cerrado_en" IS NOT NULL AND "contado" IS NOT NULL AND "contado" >= 0)
);
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_estado_check" CHECK ("estado" IN ('VIGENTE', 'ANULADO'));
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_valor_check" CHECK ("valor" > 0);
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_anulacion_check" CHECK (("estado" = 'ANULADO') = ("anulado_en" IS NOT NULL AND "motivo_anulacion" IS NOT NULL));
ALTER TABLE "recibo_pago" ADD CONSTRAINT "recibo_pago_medio_check" CHECK ("medio" IN ('EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'TARJETA'));
ALTER TABLE "recibo_pago" ADD CONSTRAINT "recibo_pago_valor_check" CHECK ("valor" > 0);
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_tipo_check" CHECK ("tipo" IN ('INGRESO', 'EGRESO'));
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_estado_check" CHECK ("estado" IN ('VIGENTE', 'ANULADO'));
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_valor_check" CHECK ("valor" > 0);
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_anulacion_check" CHECK (("estado" = 'ANULADO') = ("anulado_en" IS NOT NULL AND "motivo_anulacion" IS NOT NULL));

-- Consecutivos de las sucursales que ya existen (las nuevas los reciben al crearse).
INSERT INTO "numeracion" ("id", "empresa_id", "sucursal_id", "tipo_documento", "prefijo", "actual", "activa")
SELECT gen_random_uuid(), s."empresa_id", s."id", t.tipo, t.base || s."codigo", 0, true
FROM "sucursal" s
CROSS JOIN (VALUES ('TURNO', 'CJ'), ('MOVIMIENTO', 'MC')) AS t(tipo, base)
ON CONFLICT ("sucursal_id", "tipo_documento") DO NOTHING;

-- Aislamiento por empresa (RLS).
ALTER TABLE "turno_caja" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "turno_caja" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
ALTER TABLE "recibo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "recibo" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
ALTER TABLE "recibo_pago" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "recibo_pago" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
ALTER TABLE "movimiento_caja" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "movimiento_caja" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
