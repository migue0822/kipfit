-- Tienda: productos, existencias por sucursal, documentos (entradas y ajustes) y kardex.

CREATE TABLE "producto" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "codigo" TEXT,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT,
    "precio_venta" DECIMAL(18,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "texto_busqueda" TEXT NOT NULL DEFAULT '',
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "producto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "producto_precio_no_negativo" CHECK ("precio_venta" >= 0)
);
CREATE UNIQUE INDEX "producto_empresa_id_codigo_key" ON "producto"("empresa_id", "codigo");
CREATE INDEX "producto_empresa_id_idx" ON "producto"("empresa_id");

CREATE TABLE "existencia" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "valor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "costo_promedio" DECIMAL(18,4) NOT NULL DEFAULT 0,
    CONSTRAINT "existencia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "existencia_no_negativa" CHECK ("cantidad" >= 0 AND "valor" >= 0 AND "costo_promedio" >= 0)
);
CREATE UNIQUE INDEX "existencia_sucursal_id_producto_id_key" ON "existencia"("sucursal_id", "producto_id");
CREATE INDEX "existencia_empresa_id_idx" ON "existencia"("empresa_id");

CREATE TABLE "documento" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "prefijo" TEXT NOT NULL,
    "numero" BIGINT NOT NULL,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
    "referencia" TEXT,
    "proveedor" TEXT,
    "motivo" TEXT,
    "observaciones" TEXT,
    "valor_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creado_por_id" UUID,
    "anulado_en" TIMESTAMPTZ,
    "motivo_anulacion" TEXT,
    CONSTRAINT "documento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documento_tipo_valido" CHECK ("tipo" IN ('ENTRADA', 'AJUSTE', 'VENTA', 'DEVOLUCION')),
    CONSTRAINT "documento_estado_valido" CHECK ("estado" IN ('VIGENTE', 'ANULADO'))
);
CREATE UNIQUE INDEX "documento_empresa_id_prefijo_numero_key" ON "documento"("empresa_id", "prefijo", "numero");
CREATE INDEX "documento_empresa_id_sucursal_id_fecha_idx" ON "documento"("empresa_id", "sucursal_id", "fecha");

CREATE TABLE "documento_linea" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "producto_nombre" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costo_unitario" DECIMAL(18,4),
    "sistema" INTEGER,
    "valor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "documento_linea_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "documento_linea_documento_id_idx" ON "documento_linea"("documento_id");
CREATE INDEX "documento_linea_empresa_id_idx" ON "documento_linea"("empresa_id");

CREATE TABLE "movimiento_inventario" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "fecha" TIMESTAMPTZ NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costo_unitario" DECIMAL(18,4) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "saldo_cantidad" INTEGER NOT NULL,
    "saldo_valor" DECIMAL(18,2) NOT NULL,
    "costo_promedio" DECIMAL(18,4) NOT NULL,
    "es_anulacion" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "movimiento_inventario_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "movimiento_inventario_saldo_no_negativo" CHECK ("saldo_cantidad" >= 0 AND "saldo_valor" >= 0)
);
CREATE INDEX "movimiento_inventario_empresa_id_sucursal_id_producto_id_id_idx" ON "movimiento_inventario"("empresa_id", "sucursal_id", "producto_id", "id");
CREATE INDEX "movimiento_inventario_documento_id_idx" ON "movimiento_inventario"("documento_id");

ALTER TABLE "producto" ADD CONSTRAINT "producto_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "existencia" ADD CONSTRAINT "existencia_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "existencia" ADD CONSTRAINT "existencia_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "existencia" ADD CONSTRAINT "existencia_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documento" ADD CONSTRAINT "documento_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documento" ADD CONSTRAINT "documento_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documento_linea" ADD CONSTRAINT "documento_linea_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documento_linea" ADD CONSTRAINT "documento_linea_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Consecutivos de las sucursales que ya existen (las nuevas los reciben al crearse).
INSERT INTO "numeracion" ("id", "empresa_id", "sucursal_id", "tipo_documento", "prefijo", "actual", "activa")
SELECT gen_random_uuid(), s."empresa_id", s."id", t.tipo, t.base || s."codigo", 0, true
FROM "sucursal" s
CROSS JOIN (VALUES ('ENTRADA', 'EN'), ('AJUSTE', 'AJ'), ('VENTA', 'VT'), ('DEVOLUCION', 'DV')) AS t(tipo, base)
ON CONFLICT ("sucursal_id", "tipo_documento") DO NOTHING;

-- Aislamiento por empresa (RLS).
ALTER TABLE "producto" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "producto" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
ALTER TABLE "existencia" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "existencia" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
ALTER TABLE "documento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "documento" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
ALTER TABLE "documento_linea" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "documento_linea" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
ALTER TABLE "movimiento_inventario" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "movimiento_inventario" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
