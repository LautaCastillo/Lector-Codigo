import { Inject, Injectable } from '@nestjs/common';
import {
  candidatosInventario,
  normalizarCodigo,
  type BienDetalleDto,
  type BienDto,
  type CambioBienDto,
  type EscaneoDto,
  type EstadoCodigo,
  type ResultadoEscaneoDto,
  type Titularidad,
  type UbicacionDto,
} from '@patrimonio/shared';
import { PrismaService } from '../prisma/prisma.service.js';

export const MAX_RESULTADOS = 30;
/** Tope de bienes esperados por ubicación en un lote. */
export const MAX_ESPERADOS = 1000;
export const LARGO_MINIMO_BUSQUEDA = 2;
const MAX_CAMBIOS = 50;

/** Campos que cambian solos o no aportan al historial de una ficha. */
const CAMPOS_IGNORADOS = new Set(['modificadoEn', 'creadoEn']);

type FilaBien = {
  id: string;
  numeroInventario: string;
  descripcion: string | null;
  estadoCodigo: string;
  estadoBien: string | null;
  ubicacionFisica: string | null;
  areaResponsable: string | null;
  catalogo: string | null;
};

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

  /** Ficha completa. Acepta el número con o sin ceros a la izquierda. */
  async buscarPorInventario(numero: string): Promise<BienDetalleDto | null> {
    const bien = await this.prisma.bien.findFirst({
      where: { numeroInventario: { in: candidatosInventario(numero.trim()) } },
      include: { codigos: true },
    });
    return bien ? aDetalle(bien) : null;
  }

  /** Búsqueda manual por número, número anterior, descripción, catálogo o ubicación. */
  async buscar(texto: string): Promise<BienDto[]> {
    const q = texto.trim();
    if (q.length < LARGO_MINIMO_BUSQUEDA) return [];
    const bienes = await this.prisma.bien.findMany({
      where: {
        OR: [
          { numeroInventario: { in: candidatosInventario(q) } },
          { numeroInventario: { contains: q } },
          { numeroAnterior: { contains: q, mode: 'insensitive' } },
          { descripcion: { contains: q, mode: 'insensitive' } },
          { catalogo: { contains: q, mode: 'insensitive' } },
          { ubicacionFisica: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { numeroInventario: 'asc' },
      take: MAX_RESULTADOS,
    });
    return bienes.map(aDto);
  }

  /** Ubicaciones físicas del catálogo con su cantidad de bienes, para elegir dónde hacer un lote. */
  async ubicaciones(): Promise<UbicacionDto[]> {
    const grupos = await this.prisma.bien.groupBy({
      by: ['ubicacionFisica'],
      where: { ubicacionFisica: { not: null } },
      _count: { _all: true },
      orderBy: { ubicacionFisica: 'asc' },
    });
    return grupos.flatMap((g) => (g.ubicacionFisica ? [{ nombre: g.ubicacionFisica, cantidad: g._count._all }] : []));
  }

  /** Bienes que el catálogo ubica en `nombre`: lo esperado al relevar esa ubicación. */
  async bienesDeUbicacion(nombre: string): Promise<BienDto[]> {
    const bienes = await this.prisma.bien.findMany({
      where: { ubicacionFisica: nombre },
      orderBy: { numeroInventario: 'asc' },
      take: MAX_ESPERADOS,
    });
    return bienes.map(aDto);
  }

  /** Línea de tiempo de una ficha, del cambio más reciente al más antiguo. */
  async historial(numero: string): Promise<CambioBienDto[] | null> {
    const bien = await this.prisma.bien.findFirst({
      where: { numeroInventario: { in: candidatosInventario(numero.trim()) } },
      select: { id: true, creadoEn: true },
    });
    if (!bien) return null;

    const filas = await this.prisma.cambioFila.findMany({
      where: { tabla: 'bien', filaId: bien.id },
      orderBy: { en: 'desc' },
      take: MAX_CAMBIOS,
    });
    const ids = [...new Set(filas.map((f) => f.actorUsuarioId).filter((id): id is string => !!id))];
    const personas = ids.length
      ? await this.prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, cuenta: true, nombre: true } })
      : [];
    const nombres = new Map(personas.map((p) => [p.id, p.nombre ?? p.cuenta]));

    const cambios: CambioBienDto[] = filas.map((f) => ({
      id: f.id,
      operacion: f.operacion as CambioBienDto['operacion'],
      en: f.en.toISOString(),
      actor: f.actorUsuarioId ? (nombres.get(f.actorUsuarioId) ?? null) : null,
      cambios: f.operacion === 'UPDATE' ? diferencias(f.antes, f.despues) : [],
    }));
    // Los bienes cargados antes de que existieran los triggers no tienen registro de alta: se deduce de su fecha de carga.
    if (filas.length < MAX_CAMBIOS && !filas.some((f) => f.operacion === 'INSERT')) {
      cambios.push({ id: `alta-${bien.id}`, operacion: 'INSERT', en: bien.creadoEn.toISOString(), actor: null, cambios: [] });
    }
    return cambios;
  }
}

/** Campos que difieren entre dos versiones de una fila. */
export function diferencias(antes: unknown, despues: unknown): CambioBienDto['cambios'] {
  const a = (antes ?? {}) as Record<string, unknown>;
  const d = (despues ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(d)])]
    .filter((campo) => !CAMPOS_IGNORADOS.has(campo) && JSON.stringify(a[campo]) !== JSON.stringify(d[campo]))
    .map((campo) => ({ campo, antes: a[campo] ?? null, despues: d[campo] ?? null }));
}

/** Resumen de un bien, para reutilizar en otros módulos. */
export const bienADto = (b: FilaBien): BienDto => aDto(b);

function aDto(b: FilaBien): BienDto {
  return {
    id: b.id,
    numeroInventario: b.numeroInventario,
    descripcion: b.descripcion,
    estadoCodigo: b.estadoCodigo as EstadoCodigo,
    estadoBien: b.estadoBien,
    ubicacionFisica: b.ubicacionFisica,
    areaResponsable: b.areaResponsable,
    catalogo: b.catalogo,
  };
}

const soloFecha = (f: Date | null) => (f ? f.toISOString().slice(0, 10) : null);

function aDetalle(
  b: FilaBien & {
    motivoAlta: string | null;
    valorUnitario: { toString(): string } | null;
    fechaIncorporacion: Date | null;
    numeroSerie: string | null;
    numeroAnterior: string | null;
    expediente: string | null;
    responsableUso: string | null;
    cantidad: number | null;
    proveedor: string | null;
    numeroFactura: string | null;
    fechaFactura: Date | null;
    titularidad: string | null;
    creadoEn: Date;
    modificadoEn: Date;
    codigos: { simbologia: string; valor: string }[];
  },
): BienDetalleDto {
  return {
    ...aDto(b),
    motivoAlta: b.motivoAlta,
    valorUnitario: b.valorUnitario === null ? null : Number(b.valorUnitario.toString()),
    fechaIncorporacion: soloFecha(b.fechaIncorporacion),
    numeroSerie: b.numeroSerie,
    numeroAnterior: b.numeroAnterior,
    expediente: b.expediente,
    responsableUso: b.responsableUso,
    cantidad: b.cantidad,
    proveedor: b.proveedor,
    numeroFactura: b.numeroFactura,
    fechaFactura: soloFecha(b.fechaFactura),
    titularidad: b.titularidad as Titularidad | null,
    creadoEn: b.creadoEn.toISOString(),
    modificadoEn: b.modificadoEn.toISOString(),
    codigos: b.codigos.map((c) => ({ simbologia: c.simbologia, valor: c.valor })),
  };
}
