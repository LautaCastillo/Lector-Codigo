import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Boton } from '../../components/ui';
import { listarAreas, listarResponsables, listarUbicaciones, type Agrupacion, type CampoAgrupacion } from '../../lib/api';
import { radio, useEstilos, useTema, type Paleta } from '../../lib/tema';

type Vista = 'areas' | 'responsables' | 'ubicaciones';

const VISTAS: { valor: Vista; titulo: string; campo: CampoAgrupacion; vacio: string; busqueda: string }[] = [
  { valor: 'areas', titulo: 'Áreas', campo: 'areaResponsable', vacio: 'Todavía no hay áreas: importá un listado de SIU.', busqueda: 'Buscar un área' },
  { valor: 'responsables', titulo: 'Responsables', campo: 'responsableUso', vacio: 'Ningún bien tiene responsable cargado. Importá un reporte por área, que lo trae.', busqueda: 'Buscar un responsable' },
  { valor: 'ubicaciones', titulo: 'Ubicaciones', campo: 'ubicacionFisica', vacio: 'Todavía no hay ubicaciones: importá un listado de SIU.', busqueda: 'Buscar una ubicación' },
];

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Los bienes del catálogo agrupados por área responsable, por responsable de uso o por ubicación física. */
export default function Explorar() {
  const router = useRouter();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [vista, setVista] = useState<Vista>('areas');
  const [filtro, setFiltro] = useState('');
  const [lista, setLista] = useState<Agrupacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const actual = VISTAS.find((v) => v.valor === vista) ?? VISTAS[0]!;

  const cargar = useCallback(async () => {
    setError(null);
    try {
      if (vista === 'areas') setLista(await listarAreas());
      else if (vista === 'responsables') setLista(await listarResponsables());
      else setLista((await listarUbicaciones()).map((u) => ({ nombre: u.nombre, cantidad: u.cantidad, detalle: '' })));
    } catch (err) {
      setLista(null);
      setError(err instanceof Error ? err.message : 'No se pudo cargar la lista.');
    }
  }, [vista]);

  useEffect(() => {
    setLista(null);
    setFiltro('');
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const q = sinAcentos(filtro.trim());
    return (lista ?? []).filter((g) => !q || sinAcentos(g.nombre).includes(q));
  }, [lista, filtro]);

  return (
    <View style={e.contenedor}>
      <View style={e.columna}>
        <View style={e.pestanas}>
          {VISTAS.map((v) => (
            <Pressable
              key={v.valor}
              accessibilityRole="tab"
              accessibilityState={{ selected: vista === v.valor }}
              onPress={() => setVista(v.valor)}
              style={[e.pestana, vista === v.valor && { backgroundColor: c.primario }]}
            >
              <Text style={[e.pestanaTexto, vista === v.valor && { color: c.sobrePrimario }]}>{v.titulo}</Text>
            </Pressable>
          ))}
        </View>
        <View style={e.campo}>
          <Ionicons name="search-outline" size={22} color={c.suave} />
          <TextInput
            value={filtro}
            onChangeText={setFiltro}
            placeholder={actual.busqueda}
            placeholderTextColor={c.suave}
            style={e.entrada}
            autoCorrect={false}
            accessibilityLabel={actual.busqueda}
          />
          {filtro.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Borrar" onPress={() => setFiltro('')} hitSlop={10}>
              <Ionicons name="close-circle" size={22} color={c.suave} />
            </Pressable>
          )}
        </View>
        {error && (
          <View style={{ gap: 10 }}>
            <Text style={e.error}>{error}</Text>
            <Boton texto="Reintentar" variante="secundario" onPress={cargar} />
          </View>
        )}
        {!error && !lista && <ActivityIndicator color={c.accion} />}
        {lista && lista.length === 0 && <Text style={e.ayuda}>{actual.vacio}</Text>}
        {lista && lista.length > 0 && (
          <Text style={e.ayuda}>
            {visibles.length} de {lista.length} · {lista.reduce((n, g) => n + g.cantidad, 0)} bienes en total
          </Text>
        )}
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(g) => g.nombre}
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.nombre}. ${item.cantidad} bienes`}
            onPress={() => router.push({ pathname: '/explorar-detalle', params: { campo: actual.campo, valor: item.nombre } })}
            style={({ pressed }) => [e.tarjeta, pressed && { opacity: 0.85 }]}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={e.nombre} numberOfLines={3}>
                {item.nombre}
              </Text>
              {item.detalle ? <Text style={e.ayuda}>{item.detalle}</Text> : null}
            </View>
            <View style={e.cantidad}>
              <Text style={e.cantidadNumero}>{item.cantidad}</Text>
              <Text style={e.cantidadTexto}>{item.cantidad === 1 ? 'bien' : 'bienes'}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  contenedor: { flex: 1, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 720, paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  pestanas: { flexDirection: 'row', gap: 8 },
  pestana: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: c.borde, backgroundColor: c.superficie },
  pestanaTexto: { fontSize: 15, fontWeight: '600', color: c.texto },
  campo: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: radio, borderWidth: 1.5, borderColor: c.borde, backgroundColor: c.superficie },
  entrada: { flex: 1, fontSize: 16, color: c.texto, minHeight: 48 },
  ayuda: { fontSize: 14, color: c.suave },
  error: { fontSize: 15, color: c.error },
  listaExterna: { width: '100%' },
  lista: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 12 },
  tarjeta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.superficie, borderRadius: radio, padding: 14, borderWidth: 1, borderColor: c.borde },
  nombre: { fontSize: 16, fontWeight: '700', color: c.titulo },
  cantidad: { alignItems: 'center', minWidth: 56 },
  cantidadNumero: { fontSize: 22, fontWeight: '800', color: c.titulo },
  cantidadTexto: { fontSize: 12, color: c.suave },
});
