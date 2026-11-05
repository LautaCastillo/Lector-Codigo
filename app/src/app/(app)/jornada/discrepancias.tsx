import { useLocalSearchParams } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { comunes } from '../../../compartido/estilos';
import { useEstilos, type Paleta } from '../../../compartido/tema';
import { EstadoCarga } from '../../../compartido/ui';
import { TarjetaDiscrepancia } from '../../../funciones/jornada/tarjeta-discrepancia';
import { useJornada } from '../../../funciones/jornada/useJornada';
import { useSesion } from '../../../sesion/sesion';

/** Los bienes de una jornada cuyas lecturas no coinciden. Quien abrió la jornada o un administrador elige cuál vale; el resto solo mira. */
export default function Discrepancias() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { perfil } = useSesion();
  const e = useEstilos(fabrica);
  const { jornada, filas, error, cargar, controlRecarga } = useJornada(id);

  const puedeResolver = jornada?.estado === 'abierta' && (jornada.propia || perfil?.rol === 'administrador');
  const porRevisar = (filas ?? []).filter((f) => f.tipo === 'esperado' && f.discrepancia);
  const resueltas = (filas ?? []).filter((f) => f.tipo === 'esperado' && f.resuelta);

  return (
    <FlatList
      data={[...porRevisar, ...resueltas]}
      keyExtractor={(f) => f.bienId!}
      style={{ width: '100%' }}
      contentContainerStyle={e.contenido}
      refreshControl={controlRecarga}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <Text style={e.titulo}>{jornada?.alcance ?? 'Jornada'}</Text>
          <Text style={e.ayuda}>
            {porRevisar.length} por revisar · {resueltas.length} resuelta{resueltas.length === 1 ? '' : 's'}. Son bienes que dos personas leyeron y las lecturas no coinciden, por ejemplo en otra ubicación.
          </Text>
          {!puedeResolver && filas && <Text style={e.ayuda}>Solo quien abrió la jornada o un administrador puede elegir la lectura válida, y solo mientras está abierta.</Text>}
          <EstadoCarga error={error} cargando={!filas} alReintentar={cargar} />
        </View>
      }
      ListEmptyComponent={<Text style={e.ayuda}>{filas ? 'No hay discrepancias en esta jornada.' : ''}</Text>}
      renderItem={({ item }) => <TarjetaDiscrepancia jornadaId={id} fila={item} puedeResolver={!!puedeResolver} alResolver={cargar} />}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
    />
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  contenido: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20 },
  titulo: { fontSize: 18, fontWeight: '800', color: c.titulo },
});
