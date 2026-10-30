-- CreateEnum
CREATE TYPE "EstadoCuenta" AS ENUM ('pendiente', 'activa', 'rechazada', 'suspendida', 'baja');

-- AlterTable
ALTER TABLE "usuario"
  ADD COLUMN "estado" "EstadoCuenta" NOT NULL DEFAULT 'pendiente',
  ADD COLUMN "aprobadoPor" TEXT,
  ADD COLUMN "aprobadoEn" TIMESTAMP(3),
  ADD COLUMN "motivoEstado" TEXT,
  ADD COLUMN "ultimoAccesoEn" TIMESTAMP(3);

-- Conserva lo existente: las cuentas activas siguen activas y las inactivas quedan suspendidas.
UPDATE "usuario" SET "estado" = CASE WHEN "activo" THEN 'activa'::"EstadoCuenta" ELSE 'suspendida'::"EstadoCuenta" END;

ALTER TABLE "usuario" DROP COLUMN "activo";

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_aprobadoPor_fkey" FOREIGN KEY ("aprobadoPor") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
