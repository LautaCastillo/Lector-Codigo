// Cola de envíos: las lecturas se guardan primero en el teléfono y se mandan al servidor apenas hay red.
// Cada lectura lleva su `idCliente`, así que reenviar nunca duplica. Un fallo de red no pierde nada: queda en la cola.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RelevamientoDto, Simbologia } from '@patrimonio/shared';
import { useMemo, useSyncExternalStore } from 'react';
import { agregarPendiente, marcarRechazos, porEnviarDe, quitarPendientes, rechazadasDe, type Pendiente } from '../funciones/cola/cola';
import { resolverEscaneo } from './catalogo';
import { marcarRed, useSinRed } from './red';
import { subirRelevamientos } from './relevamientos';
import { esFalloDeRed } from './util';

const CLAVE = 'cola-envio';

interface Estado {
  cola: Pendiente[];
  /** Cuenta con la sesión abierta: solo sus lecturas se envían. */
  cuenta: string | null;
  enviando: boolean;
  /** Último error que no fue de red (por ejemplo, falta de permiso). */
  error: string | null;
}

let estado: Estado = { cola: [], cuenta: null, enviando: false, error: null };
const oyentes = new Set<() => void>();
let carga: Promise<void> | null = null;

const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
};

const guardar = () => AsyncStorage.setItem(CLAVE, JSON.stringify(estado.cola)).catch(() => undefined);

function cambiar(parcial: Partial<Estado>) {
  const cambioLaCola = parcial.cola !== undefined && parcial.cola !== estado.cola;
  estado = { ...estado, ...parcial };
  if (cambioLaCola) void guardar();
  oyentes.forEach((f) => f());
}

/** Lee la cola guardada una sola vez; lo que se encoló antes de que termine de leer no se pierde. */
function asegurarCarga() {
  carga ??= AsyncStorage.getItem(CLAVE)
    .then((crudo) => {
      const guardada = crudo ? (JSON.parse(crudo) as Pendiente[]) : [];
      if (!Array.isArray(guardada)) return;
      cambiar({ cola: guardada.reduce(agregarPendiente, estado.cola) });
    })
    .catch(() => undefined);
  return carga;
}

/** Indica la cuenta con sesión abierta (o `null` al cerrarla) y carga la cola guardada. */
export async function fijarCuenta(cuenta: string | null) {
  await asegurarCarga();
  if (estado.cuenta !== cuenta) cambiar({ cuenta, error: null });
}

/**
 * Guarda una lectura en el teléfono. No espera a la red: devuelve cuando quedó anotada. `titulo` es como se la nombra
 * en las listas. Con `porResolver` se la envía como no encontrada o encontrada según lo que diga el catálogo al enviarla.
 */
export async function encolar(relevamiento: RelevamientoDto, titulo: string, porResolver = false) {
  await asegurarCarga();
  if (!estado.cuenta) throw new Error('Iniciá sesión para continuar.');
  cambiar({ cola: agregarPendiente(estado.cola, { idCliente: relevamiento.idCliente, cuenta: estado.cuenta, relevamiento, titulo, ...(porResolver ? { porResolver } : {}) }) });
  await guardar();
}

/** Estado de una lectura encolada: `enviada` si ya no está en la cola, `rechazada` con el motivo, o `esperando`. */
export function estadoDe(idCliente: string): { estado: 'enviada' | 'esperando' } | { estado: 'rechazada'; motivo: string } {
  const p = estado.cola.find((x) => x.idCliente === idCliente);
  if (!p) return { estado: 'enviada' };
  return p.rechazo ? { estado: 'rechazada', motivo: p.rechazo } : { estado: 'esperando' };
}

async function enviarPasada() {
  await asegurarCarga();
  const cuenta = estado.cuenta;
  if (!cuenta || porEnviarDe(estado.cola, cuenta).length === 0) return;
  cambiar({ enviando: true, error: null });
  try {
    // Lo leído sin catálogo se comprueba primero: según el resultado se envía como encontrado o como no encontrado.
    for (const p of porEnviarDe(estado.cola, cuenta).filter((x) => x.porResolver)) {
      const lectura = p.relevamiento;
      const r = await resolverEscaneo(lectura.simbologia as Simbologia, lectura.valorLeido ?? '');
      const resuelto: RelevamientoDto = r.encontrado && r.bien ? { ...lectura, resultado: 'encontrado', numeroInventario: r.bien.numeroInventario } : lectura;
      const titulo = r.encontrado && r.bien ? `${r.bien.numeroInventario} · ${r.bien.descripcion ?? 'Sin descripción'}` : p.titulo;
      cambiar({ cola: estado.cola.map((x) => (x.idCliente === p.idCliente ? { ...x, relevamiento: resuelto, titulo, porResolver: false } : x)) });
    }
    const listos = porEnviarDe(estado.cola, cuenta).filter((x) => !x.porResolver);
    if (listos.length) {
      const res = await subirRelevamientos(listos.map((x) => x.relevamiento));
      const motivos = new Map(res.rechazados.map((x) => [x.idCliente, x.motivo]));
      const enviados = new Set(listos.map((x) => x.idCliente).filter((id) => !motivos.has(id)));
      cambiar({ cola: marcarRechazos(quitarPendientes(estado.cola, enviados), motivos) });
    }
    marcarRed(true);
  } catch (error) {
    if (esFalloDeRed(error)) marcarRed(false);
    else cambiar({ error: error instanceof Error ? error.message : 'No se pudo enviar.' });
  }
  cambiar({ enviando: false });
}

let cadena: Promise<void> = Promise.resolve();

/**
 * Envía lo que haya en la cola. Los envíos se hacen de a uno, en orden: lo que se encola mientras otro envío está en curso
 * entra en el siguiente. Nunca lanza: lo que no se pudo enviar sigue en la cola.
 */
export function enviarPendientes(): Promise<void> {
  const pasada = cadena.then(enviarPasada, enviarPasada);
  cadena = pasada;
  return pasada;
}

/** Saca de la cola las lecturas indicadas (por ejemplo, las rechazadas) sin enviarlas. */
export const descartar = (ids: string[]) => cambiar({ cola: quitarPendientes(estado.cola, new Set(ids)) });

/** La cola de la cuenta con sesión abierta, para mostrarla y reaccionar a sus cambios. */
export function useCola() {
  const e = useSyncExternalStore(suscribir, () => estado);
  const sinRed = useSinRed();
  const pendientes = useMemo(() => porEnviarDe(e.cola, e.cuenta), [e.cola, e.cuenta]);
  const rechazadas = useMemo(() => rechazadasDe(e.cola, e.cuenta), [e.cola, e.cuenta]);
  return { pendientes, rechazadas, enviando: e.enviando, error: e.error, sinRed };
}
