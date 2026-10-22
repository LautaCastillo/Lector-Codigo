-- CreateEnum
CREATE TYPE "Simbologia" AS ENUM ('code39', 'code93', 'code128', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'codabar', 'qr', 'datamatrix', 'pdf417', 'aztec');

-- CreateEnum
CREATE TYPE "EstadoCodigo" AS ENUM ('legible', 'sin_codigo', 'codigo_danado', 'desconocido');

-- CreateEnum
CREATE TYPE "Titularidad" AS ENUM ('propio', 'terceros');

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('administrador', 'relevador');

-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL,
    "cuenta" TEXT NOT NULL,
    "nombre" TEXT,
    "rol" "Rol" NOT NULL DEFAULT 'relevador',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bien" (
    "id" TEXT NOT NULL,
    "numeroInventario" TEXT NOT NULL,
    "estadoCodigo" "EstadoCodigo" NOT NULL DEFAULT 'legible',
    "descripcion" TEXT,
    "cantidad" INTEGER,
    "estadoBien" TEXT,
    "valorUnitario" DECIMAL(14,2),
    "fechaIncorporacion" DATE,
    "proveedor" TEXT,
    "numeroFactura" TEXT,
    "fechaFactura" DATE,
    "responsableUso" TEXT,
    "ubicacionFisica" TEXT,
    "areaResponsable" TEXT,
    "titularidad" "Titularidad",
    "numeroSerie" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bien_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigo_bien" (
    "id" TEXT NOT NULL,
    "bienId" TEXT NOT NULL,
    "simbologia" "Simbologia" NOT NULL,
    "valor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigo_bien_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relevamiento" (
    "id" TEXT NOT NULL,
    "idCliente" TEXT NOT NULL,
    "bienId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "simbologia" "Simbologia",
    "valorLeido" TEXT,
    "estadoDetectado" TEXT,
    "observaciones" TEXT,
    "relevadoEnDispositivo" TIMESTAMP(3) NOT NULL,
    "sincronizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relevamiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_cambio" (
    "id" TEXT NOT NULL,
    "bienId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valorAnterior" TEXT,
    "valorNuevo" TEXT,
    "enDispositivo" TIMESTAMP(3) NOT NULL,
    "enServidor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_cambio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exportacion" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "filtros" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exportacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_cuenta_key" ON "usuario"("cuenta");

-- CreateIndex
CREATE UNIQUE INDEX "bien_numeroInventario_key" ON "bien"("numeroInventario");

-- CreateIndex
CREATE INDEX "bien_descripcion_idx" ON "bien"("descripcion");

-- CreateIndex
CREATE INDEX "codigo_bien_bienId_idx" ON "codigo_bien"("bienId");

-- CreateIndex
CREATE UNIQUE INDEX "codigo_bien_simbologia_valor_key" ON "codigo_bien"("simbologia", "valor");

-- CreateIndex
CREATE UNIQUE INDEX "relevamiento_idCliente_key" ON "relevamiento"("idCliente");

-- CreateIndex
CREATE INDEX "relevamiento_bienId_idx" ON "relevamiento"("bienId");

-- CreateIndex
CREATE INDEX "relevamiento_usuarioId_idx" ON "relevamiento"("usuarioId");

-- CreateIndex
CREATE INDEX "historial_cambio_bienId_idx" ON "historial_cambio"("bienId");

-- AddForeignKey
ALTER TABLE "codigo_bien" ADD CONSTRAINT "codigo_bien_bienId_fkey" FOREIGN KEY ("bienId") REFERENCES "bien"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relevamiento" ADD CONSTRAINT "relevamiento_bienId_fkey" FOREIGN KEY ("bienId") REFERENCES "bien"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relevamiento" ADD CONSTRAINT "relevamiento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_cambio" ADD CONSTRAINT "historial_cambio_bienId_fkey" FOREIGN KEY ("bienId") REFERENCES "bien"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_cambio" ADD CONSTRAINT "historial_cambio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exportacion" ADD CONSTRAINT "exportacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
