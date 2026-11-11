import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { comunes } from '../../../compartido/estilos';
import { useEstilos, type Paleta } from '../../../compartido/tema';
import { obtenerJornada } from '../../../datos/jornadas';
import { Comentarios } from '../../../funciones/comentarios/comentarios';

/** Los comentarios de una jornada: notas del equipo sobre el relevamiento en conjunto. */
export default function ComentariosDeJornada() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const e = useEstilos(fabrica);
  const [alcance, setAlcance] = useState<string | null>(null);

  useEffect(() => {
    obtenerJornada(id)
      .then((j) => setAlcance(j?.alcance ?? null))
      .catch(() => undefined);
  }, [id]);

  return (
    <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
      <View style={e.columna}>
        <Text style={e.titulo}>{alcance ?? 'Jornada'}</Text>
        <Text style={e.ayuda}>Notas de todo el equipo sobre esta jornada. Para comentar un bien en particular, abrí su ficha.</Text>
        <Comentarios destino={{ jornadaId: id }} />
      </View>
    </ScrollView>
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 720, gap: 12 },
  titulo: { fontSize: 18, fontWeight: '800', color: c.titulo },
});
