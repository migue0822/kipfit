-- Segunda barrera entre empresas: Row Level Security (RLS).
-- En las peticiones con empresa, la API cambia la conexión al rol kip_app y pone app.empresa_id
-- (apps/api/src/prisma/contexto-bd.ts). Ese rol solo ve y escribe filas de esa empresa.
-- El rol dueño de las tablas (el de DATABASE_URL) no queda limitado: lo usan las migraciones,
-- el ingreso, el registro de empresas y los procesos de fondo.

-- Rol de la aplicación (es de todo el servidor de PostgreSQL: puede existir ya por otra base).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kip_app') THEN
    CREATE ROLE kip_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

-- El usuario de la conexión debe poder cambiarse a kip_app (SET ROLE).
DO $$
BEGIN
  IF NOT pg_has_role(current_user, 'kip_app', 'MEMBER') THEN
    EXECUTE format('GRANT kip_app TO %I', current_user);
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO kip_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kip_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO kip_app;
-- Las tablas que creen migraciones futuras quedan con los mismos permisos.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kip_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO kip_app;

-- Empresa de la conexión (null si no hay: entonces kip_app no ve nada).
CREATE FUNCTION empresa_actual() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.empresa_id', true), '')::uuid $$;

-- Una política por tabla con empresa_id. `sesion` queda por fuera: es del usuario, no de la empresa
-- (empresa_id es solo la seleccionada), y se lee antes de saber la empresa.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb USING (table_schema, table_name)
    WHERE c.table_schema = 'public' AND c.column_name = 'empresa_id'
      AND tb.table_type = 'BASE TABLE' AND c.table_name <> 'sesion'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY aislamiento_empresa ON %I USING (empresa_id = empresa_actual()) WITH CHECK (empresa_id = empresa_actual())',
      t
    );
  END LOOP;
END $$;

ALTER TABLE empresa ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON empresa
  USING (id = empresa_actual()) WITH CHECK (id = empresa_actual());

-- Única consulta legítima a otras empresas desde una petición con empresa: si un usuario también
-- entra a otra (para no dejar que un administrador le cambie la contraseña). Corre con los permisos
-- del dueño y solo responde sí o no.
CREATE FUNCTION usuario_en_otras_empresas(p_usuario uuid, p_empresa uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM membresia WHERE usuario_id = p_usuario AND empresa_id <> p_empresa) $$;
REVOKE ALL ON FUNCTION usuario_en_otras_empresas(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION usuario_en_otras_empresas(uuid, uuid) TO kip_app;
