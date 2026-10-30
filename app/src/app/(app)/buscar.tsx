import { Ionicons } from '@expo/vector-icons';
import type { BienDto } from '@patrimonio/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Etiquetas } from '../../compartido/bien';
import { Boton } from '../../compartido/ui';
import { buscarBienes } from '../../datos/catalogo';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { mensajeDeError } from '../../compartido/formato';
import { comunes } from '../../compartido/estilos';

const LARGO_MINIMO = 2;
const ESPERA_MS = 350;

/** Búsqueda manual de bienes por número, descripción, catálogo o ubicación, con espera al escribir. */
export default function Buscar() {
  const router = useRouter();
  const { q: inicial } = useLocalSearchParams<{ q?: string }>();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [texto, setTexto] = useState(inicial ?? '');
  const [resultados, setResultados] = useState<BienDto[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consulta = texto.trim();
  const valida = consulta.length >= LARGO_MINIMO;

  // Espera a que se deje de escribir antes de consultar. `vigente` descarta respuestas de búsquedas viejas.
  useEffect(() => {
    if (!valida) {
      setResultados(null);
      setError(null);
      return;
    }
    let vigente = true;
    const espera = setTimeout(async () => {
      setBuscando(true);
      setError(null);
      try {
        const lista = await buscarBienes(consulta);
        if (vigente) setResultados(lista);
      } catch (err) {
        if (vigente) setError(mensajeDeError(err, 'No se pudo buscar.'));
      }
      if (vigente) setBuscando(false);
    }, ESPERA_MS);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [consulta, valida]);

  const abrir = (numero: string) => router.push({ pathname: '/bien/[numero]', params: { numero } });

  return (
    <View style={e.contenedor}>
      <View style={e.columna}>
        <View style={e.campoBusqueda}>
          <Ionicons name="search-outline" size={22} color={c.suave} />
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Número, descripción, catálogo o ubicación"
            placeholderTextColor={c.suave}
            style={e.entradaBusqueda}
            autoFocus={!inicial}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Buscar bienes"
          />
          {texto.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setTexto('')} hitSlop={10}>
              <Ionicons name="close-circle" size={22} color={c.suave} />
            </Pressable>
          )}
        </View>

        {!valida && <Text style={e.ayuda}>Escribí al menos {LARGO_MINIMO} caracteres. Podés buscar con el número sin ceros, el número anterior o parte de la descripción.</Text>}
        {buscando && <ActivityIndicator color={c.accion} />}
        {error && <Text style={e.error}>{error}</Text>}
        {valida && !buscando && !error && resultados?.length === 0 && <Text style={e.ayuda}>No se encontraron bienes para “{consulta}”.</Text>}
        {valida && !buscando && !error && resultados?.length === 0 && (
          <Boton texto="No lo encuentro: registrar hallazgo" variante="secundario" onPress={() => router.push('/hallazgo/nuevo')} />
        )}
        {resultados && resultados.length >= 30 && <Text style={e.ayuda}>Se muestran los primeros 30 resultados. Afiná la búsqueda para ver otros.</Text>}
      </View>

      <FlatList
        data={valida && !error ? (resultados ?? []) : []}
        keyExtractor={(b) => b.id}
        style={e.listaExterna}
        contentContainerStyle={e.lista}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Bien ${item.numeroInventario}. ${item.descripcion ?? 'Sin descripción'}`}
            onPress={() => abrir(item.numeroInventario)}
            style={({ pressed }) => [e.tarjeta, pressed && { opacity: 0.85 }]}
          >
            <Text style={e.numero}>{item.numeroInventario}</Text>
            <Text style={e.descripcion} numberOfLines={2}>
              {item.descripcion ?? 'Sin descripción'}
            </Text>
            {item.ubicacionFisica && (
              <Text style={e.ubicacion} numberOfLines={1}>
                {item.ubicacionFisica}
              </Text>
            )}
            <Etiquetas bien={item} />
          </Pressable>
        )}
      />
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 6, borderWidth: 1, borderColor: c.borde },
  numero: { fontSize: 20, fontWeight: '800', color: c.titulo, letterSpacing: 0.5 },
  descripcion: { fontSize: 15, color: c.texto },
  ubicacion: { fontSize: 13, color: c.suave },
});
