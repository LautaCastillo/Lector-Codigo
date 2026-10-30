import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { EstadoCarga, Opciones } from '../../compartido/ui';
import { type CampoAgrupacion, listarAreas, listarResponsables, listarUbicaciones } from '../../datos/catalogo';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { sinAcentos } from '../../compartido/formato';
import { comunes } from '../../compartido/estilos';
import { useCarga } from '../../compartido/useCarga';

type Vista = 'areas' | 'responsables' | 'ubicaciones';

const VISTAS: { valor: Vista; titulo: string; campo: CampoAgrupacion; vacio: string; busqueda: string }[] = [
  { valor: 'areas', titulo: 'Áreas', campo: 'areaResponsable', vacio: 'Todavía no hay áreas: importá un listado de SIU.', busqueda: 'Buscar un área' },
  { valor: 'responsables', titulo: 'Responsables', campo: 'responsableUso', vacio: 'Ningún bien tiene responsable cargado. Importá un reporte por área, que lo trae.', busqueda: 'Buscar un responsable' },
  { valor: 'ubicaciones', titulo: 'Ubicaciones', campo: 'ubicacionFisica', vacio: 'Todavía no hay ubicaciones: importá un listado de SIU.', busqueda: 'Buscar una ubicación' },
];


/** Los bienes del catálogo agrupados por área responsable, por responsable de uso o por ubicación física. */
export default function Explorar() {
  const router = useRouter();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [vista, setVista] = useState<Vista>('areas');
  const [filtro, setFiltro] = useState('');
  const actual = VISTAS.find((v) => v.valor === vista) ?? VISTAS[0]!;

  const { datos: lista, error, cargar, controlRecarga } = useCarga(
    async () =>
      vista === 'areas'
        ? listarAreas()
        : vista === 'responsables'
          ? listarResponsables()
          : (await listarUbicaciones()).map((u) => ({ nombre: u.nombre, cantidad: u.cantidad, detalle: '' })),
    [vista],
    'No se pudo cargar la lista.',
  );
  useEffect(() => setFiltro(''), [vista]);

  const visibles = useMemo(() => {
    const q = sinAcentos(filtro.trim());
    return (lista ?? []).filter((g) => !q || sinAcentos(g.nombre).includes(q));
  }, [lista, filtro]);

  return (
    <View style={e.contenedor}>
      <View style={e.columna}>
        <Opciones opciones={VISTAS.map((v) => ({ clave: v.valor, titulo: v.titulo }))} actual={vista} alElegir={setVista} />
        <View style={e.campoBusqueda}>
          <Ionicons name="search-outline" size={22} color={c.suave} />
          <TextInput
            value={filtro}
            onChangeText={setFiltro}
            placeholder={actual.busqueda}
            placeholderTextColor={c.suave}
            style={e.entradaBusqueda}
            autoCorrect={false}
            accessibilityLabel={actual.busqueda}
          />
          {filtro.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Borrar" onPress={() => setFiltro('')} hitSlop={10}>
              <Ionicons name="close-circle" size={22} color={c.suave} />
            </Pressable>
          )}
        </View>
        <EstadoCarga error={error} cargando={!lista} alReintentar={cargar} />
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
        refreshControl={controlRecarga}
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
  ...comunes(c),
  tarjeta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.superficie, borderRadius: radio, padding: 14, borderWidth: 1, borderColor: c.borde },
  nombre: { fontSize: 16, fontWeight: '700', color: c.titulo },
  cantidad: { alignItems: 'center', minWidth: 56 },
  cantidadNumero: { fontSize: 22, fontWeight: '800', color: c.titulo },
  cantidadTexto: { fontSize: 12, color: c.suave },
});
