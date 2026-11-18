-- Foto del afiliado (tabla aparte para no arrastrar los bytes en las consultas de la lista).

CREATE TABLE "afiliado_foto" (
    "afiliado_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "contenido" BYTEA NOT NULL,
    "actualizado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "afiliado_foto_pkey" PRIMARY KEY ("afiliado_id"),
    CONSTRAINT "afiliado_foto_tamano" CHECK (octet_length("contenido") <= 307200)
);

CREATE INDEX "afiliado_foto_empresa_id_idx" ON "afiliado_foto"("empresa_id");

ALTER TABLE "afiliado_foto" ADD CONSTRAINT "afiliado_foto_afiliado_id_fkey" FOREIGN KEY ("afiliado_id") REFERENCES "afiliado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "afiliado_foto" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "afiliado_foto" USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual());
