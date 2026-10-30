import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { asegurarIds, type Lote } from '../../funciones/lote/lote';
import { cargarLote, guardarLote } from '../../funciones/lote/almacen';
import { useEstilos, useTema } from '../../compartido/tema';
import { fabricaLote } from '../../funciones/lote/estilos';
import { ElegirUbicacion } from '../../funciones/lote/elegir-ubicacion';
import { EscaneoLote } from '../../funciones/lote/escaneo';
import { Resumen } from '../../funciones/lote/resumen';

/** Lote por ubicación: elegir dónde, escanear y revisar el resumen. Cada paso es un componente de `funciones/lote/`. */
type Fase = 'cargando' | 'elegir' | 'escanear' | 'resumen';

export default function LotePorUbicacion() {
  const e = useEstilos(fabricaLote);
  const { c } = useTema();
  const [fase, setFase] = useState<Fase>('cargando');
  const [lote, setLote] = useState<Lote | null>(null);
  const [guardado, setGuardado] = useState<Lote | null>(null);

  // Al entrar, si quedó un lote a medias se ofrece continuarlo.
  useEffect(() => {
    cargarLote().then((l) => {
      setGuardado(l ? asegurarIds(l, Crypto.randomUUID) : null);
      setFase('elegir');
    });
  }, []);

  const cambiar = useCallback((nuevo: Lote | null) => {
    setLote(nuevo);
    void guardarLote(nuevo);
  }, []);

  if (fase === 'cargando') {
    return (
      <View style={e.centro}>
        <ActivityIndicator size="large" color={c.accion} />
      </View>
    );
  }

  if (fase === 'elegir' || !lote) {
    return (
      <ElegirUbicacion
        guardado={guardado}
        alContinuar={() => {
          setLote(guardado);
          setFase('escanear');
        }}
        alDescartar={() => {
          setGuardado(null);
          cambiar(null);
        }}
        alEmpezar={(nuevo) => {
          setGuardado(null);
          cambiar(nuevo);
          setFase('escanear');
        }}
      />
    );
  }

  if (fase === 'resumen') {
    return (
      <Resumen
        lote={lote}
        alCambiar={cambiar}
        alSeguir={() => setFase('escanear')}
        alCerrar={() => {
          cambiar(null);
          setFase('elegir');
        }}
      />
    );
  }

  return <EscaneoLote lote={lote} alCambiar={cambiar} alTerminar={() => setFase('resumen')} />;
}
