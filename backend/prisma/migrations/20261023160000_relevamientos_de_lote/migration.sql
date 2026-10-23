-- CreateEnum
CREATE TYPE "ResultadoRelevamiento" AS ENUM ('encontrado', 'no_encontrado', 'sin_verificar');

-- AlterTable: la tabla todavía no tiene filas; el valor por defecto solo permite agregar la columna obligatoria.
ALTER TABLE "relevamiento"
  ADD COLUMN "resultado" "ResultadoRelevamiento" NOT NULL DEFAULT 'sin_verificar',
  ADD COLUMN "ubicacionObservada" TEXT,
  ADD COLUMN "loteId" TEXT;
ALTER TABLE "relevamiento" ALTER COLUMN "resultado" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "relevamiento_usuarioId_relevadoEnDispositivo_idx" ON "relevamiento"("usuarioId", "relevadoEnDispositivo");
CREATE INDEX "relevamiento_loteId_idx" ON "relevamiento"("loteId");
