-- Cada exportación deja constancia de cuántas filas tenía y de su huella SHA-256 (plan de mejora, sección 2.2).
ALTER TABLE "exportacion"
  ADD COLUMN "filas" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "hashSha256" TEXT;
