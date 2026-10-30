import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Etiquetas } from '../../compartido/bien';
import { Chip, EstadoCarga } from '../../compartido/ui';
import { type BienDeLista, bienesDe, type CampoAgrupacion } from '../../datos/catalogo';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { sinAcentos } from '../../compartido/formato';
import { comunes } from '../../compartido/estilos';
import { useCarga } from '../../compartido/useCarga';

/** Qué se muestra como segundo nivel para filtrar dentro de cada agrupación. */
const FACETA: Record<CampoAgrupacion, { campo: keyof BienDeLista; titulo: string }> = {
  areaResponsable: { campo: 'ubicacionFisica', titulo: 'Ubicaciones' },
  responsableUso: { campo: 'areaResponsable', titulo: 'Áreas' },
  ubicacionFisica: { campo: 'responsableUso', titulo: 'Responsables' },
};
const TITULO: Record<CampoAgrupacion, string> = { areaResponsable: 'Área', responsableUso: 'Responsable', ubicacionFisica: 'Ubicación' };

/** Los bienes de un área, de un responsable o de una ubicación, con un filtro de segundo nivel y búsqueda. */
export default function ExplorarDetalle() {
  const router = useRouter();
  const { campo, valor } = useLocalSearchParams<{ campo: CampoAgrupacion; valor: string }>();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [texto, setTexto] = useState('');
  const [faceta, setFaceta] = useState<string | null>(null);

  const { datos: bienes, error, cargar } = useCarga(() => bienesDe(campo, valor), [campo, valor], 'No se pudo cargar la lista.');

  const def = FACETA[campo];
  /** Los valores del segundo nivel con su cantidad. */
  const opciones = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const b of bienes ?? []) {
      const v = (b[def.campo] as string | null) ?? 'Sin dato';
      conteo.set(v, (conteo.get(v) ?? 0) + 1);
    }
    return [...conteo.entries()].sort((a, b) => b[1] - a[1]);
  }, [bienes, def.campo]);

  const visibles = useMemo(() => {
    const q = sinAcentos(texto.trim());
    return (bienes ?? []).filter((b) => {
      if (faceta !== null && ((b[def.campo] as string | null) ?? 'Sin dato') !== faceta) return false;
      return !q || sinAcentos(`${b.numeroInventario} ${b.descripcion ?? ''}`).includes(q);
    });
  }, [bienes, faceta, texto, def.campo]);

  return (
    <View style={e.contenedor}>
      <View style={e.columna}>
        <Text style={e.rotulo}>{TITULO[campo]}</Text>
        <Text style={e.titulo}>{valor}</Text>
        <EstadoCarga error={error} cargando={!bienes} alReintentar={cargar} />
        {bienes && (
          <>
            <Text style={e.ayuda}>
              {visibles.length} de {bienes.length} bienes
              {bienes.length >= 5000 ? ' (se muestran los primeros 5000)' : ''}
            </Text>
            {opciones.length > 1 && (
              <View style={{ gap: 6 }}>
                <Text style={e.ayuda}>{def.titulo}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <Chip texto={`Todas · ${bienes.length}`} activo={faceta === null} alTocar={() => setFaceta(null)} />
                  {opciones.map(([nombre, n]) => (
                    <Chip key={nombre} texto={`${nombre} · ${n}`} activo={faceta === nombre} alTocar={() => setFaceta(faceta === nombre ? null : nombre)} />
                  ))}
                </ScrollView>
              </View>
            )}
            <View style={e.campoBusqueda}>
              <Ionicons name="search-outline" size={22} color={c.suave} />
              <TextInput
                value={texto}
                onChangeText={setTexto}
                placeholder="Filtrar por número o descripción"
                placeholderTextColor={c.suave}
                style={e.entradaBusqueda}
                autoCorrect={false}
                accessibilityLabel="Filtrar bienes"
              />
              {texto.length > 0 && (
                <Pressable accessibilityRole="button" accessibilityLabel="Borrar" onPress={() => setTexto('')} hitSlop={10}>
                  <Ionicons name="close-circle" size={22} color={c.suave} />
                </Pressable>
              )}
            </View>
          </>
        )}
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(b) => b.id}
        style={e.listaExterna}
        contentContainerStyle={e.lista}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Bien ${item.numeroInventario}. ${item.descripcion ?? 'Sin descripción'}`}
            onPress={() => router.push({ pathname: '/bien/[numero]', params: { numero: item.numeroInventario } })}
            style={({ pressed }) => [e.tarjeta, pressed && { opacity: 0.85 }]}
          >
            <Text style={e.numero}>{item.numeroInventario}</Text>
            <Text style={e.descripcion} numberOfLines={2}>
              {item.descripcion ?? 'Sin descripción'}
            </Text>
            {campo !== 'ubicacionFisica' && item.ubicacionFisica && (
              <Text style={e.ayuda} numberOfLines={1}>
                {item.ubicacionFisica}
              </Text>
            )}
            {campo !== 'responsableUso' && item.responsableUso && (
              <Text style={e.ayuda} numberOfLines={1}>
                Responsable: {item.responsableUso}
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
  rotulo: { fontSize: 13, fontWeight: '700', color: c.suave, textTransform: 'uppercase' },
  titulo: { fontSize: 20, fontWeight: '800', color: c.titulo },
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 6, borderWidth: 1, borderColor: c.borde },
  numero: { fontSize: 20, fontWeight: '800', color: c.titulo, letterSpacing: 0.5 },
  descripcion: { fontSize: 15, color: c.texto },
});
