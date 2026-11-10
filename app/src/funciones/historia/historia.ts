import type { CambioBienDto, RelevamientoRegistradoDto } from '@patrimonio/shared';
import { ETIQUETA_CAMPO, ETIQUETA_SITUACION, valorLegible } from '../../compartido/formato';
import type { Comentario } from '../../datos/comentarios';
import type { SituacionDeBien } from '../../datos/situaciones';

/**
 * La historia de un bien: una sola línea de tiempo con lo que se supo de él desde distintos lados (lecturas en campo, cambios en el
 * catálogo, situación administrativa y comentarios). Es lógica pura (sin red ni pantalla) para poder probarla.
 */
export type TipoEvento = 'lectura' | 'catalogo' | 'situacion' | 'comentario';

export interface EventoHistoria {
  clave: string;
  tipo: TipoEvento;
  /** ISO 8601. */
  en: string;
  titulo: string;
  detalle: string[];
  /** Lo que conviene mirar: un cambio de lugar, una situación declarada. */
  alerta?: boolean;
  /** Id del relevamiento, para abrirlo (solo lo puede ver su dueño). */
  relevamientoId?: string;
  propio?: boolean;
}

export interface FuentesHistoria {
  lecturas: RelevamientoRegistradoDto[];
  cambios: CambioBienDto[];
  situaciones: SituacionDeBien[];
  comentarios: Comentario[];
}

function lecturas(rs: RelevamientoRegistradoDto[]): EventoHistoria[] {
  // De la más vieja a la más nueva, para comparar cada lectura con la anterior (dónde estaba y en qué estado).
  const ordenadas = [...rs].sort((a, b) => a.relevadoEnDispositivo.localeCompare(b.relevadoEnDispositivo));
  let lugarAnterior: string | null = null;
  let estadoAnterior: string | null = null;
  return ordenadas.map((r) => {
    const detalle: string[] = [];
    let alerta = false;
    if (r.ubicacionObservada) {
      detalle.push(`Ubicación: ${r.ubicacionObservada}`);
      if (lugarAnterior && lugarAnterior !== r.ubicacionObservada) {
        detalle.push(`Cambió de lugar: ${lugarAnterior} → ${r.ubicacionObservada}`);
        alerta = true;
      }
      lugarAnterior = r.ubicacionObservada;
    }
    if (r.estadoDetectado) {
      detalle.push(`Estado declarado: ${r.estadoDetectado}`);
      if (estadoAnterior && estadoAnterior !== r.estadoDetectado) detalle.push(`Cambió el estado: ${estadoAnterior} → ${r.estadoDetectado}`);
      estadoAnterior = r.estadoDetectado;
    }
    if (r.observaciones) detalle.push(`“${r.observaciones}”`);
    return {
      clave: `lectura-${r.id}`,
      tipo: 'lectura' as const,
      en: r.relevadoEnDispositivo,
      titulo: r.resultado === 'hallazgo' ? `Hallazgo vinculado a este bien, por ${r.propio ? 'vos' : r.relevador}` : `Relevado por ${r.propio ? 'vos' : r.relevador}`,
      detalle,
      alerta,
      relevamientoId: r.id,
      propio: r.propio,
    };
  });
}

function catalogo(cambios: CambioBienDto[]): EventoHistoria[] {
  return (
    cambios
      // Un "cambio" sin ningún campo distinto (una actualización que no tocó nada) no aporta a la historia.
      .filter((c) => c.operacion !== 'UPDATE' || c.cambios.length > 0)
      .map((c) => ({
        clave: `catalogo-${c.id}`,
        tipo: 'catalogo' as const,
        en: c.en,
        titulo: c.operacion === 'INSERT' ? 'Alta en el catálogo' : c.operacion === 'DELETE' ? 'Eliminado del catálogo' : 'Datos del catálogo modificados',
        detalle: [
          `Por ${c.actor ?? (c.operacion === 'INSERT' ? 'importación de SIU' : 'un cambio fuera de la app')}`,
          ...(c.operacion === 'UPDATE' ? c.cambios.map((x) => `${ETIQUETA_CAMPO[x.campo] ?? x.campo}: ${valorLegible(x.campo, x.antes)} → ${valorLegible(x.campo, x.despues)}`) : []),
        ],
      }))
  );
}

function situaciones(ss: SituacionDeBien[]): EventoHistoria[] {
  return ss.flatMap((s) => [
    {
      clave: `situacion-${s.id}-declarada`,
      tipo: 'situacion' as const,
      en: s.declaradaEn,
      titulo: `Situación declarada: ${ETIQUETA_SITUACION[s.situacion] ?? s.situacion}`,
      detalle: [s.motivo, `Por ${s.declaradaPor}`],
      alerta: true,
    },
    ...(s.levantadaEn
      ? [
          {
            clave: `situacion-${s.id}-levantada`,
            tipo: 'situacion' as const,
            en: s.levantadaEn,
            titulo: `Situación levantada: ${ETIQUETA_SITUACION[s.situacion] ?? s.situacion}`,
            detalle: [...(s.motivoLevantada ? [s.motivoLevantada] : []), `Por ${s.levantadaPor ?? 'un administrador'}`],
          },
        ]
      : []),
  ]);
}

function comentarios(cs: Comentario[]): EventoHistoria[] {
  return cs.map((c) => ({
    clave: `comentario-${c.id}`,
    tipo: 'comentario' as const,
    en: c.creadoEn,
    titulo: `Comentario de ${c.propio ? 'vos' : c.autor}`,
    detalle: [c.texto],
  }));
}

/** Junta todo en una sola línea de tiempo, del hecho más nuevo al más viejo. */
export function armarHistoria(f: FuentesHistoria): EventoHistoria[] {
  return [...lecturas(f.lecturas), ...catalogo(f.cambios), ...situaciones(f.situaciones), ...comentarios(f.comentarios)].sort((a, b) => b.en.localeCompare(a.en) || a.clave.localeCompare(b.clave));
}

/** Los hechos de un tipo (o todos si no se indica). */
export const filtrarHistoria = (eventos: EventoHistoria[], tipo: TipoEvento | null): EventoHistoria[] => (tipo ? eventos.filter((e) => e.tipo === tipo) : eventos);
