import { FlatList, Text, View } from 'react-native';
import { EstadoCarga } from '../../compartido/ui';
import { fechaHora } from '../../compartido/formato';
import { historialImportaciones } from '../../datos/importar-catalogo';
import { radio, useEstilos, type Paleta } from '../../compartido/tema';
import { comunes } from '../../compartido/estilos';
import { useCarga } from '../../compartido/useCarga';

/** Qué archivos se cargaron al catálogo, cuándo y quién. Lo ve cualquier cuenta; importar es solo de administradores. */
export function HistorialCargas() {
  const e = useEstilos(fabrica);
  const { datos: lista, error, cargar, controlRecarga } = useCarga(() => historialImportaciones(), [], 'No se pudo cargar el historial.', { alEnfocar: true });

  return (
    <View style={e.contenedor}>
      <View style={e.columna}>
        <EstadoCarga error={error} cargando={!lista} alReintentar={cargar} />
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
        refreshControl={controlRecarga}
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
  ...comunes(c),
  ayudaChica: { fontSize: 11, color: c.suave },
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 8, borderWidth: 1, borderColor: c.borde },
  archivo: { fontSize: 16, fontWeight: '700', color: c.titulo },
  fila: { flexDirection: 'row', gap: 8 },
  dato: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: c.fondo, borderWidth: 1, borderColor: c.borde },
  numero: { fontSize: 18, fontWeight: '800', color: c.titulo },
  huella: { fontSize: 12, color: c.suave, fontFamily: 'monospace' },
});
