import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { Boton } from '../../components/ui';
import { fechaHora } from '../../lib/formato';
import { historialImportaciones, type Importacion } from '../../lib/importar-catalogo';
import { radio, useEstilos, useTema, type Paleta } from '../../lib/tema';

/** Qué archivos se cargaron al catálogo, cuándo y quién. Lo ve cualquier cuenta; importar es solo de administradores. */
export default function HistorialImportaciones() {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [lista, setLista] = useState<Importacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setLista(await historialImportaciones());
    } catch (err) {
      setLista(null);
      setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  return (
    <View style={e.contenedor}>
      <View style={e.columna}>
        {error && (
          <View style={{ gap: 10 }}>
            <Text style={e.error}>{error}</Text>
            <Boton texto="Reintentar" variante="secundario" onPress={cargar} />
          </View>
        )}
        {!error && !lista && <ActivityIndicator color={c.accion} />}
        {lista && lista.length === 0 && <Text style={e.ayuda}>Todavía no se importó ningún archivo.</Text>}
        {lista && lista.length > 0 && (
          <Text style={e.ayuda}>
            {lista.length} {lista.length === 1 ? 'carga' : 'cargas'}. Un archivo igual a uno ya cargado no cambia nada si se repite.
          </Text>
        )}
      </View>
      <FlatList
        data={lista ?? []}
        keyExtractor={(i) => i.id}
        style={e.listaExterna}
        contentContainerStyle={e.lista}
        refreshControl={
          <RefreshControl
            refreshing={actualizando}
            onRefresh={async () => {
              setActualizando(true);
              await cargar();
              setActualizando(false);
            }}
            tintColor={c.accion}
          />
        }
        renderItem={({ item }) => (
          <View style={e.tarjeta}>
            <Text style={e.archivo} selectable numberOfLines={2}>
              {item.archivo}
            </Text>
            <Text style={e.ayuda}>
              {fechaHora(item.creadoEn)} · {item.usuario}
            </Text>
            <View style={e.fila}>
              <Dato valor={item.filas} titulo="bienes" />
              <Dato valor={item.nuevos} titulo="nuevos" />
              <Dato valor={item.modificados} titulo="modificados" />
              <Dato valor={item.sinCambios} titulo="sin cambios" />
            </View>
            {item.areas && item.areas.length > 0 && (
              <Text style={e.ayuda}>
                {item.areas.length === 1 ? 'Área' : 'Áreas'}: {item.areas.join(' · ')}
              </Text>
            )}
            <Text style={e.huella} selectable>
              Huella: {item.hashSha256.slice(0, 16)}…
            </Text>
          </View>
        )}
      />
    </View>
  );
}

function Dato({ valor, titulo }: { valor: number; titulo: string }) {
  const e = useEstilos(fabrica);
  return (
    <View style={e.dato}>
      <Text style={e.numero}>{valor}</Text>
      <Text style={e.ayudaChica}>{titulo}</Text>
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  contenedor: { flex: 1, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 720, paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  ayuda: { fontSize: 14, color: c.suave },
  ayudaChica: { fontSize: 11, color: c.suave },
  error: { fontSize: 15, color: c.error },
  listaExterna: { width: '100%' },
  lista: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 12 },
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 8, borderWidth: 1, borderColor: c.borde },
  archivo: { fontSize: 16, fontWeight: '700', color: c.titulo },
  fila: { flexDirection: 'row', gap: 8 },
  dato: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: c.fondo, borderWidth: 1, borderColor: c.borde },
  numero: { fontSize: 18, fontWeight: '800', color: c.titulo },
  huella: { fontSize: 12, color: c.suave, fontFamily: 'monospace' },
});
