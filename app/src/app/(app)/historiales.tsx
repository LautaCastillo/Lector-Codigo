import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { HistorialCargas } from '../../funciones/historiales/historial-cargas';
import { HistorialExportaciones } from '../../funciones/historiales/historial-exportaciones';
import { Opciones } from '../../compartido/ui';

type Pestana = 'cargas' | 'exportaciones';
const PESTANAS: { clave: Pestana; titulo: string }[] = [
  { clave: 'cargas', titulo: 'Cargas del catálogo' },
  { clave: 'exportaciones', titulo: 'Exportaciones' },
];

/** Qué se cargó al catálogo y qué se exportó, con quién y cuándo. Lo ve cualquier cuenta. `?pestana=exportaciones` abre la segunda. */
export default function Historiales() {
  const { pestana: inicial } = useLocalSearchParams<{ pestana?: string }>();
  const [pestana, setPestana] = useState<Pestana>(inicial === 'exportaciones' ? 'exportaciones' : 'cargas');

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <Opciones opciones={PESTANAS} actual={pestana} alElegir={setPestana} />
      </View>
      {pestana === 'cargas' ? <HistorialCargas /> : <HistorialExportaciones />}
    </View>
  );
}
