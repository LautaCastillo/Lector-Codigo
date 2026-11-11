// Los datos de una jornada para su pantalla: la jornada, el avance de todo el equipo (que se vuelve a pedir en vivo cada vez que
// alguien relevó algo) y las listas ya separadas en pendientes, encontrados y fuera de lo esperado.
// Sin conexión muestra la última copia del avance, con las lecturas de este teléfono que todavía no se enviaron.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { mensajeDeError } from '../../compartido/formato';
import { useTema } from '../../compartido/tema';
import { useCola } from '../../datos/cola-envio';
import { avanceDeJornada, obtenerJornada, sectoresDeJornada, suscribirseAJornada, type FilaAvance, type Jornada, type SectorTomado } from '../../datos/jornadas';
import { useSesion } from '../../sesion/sesion';
import { aplicarPendientes } from '../cola/cola';

const masReciente = (a: FilaAvance, b: FilaAvance) => (b.relevadoEn ?? '').localeCompare(a.relevadoEn ?? '');

export function useJornada(id: string) {
  const { c } = useTema();
  const { perfil } = useSesion();
  const { pendientes: sinEnviar, sinRed } = useCola();
  const yo = perfil?.nombre ?? perfil?.cuenta ?? '';
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [delServidor, setFilas] = useState<FilaAvance[] | null>(null);
  const [sectores, setSectores] = useState<SectorTomado[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const filas = useMemo(() => (delServidor ? aplicarPendientes(delServidor, sinEnviar, id, yo) : null), [delServidor, sinEnviar, id, yo]);
  // La cámara y el aviso de lectura necesitan el avance más reciente sin volver a crear sus funciones en cada cambio.
  const filasRef = useRef<FilaAvance[] | null>(null);
  filasRef.current = filas;

  /** Vuelve a pedir la jornada y su avance. Devuelve el avance nuevo, o `null` si falló. */
  const cargar = useCallback(async () => {
    try {
      // Los sectores son un complemento: si no se pueden leer, la jornada se muestra igual.
      const [j, a, s] = await Promise.all([obtenerJornada(id), avanceDeJornada(id), sectoresDeJornada(id).catch(() => null)]);
      if (!j) throw new Error('La jornada no existe.');
      setJornada(j);
      setFilas(a);
      if (s) setSectores(s);
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

  // Al volver la red, o cuando se envía lo que estaba en la cola, se pide el avance real.
  const antes = useRef({ sinRed, cantidad: sinEnviar.length });
  useEffect(() => {
    const previo = antes.current;
    antes.current = { sinRed, cantidad: sinEnviar.length };
    if ((previo.sinRed && !sinRed) || sinEnviar.length < previo.cantidad) void cargar();
  }, [sinRed, sinEnviar.length, cargar]);

  const esperadas = useMemo(() => (filas ?? []).filter((f) => f.tipo === 'esperado'), [filas]);
  // Un bien con situación (en reparación, para baja, prestado) que no se encontró queda "apartado": no es un pendiente ni cuenta como esperado.
  // Los que ya faltaron en más jornadas seguidas van primero.
  const repiten = (f: FilaAvance) => f.vecesSinEncontrar ?? 0;
  const pendientes = useMemo(
    () => esperadas.filter((f) => !f.encontrado && !f.situacion).sort((a, b) => repiten(b) - repiten(a) || (a.numeroInventario ?? '').localeCompare(b.numeroInventario ?? '')),
    [esperadas],
  );
  const apartadas = useMemo(() => esperadas.filter((f) => !f.encontrado && !!f.situacion), [esperadas]);
  const encontradas = useMemo(() => esperadas.filter((f) => f.encontrado).sort(masReciente), [esperadas]);
  const otros = useMemo(() => (filas ?? []).filter((f) => f.tipo === 'extra').sort(masReciente), [filas]);
  const ubicaciones = useMemo(() => [...new Set(esperadas.map((f) => f.ubicacionFisica).filter((u): u is string => !!u))].sort(), [esperadas]);
  const contables = esperadas.length - apartadas.length;
  const porcentaje = contables > 0 ? Math.round((encontradas.length / contables) * 100) : 0;

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

  return { jornada, filas, filasRef, sectores, error, cargar, controlRecarga, esperadas, contables, pendientes, apartadas, encontradas, otros, ubicaciones, porcentaje };
}
