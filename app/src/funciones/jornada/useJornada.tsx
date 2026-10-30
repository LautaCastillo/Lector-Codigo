// Los datos de una jornada para su pantalla: la jornada, el avance de todo el equipo (que se vuelve a pedir en vivo cada vez que
// alguien relevó algo) y las listas ya separadas en pendientes, encontrados y fuera de lo esperado.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { mensajeDeError } from '../../compartido/formato';
import { useTema } from '../../compartido/tema';
import { avanceDeJornada, obtenerJornada, suscribirseAJornada, type FilaAvance, type Jornada } from '../../datos/jornadas';

const masReciente = (a: FilaAvance, b: FilaAvance) => (b.relevadoEn ?? '').localeCompare(a.relevadoEn ?? '');

export function useJornada(id: string) {
  const { c } = useTema();
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [filas, setFilas] = useState<FilaAvance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  // La cámara y el aviso de lectura necesitan el avance más reciente sin volver a crear sus funciones en cada cambio.
  const filasRef = useRef<FilaAvance[] | null>(null);
  filasRef.current = filas;

  /** Vuelve a pedir la jornada y su avance. Devuelve el avance nuevo, o `null` si falló. */
  const cargar = useCallback(async () => {
    try {
      const [j, a] = await Promise.all([obtenerJornada(id), avanceDeJornada(id)]);
      if (!j) throw new Error('La jornada no existe.');
      setJornada(j);
      setFilas(a);
      setError(null);
      return a;
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cargar la jornada.'));
      return null;
    }
  }, [id]);

  // Carga inicial y actualización en vivo: cada relevamiento o cambio de jornada de cualquier persona vuelve a pedir el avance.
  useEffect(() => {
    void cargar();
    return suscribirseAJornada(() => void cargar());
  }, [cargar]);

  const esperadas = useMemo(() => (filas ?? []).filter((f) => f.tipo === 'esperado'), [filas]);
  const pendientes = useMemo(() => esperadas.filter((f) => !f.encontrado), [esperadas]);
  const encontradas = useMemo(() => esperadas.filter((f) => f.encontrado).sort(masReciente), [esperadas]);
  const otros = useMemo(() => (filas ?? []).filter((f) => f.tipo === 'extra').sort(masReciente), [filas]);
  const ubicaciones = useMemo(() => [...new Set(esperadas.map((f) => f.ubicacionFisica).filter((u): u is string => !!u))].sort(), [esperadas]);
  const porcentaje = esperadas.length > 0 ? Math.round((encontradas.length / esperadas.length) * 100) : 0;

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

  return { jornada, filas, filasRef, error, cargar, controlRecarga, esperadas, pendientes, encontradas, otros, ubicaciones, porcentaje };
}
