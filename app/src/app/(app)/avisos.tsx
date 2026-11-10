import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { comunes } from '../../compartido/estilos';
import { fechaHora, mensajeDeError } from '../../compartido/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { Boton, EstadoCarga } from '../../compartido/ui';
import { listarAvisos, marcarAvisosLeidos, type Aviso, type TipoAviso } from '../../datos/avisos';
import { fijarAvisosSinLeer } from '../../funciones/avisos/avisos';

const ICONO: Record<TipoAviso, keyof typeof Ionicons.glyphMap> = {
  jornada_abierta: 'play-circle-outline',
  jornada_cerrada: 'checkmark-circle-outline',
  discrepancia: 'alert-circle-outline',
  tarea_asignada: 'checkbox-outline',
};

/** La bandeja de avisos: lo nuevo arriba y resaltado. Tocar uno lo marca como leído y abre lo que corresponde. */
export default function Avisos() {
  const router = useRouter();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [avisos, setAvisos] = useState<Aviso[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const lista = await listarAvisos();
      setAvisos(lista);
      fijarAvisosSinLeer(lista.filter((a) => !a.leido).length);
      setError(null);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar los avisos.'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const abrir = async (a: Aviso) => {
    if (!a.leido) {
      setAvisos((lista) => (lista ?? []).map((x) => (x.id === a.id ? { ...x, leido: true } : x)));
      marcarAvisosLeidos([a.id])
        .then(() => cargar())
        .catch(() => undefined);
    }
    if (a.tipo === 'discrepancia' && a.jornadaId) router.push({ pathname: '/jornada/discrepancias', params: { id: a.jornadaId } });
    else if (a.jornadaId) router.push({ pathname: '/jornada/[id]', params: { id: a.jornadaId } });
    else if (a.tipo === 'tarea_asignada') router.push('/tareas');
  };

  const marcarTodos = async () => {
    try {
      await marcarAvisosLeidos();
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron marcar los avisos.'));
    }
  };

  const sinLeer = (avisos ?? []).filter((a) => !a.leido).length;

  return (
    <FlatList
      data={avisos ?? []}
      keyExtractor={(a) => a.id}
      style={{ width: '100%' }}
      contentContainerStyle={e.lista}
      refreshControl={
        <RefreshControl
          refreshing={actualizando}
          onRefresh={async () => {
            setActualizando(true);
            await cargar();
            setActualizando(false);
          }}
        />
      }
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          <EstadoCarga error={error} cargando={!avisos && !error} alReintentar={cargar} />
          {sinLeer > 0 && <Boton texto={`Marcar ${sinLeer === 1 ? 'el aviso' : `los ${sinLeer} avisos`} como leído${sinLeer === 1 ? '' : 's'}`} variante="secundario" onPress={marcarTodos} />}
        </View>
      }
      ListEmptyComponent={<Text style={e.ayuda}>{avisos ? 'No tenés avisos.' : ''}</Text>}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" onPress={() => abrir(item)} style={({ pressed }) => [e.tarjeta, !item.leido && { borderColor: c.accion, borderWidth: 1.5 }, pressed && { opacity: 0.85 }]}>
          <Ionicons name={ICONO[item.tipo]} size={26} color={item.leido ? c.suave : c.accion} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[e.titulo, item.leido && { fontWeight: '600' }]}>{item.titulo}</Text>
            {item.detalle && <Text style={e.texto}>{item.detalle}</Text>}
            <Text style={e.ayuda}>{fechaHora(item.creadoEn)}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  lista: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20 },
  tarjeta: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: c.superficie, borderRadius: radio, padding: 14, borderWidth: 1, borderColor: c.borde },
  titulo: { fontSize: 16, fontWeight: '800', color: c.titulo },
  texto: { fontSize: 14, color: c.texto },
});
