import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { BienSiu } from './siu-excel.js';

// Cada upsert viaja a la base remota: lotes chicos y un plazo holgado evitan vencer la transacción.
const LOTE = 50;
const PLAZO_MS = 60_000;

@Injectable()
export class CatalogoService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Crea los bienes nuevos y actualiza los existentes (por número de inventario). Idempotente. */
  async importar(bienes: BienSiu[]) {
    const existentes = new Set(
      (
        await this.prisma.bien.findMany({
          where: { numeroInventario: { in: bienes.map((b) => b.numeroInventario) } },
          select: { numeroInventario: true },
        })
      ).map((b) => b.numeroInventario),
    );
    for (let i = 0; i < bienes.length; i += LOTE) {
      await this.prisma.$transaction(
        bienes.slice(i, i + LOTE).map((b) =>
          this.prisma.bien.upsert({
            where: { numeroInventario: b.numeroInventario },
            create: b,
            update: b,
          }),
        ),
        { timeout: PLAZO_MS },
      );
    }
    const actualizados = bienes.filter((b) => existentes.has(b.numeroInventario)).length;
    return { creados: bienes.length - actualizados, actualizados };
  }
}
