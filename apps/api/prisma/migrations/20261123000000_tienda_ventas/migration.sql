-- Tienda parte 2: ventas cobradas por la caja y devoluciones.

-- El recibo puede ser de una venta de la tienda (sin suscripción, afiliado opcional).
ALTER TABLE "recibo" ALTER COLUMN "afiliado_id" DROP NOT NULL;
ALTER TABLE "recibo" ALTER COLUMN "suscripcion_id" DROP NOT NULL;
ALTER TABLE "recibo" ADD COLUMN "documento_id" UUID;
CREATE UNIQUE INDEX "recibo_documento_id_key" ON "recibo"("documento_id");
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_origen_check" CHECK (
  ("suscripcion_id" IS NOT NULL AND "afiliado_id" IS NOT NULL AND "documento_id" IS NULL)
  OR ("suscripcion_id" IS NULL AND "documento_id" IS NOT NULL)
);

-- Egreso de caja de una devolución en efectivo.
ALTER TABLE "movimiento_caja" ADD COLUMN "documento_id" UUID;
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "movimiento_caja_documento_id_idx" ON "movimiento_caja"("documento_id");

-- Documentos de venta y devolución.
ALTER TABLE "documento" ADD COLUMN "turno_id" UUID;
ALTER TABLE "documento" ADD COLUMN "afiliado_id" UUID;
ALTER TABLE "documento" ADD COLUMN "documento_origen_id" UUID;
ALTER TABLE "documento" ADD COLUMN "recibido" DECIMAL(18,2);
ALTER TABLE "documento" ADD COLUMN "cambio" DECIMAL(18,2);
ALTER TABLE "documento" ADD COLUMN "medio_devolucion" TEXT;
ALTER TABLE "documento" ADD CONSTRAINT "documento_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documento" ADD CONSTRAINT "documento_afiliado_id_fkey" FOREIGN KEY ("afiliado_id") REFERENCES "afiliado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documento" ADD CONSTRAINT "documento_documento_origen_id_fkey" FOREIGN KEY ("documento_origen_id") REFERENCES "documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documento" ADD CONSTRAINT "documento_medio_devolucion_check" CHECK ("medio_devolucion" IS NULL OR "medio_devolucion" IN ('EFECTIVO','OTRO'));
CREATE INDEX "documento_documento_origen_id_idx" ON "documento"("documento_origen_id");

ALTER TABLE "documento_linea" ADD COLUMN "precio" DECIMAL(18,2);
ALTER TABLE "documento_linea" ADD COLUMN "total" DECIMAL(18,2);
