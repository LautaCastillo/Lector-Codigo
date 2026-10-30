-- Auditoría append-only (plan de mejora, sección 2).
--  * evento_auditoria: la escribe la aplicación, en la misma transacción que el cambio de negocio.
--  * cambio_fila: la llenan triggers ante cualquier INSERT, UPDATE o DELETE de las tablas de negocio.
-- Ninguna de las dos admite UPDATE, DELETE ni TRUNCATE: las correcciones son eventos nuevos.

-- CreateTable
CREATE TABLE "evento_auditoria" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "actorUsuarioId" TEXT,
    "actorRol" "Rol",
    "sesionId" TEXT,
    "dispositivoId" TEXT,
    "entidadTipo" TEXT,
    "entidadId" TEXT,
    "operacionClienteId" TEXT,
    "horaDispositivo" TIMESTAMPTZ(3),
    "tzDispositivo" INTEGER,
    "horaServidor" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desfaseEstimadoMs" INTEGER,
    "secuenciaDispositivo" INTEGER,
    "resultado" TEXT NOT NULL DEFAULT 'ok',
    "motivo" TEXT,
    "datos" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "versionApp" TEXT,

    CONSTRAINT "evento_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambio_fila" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tabla" TEXT NOT NULL,
    "operacion" TEXT NOT NULL,
    "filaId" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "actorUsuarioId" TEXT,
    "en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambio_fila_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_auditoria_tipo_horaServidor_idx" ON "evento_auditoria"("tipo", "horaServidor");
CREATE INDEX "evento_auditoria_actorUsuarioId_horaServidor_idx" ON "evento_auditoria"("actorUsuarioId", "horaServidor");
CREATE INDEX "evento_auditoria_entidadTipo_entidadId_idx" ON "evento_auditoria"("entidadTipo", "entidadId");
CREATE INDEX "cambio_fila_tabla_filaId_idx" ON "cambio_fila"("tabla", "filaId");
CREATE INDEX "cambio_fila_en_idx" ON "cambio_fila"("en");

-- AddForeignKey
ALTER TABLE "evento_auditoria" ADD CONSTRAINT "evento_auditoria_actorUsuarioId_fkey" FOREIGN KEY ("actorUsuarioId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bloquea la API pública de Supabase, igual que el resto de las tablas.
ALTER TABLE "evento_auditoria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cambio_fila" ENABLE ROW LEVEL SECURITY;

-- Inmutabilidad: segunda barrera, además de limitar los privilegios del rol de la aplicación.
CREATE FUNCTION bloquear_modificacion_auditoria() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo agregado: no admite % (registrar un evento nuevo)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER evento_auditoria_inmutable
  BEFORE UPDATE OR DELETE ON "evento_auditoria"
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_auditoria();
CREATE TRIGGER evento_auditoria_sin_truncate
  BEFORE TRUNCATE ON "evento_auditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_auditoria();
CREATE TRIGGER cambio_fila_inmutable
  BEFORE UPDATE OR DELETE ON "cambio_fila"
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_auditoria();
CREATE TRIGGER cambio_fila_sin_truncate
  BEFORE TRUNCATE ON "cambio_fila"
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_auditoria();

-- Registro de cambios por fila. El actor viene de `app.usuario_id`, que el backend fija con
-- set_config(..., true) al inicio de cada transacción; sin él (importador, psql) queda en NULL.
CREATE FUNCTION registrar_cambio_fila() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  fila jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
BEGIN
  INSERT INTO public."cambio_fila" ("tabla", "operacion", "filaId", "antes", "despues", "actorUsuarioId")
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    fila ->> 'id',
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    NULLIF(current_setting('app.usuario_id', true), '')
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER usuario_auditar
  AFTER INSERT OR DELETE ON "usuario"
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio_fila();
-- El último acceso se actualiza cada pocos minutos: no es un cambio que valga la pena registrar.
CREATE TRIGGER usuario_auditar_cambios
  AFTER UPDATE ON "usuario"
  FOR EACH ROW
  WHEN ((to_jsonb(OLD) - 'ultimoAccesoEn') IS DISTINCT FROM (to_jsonb(NEW) - 'ultimoAccesoEn'))
  EXECUTE FUNCTION registrar_cambio_fila();

CREATE TRIGGER bien_auditar
  AFTER INSERT OR UPDATE OR DELETE ON "bien"
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio_fila();
CREATE TRIGGER codigo_bien_auditar
  AFTER INSERT OR UPDATE OR DELETE ON "codigo_bien"
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio_fila();
CREATE TRIGGER relevamiento_auditar
  AFTER INSERT OR UPDATE OR DELETE ON "relevamiento"
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio_fila();
