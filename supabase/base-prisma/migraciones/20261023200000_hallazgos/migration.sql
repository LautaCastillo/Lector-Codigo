-- Hallazgos: algo visto en campo que no se pudo asociar a un bien del catálogo (plan de mejora, sección 4.2).
ALTER TYPE "ResultadoRelevamiento" ADD VALUE 'hallazgo';

CREATE TYPE "ClaseHallazgo" AS ENUM ('no_identificado', 'nuevo');

ALTER TABLE "relevamiento"
  ADD COLUMN "clase" "ClaseHallazgo",
  ADD COLUMN "descripcion" TEXT,
  ADD COLUMN "numeroSerie" TEXT,
  ADD COLUMN "codigoProvisorio" TEXT;

CREATE UNIQUE INDEX "relevamiento_codigoProvisorio_key" ON "relevamiento"("codigoProvisorio");

-- Una foto por hallazgo, guardada en la base.
CREATE TABLE "foto_relevamiento" (
    "id" TEXT NOT NULL,
    "relevamientoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "contenido" BYTEA NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foto_relevamiento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "foto_relevamiento_relevamientoId_key" ON "foto_relevamiento"("relevamientoId");

ALTER TABLE "foto_relevamiento" ADD CONSTRAINT "foto_relevamiento_relevamientoId_fkey" FOREIGN KEY ("relevamientoId") REFERENCES "relevamiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bloquea la API pública de Supabase, igual que el resto de las tablas.
ALTER TABLE "foto_relevamiento" ENABLE ROW LEVEL SECURITY;
