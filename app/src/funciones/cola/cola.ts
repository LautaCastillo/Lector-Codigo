import { candidatosInventario, normalizarCodigo, type RelevamientoDto, type Simbologia } from '@patrimonio/shared';
import type { FilaAvance } from '../../datos/jornadas';

/**
 * Cola de envíos: las lecturas que se hicieron en este teléfono y todavía no llegaron al servidor. Todo esto es lógica
 * pura (sin red ni pantalla) para poder probarla; el guardado y el envío están en `datos/cola-envio.ts`.
 */
export interface Pendiente {
  /** Es el `idCliente` del relevamiento: reenviar no duplica. */
  idCliente: string;
  /** Cuenta (id de Supabase Auth) que hizo la lectura: solo esa cuenta la envía. */
  cuenta: string;
  relevamiento: RelevamientoDto;
  /** Cómo se la nombra en las listas: el número y la descripción, o el código leído. */
  titulo: string;
  /** Se leyó sin poder consultar el catálogo: al enviar se resuelve primero si el código existe. */
  porResolver?: boolean;
  /** El servidor la rechazó (por ejemplo, la jornada ya estaba cerrada): no se reintenta, se muestra para descartarla. */
  rechazo?: string;
}

export const agregarPendiente = (cola: Pendiente[], nuevo: Pendiente): Pendiente[] =>
  cola.some((p) => p.idCliente === nuevo.idCliente) ? cola : [...cola, nuevo];

export const quitarPendientes = (cola: Pendiente[], ids: ReadonlySet<string>): Pendiente[] => cola.filter((p) => !ids.has(p.idCliente));

/** Anota el motivo del rechazo de cada lectura indicada; el resto queda igual. */
export const marcarRechazos = (cola: Pendiente[], motivos: ReadonlyMap<string, string>): Pendiente[] =>
  cola.map((p) => (motivos.has(p.idCliente) ? { ...p, rechazo: motivos.get(p.idCliente) } : p));

/** Lo que espera envío (sin las rechazadas) de una cuenta. */
export const porEnviarDe = (cola: Pendiente[], cuenta: string | null): Pendiente[] => cola.filter((p) => p.cuenta === cuenta && !p.rechazo);

export const rechazadasDe = (cola: Pendiente[], cuenta: string | null): Pendiente[] => cola.filter((p) => p.cuenta === cuenta && !!p.rechazo);

/** Busca una lectura entre los bienes esperados de una jornada, sin red. Acepta el número con otro relleno de ceros. */
export function buscarEnFilas(filas: FilaAvance[], simbologia: Simbologia, valor: string): FilaAvance | undefined {
  const candidatos = candidatosInventario(normalizarCodigo(simbologia, valor));
  return filas.find((f) => f.tipo === 'esperado' && f.numeroInventario !== null && candidatos.includes(f.numeroInventario));
}

/**
 * Suma al avance de una jornada lo que se leyó acá y todavía no llegó al servidor, para que la persona vea su trabajo
 * aunque no tenga señal. Un bien que otra persona ya había relevado no se pisa: la lectura propia queda anotada al enviarse.
 */
export function aplicarPendientes(filas: FilaAvance[], pendientes: Pendiente[], jornadaId: string, yo: string): FilaAvance[] {
  const resultado = filas.map((f) => ({ ...f }));
  for (const p of pendientes) {
    const r = p.relevamiento;
    if (p.rechazo || r.jornadaId !== jornadaId) continue;
    const esperada =
      r.resultado === 'encontrado' && !p.porResolver
        ? resultado.find((f) => f.tipo === 'esperado' && f.numeroInventario === r.numeroInventario)
        : undefined;
    if (esperada) {
      if (esperada.encontrado) continue;
      esperada.encontrado = true;
      esperada.resultado = 'encontrado';
      esperada.relevador = yo;
      esperada.relevadoEn = r.relevadoEnDispositivo;
      esperada.ubicacionObservada = r.ubicacionObservada ?? null;
      esperada.fueraDeLugar = !!r.ubicacionObservada && !!esperada.ubicacionFisica && r.ubicacionObservada !== esperada.ubicacionFisica;
      esperada.lecturas = 1;
      esperada.vecesSinEncontrar = 0;
      esperada.sinEnviar = true;
      continue;
    }
    resultado.push({
      tipo: 'extra',
      relevamientoId: null,
      bienId: null,
      numeroInventario: r.numeroInventario ?? null,
      descripcion: p.titulo,
      ubicacionFisica: null,
      areaResponsable: null,
      responsableUso: null,
      estadoBien: null,
      encontrado: true,
      resultado: r.resultado,
      ubicacionObservada: r.ubicacionObservada ?? null,
      relevador: yo,
      relevadoEn: r.relevadoEnDispositivo,
      fueraDeLugar: false,
      lecturas: 1,
      tambienVieron: [],
      discrepancia: false,
      codigoProvisorio: null,
      resuelta: false,
      notaResolucion: null,
      situacion: null,
      motivoSituacion: null,
      vecesSinEncontrar: 0,
      sinEnviar: true,
    });
  }
  return resultado;
}
