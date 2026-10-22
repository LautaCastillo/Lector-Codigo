import { Inject, Injectable } from '@nestjs/common';
import {
  candidatosInventario,
  normalizarCodigo,
  type EscaneoDto,
  type EstadoCodigo,
  type ResultadoEscaneoDto,
} from '@patrimonio/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BienesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Resuelve un escaneo: primero por (simbologia, valor) en codigo_bien, luego por número de inventario. */
  async resolverEscaneo(escaneo: EscaneoDto): Promise<ResultadoEscaneoDto> {
    const valor = normalizarCodigo(escaneo.simbologia, escaneo.valor);

    const porCodigo = await this.prisma.codigoBien.findUnique({
      where: { simbologia_valor: { simbologia: escaneo.simbologia, valor } },
      include: { bien: true },
    });
    if (porCodigo) return { encontrado: true, via: 'codigo', bien: aDto(porCodigo.bien) };

    const porInventario = await this.prisma.bien.findFirst({
      where: { numeroInventario: { in: candidatosInventario(valor) } },
    });
    if (porInventario) return { encontrado: true, via: 'inventario', bien: aDto(porInventario) };

    return { encontrado: false };
  }

  async buscarPorInventario(numero: string) {
    return this.prisma.bien.findUnique({
      where: { numeroInventario: numero },
      include: { codigos: true },
    });
  }
}

function aDto(b: { id: string; numeroInventario: string; descripcion: string | null; estadoCodigo: string }) {
  return {
    id: b.id,
    numeroInventario: b.numeroInventario,
    descripcion: b.descripcion,
    estadoCodigo: b.estadoCodigo as EstadoCodigo,
  };
}
