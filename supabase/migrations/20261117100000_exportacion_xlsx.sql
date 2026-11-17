-- Las exportaciones pueden ser también un libro de Excel (.xlsx): la constancia admite ese formato.
ALTER TABLE public."exportacion" DROP CONSTRAINT IF EXISTS "exportacion_valida";
ALTER TABLE public."exportacion" ADD CONSTRAINT "exportacion_valida" CHECK (
  "formato" IN ('csv', 'xlsx', 'pdf')
  AND "filas" >= 0
  AND ("hashSha256" IS NULL OR "hashSha256" ~ '^[0-9a-f]{64}$')
);
