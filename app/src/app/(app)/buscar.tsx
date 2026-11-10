import { Ionicons } from '@expo/vector-icons';
import type { BienDto } from '@patrimonio/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Etiquetas } from '../../compartido/bien';
import { Boton, Chip } from '../../compartido/ui';
import { buscarBienes, listarAreas, listarEstados, MAX_RESULTADOS, type Agrupacion } from '../../datos/catalogo';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { mensajeDeError } from '../../compartido/formato';
import { comunes } from '../../compartido/estilos';

const LARGO_MINIMO = 2;
const ESPERA_MS = 350;

/**
 * Búsqueda manual de bienes por número, número de serie, descripción, responsable, catálogo o ubicación, con espera al escribir.
 * Se puede acotar por área y por estado; con un filtro alcanza, sin escribir nada.
 */
export default function Buscar() {
  const router = useRouter();
  const { q: inicial } = useLocalSearchParams<{ q?: string }>();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [texto, setTexto] = useState(inicial ?? '');
  const [area, setArea] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [areas, setAreas] = useState<Agrupacion[] | null>(null);
  const [estados, setEstados] = useState<{ nombre: string; cantidad: number }[] | null>(null);
  const [errorFiltros, setErrorFiltros] = useState(false);
  const [resultados, setResultados] = useState<BienDto[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consulta = texto.trim();
  const hayTexto = consulta.length >= LARGO_MINIMO;
  const valida = hayTexto || !!area || !!estado;
  const cantidadFiltros = (area ? 1 : 0) + (estado ? 1 : 0);

  // Las opciones de los filtros se piden la primera vez que se abre el panel.
  useEffect(() => {
    if (!filtrosAbiertos || (areas && estados)) return;
    Promise.all([listarAreas(), listarEstados()])
      .then(([a, s]) => {
        setAreas(a);
        setEstados(s);
        setErrorFiltros(false);
      })
      .catch(() => setErrorFiltros(true));
  }, [filtrosAbiertos, areas, estados]);

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
        const lista = await buscarBienes(consulta, { area, estado });
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
  }, [consulta, valida, area, estado]);

  const abrir = (numero: string) => router.push({ pathname: '/bien/[numero]', params: { numero } });
  const sinResultados = valida && !buscando && !error && resultados?.length === 0;

  return (
    <View style={e.contenedor}>
      <View style={e.columna}>
        <View style={e.campoBusqueda}>
          <Ionicons name="search-outline" size={22} color={c.suave} />
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Número, serie, descripción, responsable…"
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

        <View style={e.barraFiltros}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: filtrosAbiertos }}
            accessibilityLabel={`Filtros${cantidadFiltros ? `, ${cantidadFiltros} activos` : ''}`}
            onPress={() => setFiltrosAbiertos((a) => !a)}
            style={[e.botonFiltros, cantidadFiltros > 0 && { borderColor: c.accion }]}
          >
            <Ionicons name="options-outline" size={20} color={cantidadFiltros ? c.accion : c.suave} />
            <Text style={[e.botonFiltrosTexto, cantidadFiltros > 0 && { color: c.accion }]}>Filtros{cantidadFiltros ? ` (${cantidadFiltros})` : ''}</Text>
            <Ionicons name={filtrosAbiertos ? 'chevron-up' : 'chevron-down'} size={16} color={c.suave} />
          </Pressable>
          {cantidadFiltros > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setArea(null);
                setEstado(null);
              }}
              hitSlop={8}
            >
              <Text style={e.enlace}>Quitar filtros</Text>
            </Pressable>
          )}
        </View>

        {!filtrosAbiertos && cantidadFiltros > 0 && (
          <Text style={e.ayuda} numberOfLines={2}>
            {[area ? `Área: ${area}` : null, estado ? `Estado: ${estado}` : null].filter(Boolean).join(' · ')}
          </Text>
        )}

        {filtrosAbiertos && (
          <View style={e.panelFiltros}>
            {errorFiltros && <Text style={e.error}>No se pudieron cargar las opciones. Cerrá y volvé a abrir los filtros.</Text>}
            {!areas && !errorFiltros && <ActivityIndicator color={c.accion} />}
            {areas && estados && (
              <>
                <Text style={e.rotulo}>Área responsable</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={e.chips} keyboardShouldPersistTaps="handled">
                  <Chip texto="Todas" activo={area === null} alTocar={() => setArea(null)} />
                  {areas.map((a) => (
                    <Chip key={a.nombre} texto={`${a.nombre} (${a.cantidad})`} activo={area === a.nombre} alTocar={() => setArea(area === a.nombre ? null : a.nombre)} />
                  ))}
                </ScrollView>
                <Text style={e.rotulo}>Estado</Text>
                <View style={e.chipsEnVarias}>
                  <Chip texto="Todos" activo={estado === null} alTocar={() => setEstado(null)} />
                  {estados.map((s) => (
                    <Chip key={s.nombre} texto={`${s.nombre} (${s.cantidad})`} activo={estado === s.nombre} alTocar={() => setEstado(estado === s.nombre ? null : s.nombre)} />
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {!valida && <Text style={e.ayuda}>Escribí al menos {LARGO_MINIMO} caracteres o elegí un filtro. Podés buscar con el número sin ceros, el número anterior o de serie, parte de la descripción o el nombre del responsable.</Text>}
        {buscando && <ActivityIndicator color={c.accion} />}
        {error && <Text style={e.error}>{error}</Text>}
        {sinResultados && <Text style={e.ayuda}>{hayTexto ? `No se encontraron bienes para “${consulta}”${cantidadFiltros ? ' con esos filtros' : ''}.` : 'No se encontraron bienes con esos filtros.'}</Text>}
        {sinResultados && hayTexto && cantidadFiltros === 0 && (
          <Boton texto="No lo encuentro: registrar hallazgo" variante="secundario" onPress={() => router.push('/hallazgo/nuevo')} />
        )}
        {resultados && resultados.length >= MAX_RESULTADOS && <Text style={e.ayuda}>Se muestran los primeros {MAX_RESULTADOS} resultados. Afiná la búsqueda o sumá un filtro para ver otros.</Text>}
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
  barraFiltros: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  botonFiltros: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: radio, borderWidth: 1.5, borderColor: c.borde, backgroundColor: c.superficie },
  botonFiltrosTexto: { fontSize: 15, fontWeight: '600', color: c.texto },
  enlace: { fontSize: 14, fontWeight: '600', color: c.accion },
  panelFiltros: { gap: 8, padding: 12, borderRadius: radio, borderWidth: 1, borderColor: c.borde, backgroundColor: c.superficie },
  rotulo: { fontSize: 12, fontWeight: '700', color: c.suave, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chipsEnVarias: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
