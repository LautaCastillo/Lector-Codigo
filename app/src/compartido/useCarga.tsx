// Hook para pantallas que piden una lista o un dato al abrirse: guarda el resultado, el error y el estado de "deslizar para
// recargar", así cada pantalla no repite ese manejo. Se muestra con `EstadoCarga` (components/ui.tsx).
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type DependencyList, type ReactElement } from 'react';
import { RefreshControl } from 'react-native';
import { mensajeDeError } from './formato';
import { useTema } from './tema';

interface Opciones {
  /** Vuelve a pedir los datos cada vez que la pantalla recupera el foco (al volver de otra). Por defecto, solo al abrirse. */
  alEnfocar?: boolean;
  /** Si cambian las dependencias, deja a la vista lo anterior hasta que llegue lo nuevo (por defecto se vacía y muestra el spinner). */
  conservar?: boolean;
}

export interface Carga<T> {
  /** Lo último que llegó; `null` mientras se pide o si falló. */
  datos: T | null;
  setDatos: (datos: T | null) => void;
  error: string | null;
  /** Vuelve a pedir los datos (también es lo que hace el botón "Reintentar"). */
  cargar: () => Promise<void>;
  /** Para pasar a `refreshControl` de un `ScrollView` o `FlatList`. */
  controlRecarga: ReactElement;
}

/**
 * `pedir` trae los datos; se vuelve a llamar cuando cambia algo de `dependencias`. `mensaje` se usa si el error no trae texto.
 * Ejemplo: `const { datos, error, cargar, controlRecarga } = useCarga(() => listarAreas(), [], 'No se pudo cargar la lista.')`.
 */
export function useCarga<T>(pedir: () => Promise<T>, dependencias: DependencyList, mensaje: string, opciones: Opciones = {}): Carga<T> {
  const { alEnfocar = false, conservar = false } = opciones;
  const { c } = useTema();
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  // Siempre se llama a la versión más reciente de `pedir`, sin obligar a cada pantalla a memorizarla.
  const pedirRef = useRef(pedir);
  pedirRef.current = pedir;

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setDatos(await pedirRef.current());
    } catch (err) {
      setDatos(null);
      setError(mensajeDeError(err, mensaje));
    }
  }, [mensaje]);

  // Al abrirse y cuando cambian las dependencias.
  useEffect(() => {
    if (alEnfocar) return;
    if (!conservar) setDatos(null);
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar, alEnfocar, ...dependencias]);

  // Al recuperar el foco (solo si `alEnfocar`).
  useFocusEffect(
    useCallback(() => {
      if (alEnfocar) void cargar();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [alEnfocar, cargar, ...dependencias]),
  );

  const controlRecarga = (
    <RefreshControl
      refreshing={actualizando}
      onRefresh={async () => {
        setActualizando(true);
        await cargar();
        setActualizando(false);
      }}
      tintColor={c.accion}
    />
  );

  return { datos, setDatos, error, cargar, controlRecarga };
}
