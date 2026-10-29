import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Boton } from '../../components/ui';
import { abrirJornada, listarAreas, listarJornadas, listarUbicaciones, type Agrupacion, type Jornada } from '../../lib/api';
import { fechaHora } from '../../lib/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../lib/tema';

type Vista = 'abiertas' | 'cerradas' | 'nueva';
type Tipo = Jornada['tipo'];

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Relevamientos compartidos de un área o una ubicación: se ven las abiertas, las cerradas y se abre una nueva. */
export default function Jornadas() {
  const router = useRouter();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [vista, setVista] = useState<Vista>('abiertas');
  const [jornadas, setJornadas] = useState<Jornada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);

  // Para abrir una nueva
  const [tipo, setTipo] = useState<Tipo>('area');
  const [opciones, setOpciones] = useState<Agrupacion[] | null>(null);
  const [filtro, setFiltro] = useState('');
  const [abriendo, setAbriendo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setJornadas(await listarJornadas());
    } catch (err) {
      setJornadas(null);
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las jornadas.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const cargarOpciones = useCallback(async (t: Tipo) => {
    setOpciones(null);
    setError(null);
    try {
      if (t === 'area') setOpciones(await listarAreas());
      else setOpciones((await listarUbicaciones()).map((u) => ({ nombre: u.nombre, cantidad: u.cantidad, detalle: '' })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la lista.');
    }
  }, []);

  const elegirVista = (v: Vista) => {
    setVista(v);
    setFiltro('');
    if (v === 'nueva') void cargarOpciones(tipo);
  };
  const elegirTipo = (t: Tipo) => {
    setTipo(t);
    setFiltro('');
    void cargarOpciones(t);
  };

  const abrir = async (alcance: string) => {
    setAbriendo(alcance);
    setError(null);
    try {
      const id = await abrirJornada(tipo, alcance);
      router.push({ pathname: '/jornada/[id]', params: { id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la jornada.');
    }
    setAbriendo(null);
  };

  const visibles = useMemo(() => (jornadas ?? []).filter((j) => (vista === 'abiertas' ? j.estado === 'abierta' : j.estado === 'cerrada')), [jornadas, vista]);
  const opcionesVisibles = useMemo(() => {
    const q = sinAcentos(filtro.trim());
    return (opciones ?? []).filter((o) => !q || sinAcentos(o.nombre).includes(q));
  }, [opciones, filtro]);

  return (
    <View style={e.contenedor}>
      <View style={e.columna}>
        <View style={e.pestanas}>
          {(['abiertas', 'cerradas', 'nueva'] as const).map((v) => (
            <Pressable
              key={v}
              accessibilityRole="tab"
              accessibilityState={{ selected: vista === v }}
              onPress={() => elegirVista(v)}
              style={[e.pestana, vista === v && { backgroundColor: c.primario }]}
            >
              <Text style={[e.pestanaTexto, vista === v && { color: c.sobrePrimario }]}>{v === 'abiertas' ? 'Abiertas' : v === 'cerradas' ? 'Cerradas' : 'Nueva'}</Text>
            </Pressable>
          ))}
        </View>
        {error && (
          <View style={{ gap: 10 }}>
            <Text style={e.error}>{error}</Text>
            <Boton texto="Reintentar" variante="secundario" onPress={vista === 'nueva' ? () => cargarOpciones(tipo) : cargar} />
          </View>
        )}

        {vista === 'nueva' ? (
          <>
            <Text style={e.ayuda}>Elegí qué relevar. Si ya hay una jornada abierta para eso, te sumás a ella y se ve lo que va relevando el resto.</Text>
            <View style={e.pestanas}>
              {(['area', 'ubicacion'] as const).map((t) => (
                <Pressable
                  key={t}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tipo === t }}
                  onPress={() => elegirTipo(t)}
                  style={[e.pestana, tipo === t && { backgroundColor: c.primario }]}
                >
                  <Text style={[e.pestanaTexto, tipo === t && { color: c.sobrePrimario }]}>{t === 'area' ? 'Por área' : 'Por ubicación'}</Text>
                </Pressable>
              ))}
            </View>
            <View style={e.campo}>
              <Ionicons name="search-outline" size={22} color={c.suave} />
              <TextInput
                value={filtro}
                onChangeText={setFiltro}
                placeholder={tipo === 'area' ? 'Buscar un área' : 'Buscar una ubicación'}
                placeholderTextColor={c.suave}
                style={e.entrada}
                autoCorrect={false}
              />
            </View>
            {!opciones && !error && <ActivityIndicator color={c.accion} />}
            {opciones && opciones.length === 0 && <Text style={e.ayuda}>No hay {tipo === 'area' ? 'áreas' : 'ubicaciones'} en el catálogo: importá un listado de SIU.</Text>}
          </>
        ) : (
          <>
            {!error && !jornadas && <ActivityIndicator color={c.accion} />}
            {jornadas && visibles.length === 0 && (
              <Text style={e.ayuda}>{vista === 'abiertas' ? 'No hay jornadas abiertas. Abrí una desde la pestaña Nueva.' : 'Todavía no se cerró ninguna jornada.'}</Text>
            )}
          </>
        )}
      </View>

      {vista === 'nueva' ? (
        <FlatList
          data={opcionesVisibles}
          keyExtractor={(o) => o.nombre}
          style={e.listaExterna}
          contentContainerStyle={e.lista}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Relevar ${item.nombre}`}
              disabled={abriendo !== null}
              onPress={() => abrir(item.nombre)}
              style={({ pressed }) => [e.tarjeta, (pressed || abriendo === item.nombre) && { opacity: 0.7 }]}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={e.nombre} numberOfLines={3}>
                  {item.nombre}
                </Text>
                {item.detalle ? <Text style={e.ayuda}>{item.detalle}</Text> : null}
              </View>
              {abriendo === item.nombre ? <ActivityIndicator color={c.accion} /> : <Text style={e.cantidad}>{item.cantidad}</Text>}
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={visibles}
          keyExtractor={(j) => j.id}
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
          renderItem={({ item }) => {
            const porcentaje = item.esperados > 0 ? Math.round((item.encontrados / item.esperados) * 100) : 0;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Jornada de ${item.alcance}. ${item.encontrados} de ${item.esperados} encontrados`}
                onPress={() => router.push({ pathname: '/jornada/[id]', params: { id: item.id } })}
                style={({ pressed }) => [e.tarjetaColumna, pressed && { opacity: 0.85 }]}
              >
                <Text style={e.rotulo}>{item.tipo === 'area' ? 'Área' : 'Ubicación'}</Text>
                <Text style={e.nombre} numberOfLines={3}>
                  {item.alcance}
                </Text>
                <View style={e.barra}>
                  <View style={[e.barraRelleno, { width: `${porcentaje}%` }]} />
                </View>
                <Text style={e.ayuda}>
                  {item.encontrados} de {item.esperados} encontrados ({porcentaje} %)
                </Text>
                <Text style={e.ayuda}>
                  {item.estado === 'abierta' ? 'Abierta' : 'Cerrada'} · {item.propia ? 'La abriste vos' : item.creadaPor} · {fechaHora(item.estado === 'abierta' ? item.creadoEn : (item.cerradaEn ?? item.creadoEn))}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
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
  tarjetaColumna: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 6, borderWidth: 1, borderColor: c.borde },
  rotulo: { fontSize: 12, fontWeight: '700', color: c.suave, textTransform: 'uppercase' },
  nombre: { fontSize: 16, fontWeight: '700', color: c.titulo },
  cantidad: { fontSize: 20, fontWeight: '800', color: c.titulo },
  barra: { height: 8, borderRadius: 4, backgroundColor: c.borde, overflow: 'hidden' },
  barraRelleno: { height: 8, backgroundColor: c.ok },
});
