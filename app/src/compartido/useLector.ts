// Lo que comparten las pantallas con cámara (escanear, lote y jornada): las simbologías que lee la cámara y la guardia que decide
// qué lecturas procesar, porque la cámara emite varias por segundo de la misma etiqueta.
import { esSimbologia, SIMBOLOGIAS_POR_DEFECTO, type Simbologia } from '@patrimonio/shared';
import { useCallback, useRef } from 'react';

const SIMBOLOGIAS: Simbologia[] = [...SIMBOLOGIAS_POR_DEFECTO];

interface Opciones {
  /** Cuánto se ignora la misma etiqueta después de leerla. */
  ventanaMs?: number;
  /** Si es `true`, la ventana se renueva cada vez que la etiqueta sigue a la vista: solo cuenta de nuevo al alejarla y volver. */
  extender?: boolean;
}

export function useLector({ ventanaMs = 0, extender = false }: Opciones = {}) {
  const ocupado = useRef(false);
  const ultima = useRef({ clave: '', hasta: 0 });

  /**
   * Decide si esta lectura se procesa. Devuelve la simbología si hay que procesarla (y deja la guardia ocupada hasta `liberar`),
   * o `null` si hay que ignorarla: no es una simbología conocida, ya se está procesando otra o es la misma etiqueta de hace un momento.
   */
  const tomar = useCallback(
    (tipo: string, valor: string): Simbologia | null => {
      if (!esSimbologia(tipo)) return null;
      const clave = `${tipo}:${valor}`;
      const ahora = Date.now();
      const repetida = clave === ultima.current.clave && ahora < ultima.current.hasta;
      if (extender) ultima.current = { clave, hasta: ahora + ventanaMs };
      if (ocupado.current || repetida) return null;
      if (!extender) ultima.current = { clave, hasta: ahora + ventanaMs };
      ocupado.current = true;
      return tipo;
    },
    [extender, ventanaMs],
  );

  /** Vuelve a aceptar lecturas; con `ignorarMs` la etiqueta que acaba de leerse se ignora ese tiempo más (la cámara sigue viéndola). */
  const liberar = useCallback((ignorarMs = 0) => {
    ocupado.current = false;
    if (ignorarMs > 0) ultima.current.hasta = Date.now() + ignorarMs;
  }, []);

  return { simbologias: SIMBOLOGIAS, tomar, liberar };
}
