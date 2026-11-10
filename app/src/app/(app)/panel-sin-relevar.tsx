import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { comunes } from '../../compartido/estilos';
import { ETIQUETA_SITUACION, mensajeDeError } from '../../compartido/formato';
import { radio, useEstilos, type Paleta } from '../../compartido/tema';
import { EstadoCarga } from '../../compartido/ui';
import { bienesSinRelevar, type BienSinRelevar } from '../../datos/panel';
import { useSesion } from '../../sesion/sesion';

const LIMITE = 200;

/** Los bienes que nunca se encontraron, de un área o de todas. Tocar uno abre su ficha. */
export default function PanelSinRelevar() {
  const { area } = useLocalSearchParams<{ area?: string }>();
  const router = useRouter();
  const { perfil } = useSesion();
  const e = useEstilos(fabrica);
  const [lista, setLista] = useState<BienSinRelevar[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLista(await bienesSinRelevar(area ?? null, LIMITE));
      setError(null);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cargar la lista.'));
    }
  }, [area]);

  useEffect(() => {
    if (perfil?.rol === 'administrador') void cargar();
  }, [cargar, perfil?.rol]);

  if (perfil && perfil.rol !== 'administrador') {
    return (
      <View style={e.centro}>
        <Text style={e.error}>El panel es solo para administradores.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={lista ?? []}
      keyExtractor={(b) => b.bienId}
      style={{ width: '100%' }}
      contentContainerStyle={e.lista}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <Text style={e.titulo}>{area ?? 'Todas las áreas'}</Text>
          <Text style={e.ayuda}>Bienes que nunca tuvieron una lectura vigente en ninguna jornada ni lote. Los que tienen una situación declarada (reparación, baja, préstamo) lo indican.</Text>
          <EstadoCarga error={error} cargando={!lista && !error} alReintentar={cargar} />
          {lista && lista.length >= LIMITE && <Text style={e.ayuda}>Se muestran los primeros {LIMITE}.</Text>}
        </View>
      }
      ListEmptyComponent={<Text style={e.ayuda}>{lista ? 'No hay bienes sin relevar.' : ''}</Text>}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/bien/[numero]', params: { numero: item.numeroInventario } })} style={({ pressed }) => [e.tarjeta, pressed && { opacity: 0.85 }]}>
          <Text style={e.numero}>{item.numeroInventario}</Text>
          <Text style={e.descripcion} numberOfLines={2}>
            {item.descripcion ?? 'Sin descripción'}
          </Text>
          <Text style={e.ayuda}>
            {[!area ? item.areaResponsable : null, item.ubicacionFisica].filter(Boolean).join(' · ') || 'Sin ubicación'}
          </Text>
          {item.situacion && <Text style={e.situacion}>{ETIQUETA_SITUACION[item.situacion] ?? item.situacion}</Text>}
        </Pressable>
      )}
    />
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  lista: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.fondo },
  titulo: { fontSize: 18, fontWeight: '800', color: c.titulo },
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 4, borderWidth: 1, borderColor: c.borde },
  numero: { fontSize: 18, fontWeight: '800', color: c.titulo },
  descripcion: { fontSize: 15, color: c.texto },
  situacion: { fontSize: 13, fontWeight: '700', color: c.accion },
});
