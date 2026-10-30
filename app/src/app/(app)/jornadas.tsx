import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Barra, Boton, Opciones } from '../../compartido/ui';
import { type Agrupacion, listarAreas, listarUbicaciones } from '../../datos/catalogo';
import { abrirJornada, type Jornada, listarJornadas } from '../../datos/jornadas';
import { fechaHora, mensajeDeError, sinAcentos } from '../../compartido/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { comunes } from '../../compartido/estilos';

type Vista = 'abiertas' | 'cerradas' | 'nueva';
type Tipo = Jornada['tipo'];
const VISTAS: { clave: Vista; titulo: string }[] = [
  { clave: 'abiertas', titulo: 'Abiertas' },
  { clave: 'cerradas', titulo: 'Cerradas' },
  { clave: 'nueva', titulo: 'Nueva' },
];
const TIPOS: { clave: Tipo; titulo: string }[] = [
  { clave: 'area', titulo: 'Por área' },
  { clave: 'ubicacion', titulo: 'Por ubicación' },
];


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
      setError(mensajeDeError(err, 'No se pudieron cargar las jornadas.'));
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
      setError(mensajeDeError(err, 'No se pudo cargar la lista.'));
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
      setError(mensajeDeError(err, 'No se pudo abrir la jornada.'));
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
        <Opciones opciones={VISTAS} actual={vista} alElegir={elegirVista} />
        {error && (
          <View style={{ gap: 10 }}>
            <Text style={e.error}>{error}</Text>
            <Boton texto="Reintentar" variante="secundario" onPress={vista === 'nueva' ? () => cargarOpciones(tipo) : cargar} />
          </View>
        )}

        {vista === 'nueva' ? (
          <>
            <Text style={e.ayuda}>Elegí qué relevar. Si ya hay una jornada abierta para eso, te sumás a ella y se ve lo que va relevando el resto.</Text>
            <Opciones opciones={TIPOS} actual={tipo} alElegir={elegirTipo} />
            <View style={e.campoBusqueda}>
              <Ionicons name="search-outline" size={22} color={c.suave} />
              <TextInput
                value={filtro}
                onChangeText={setFiltro}
                placeholder={tipo === 'area' ? 'Buscar un área' : 'Buscar una ubicación'}
                placeholderTextColor={c.suave}
                style={e.entradaBusqueda}
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
                <Barra porcentaje={porcentaje} />
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
  ...comunes(c),
  tarjeta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.superficie, borderRadius: radio, padding: 14, borderWidth: 1, borderColor: c.borde },
  tarjetaColumna: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 6, borderWidth: 1, borderColor: c.borde },
  rotulo: { fontSize: 12, fontWeight: '700', color: c.suave, textTransform: 'uppercase' },
  nombre: { fontSize: 16, fontWeight: '700', color: c.titulo },
  cantidad: { fontSize: 20, fontWeight: '800', color: c.titulo },
});
