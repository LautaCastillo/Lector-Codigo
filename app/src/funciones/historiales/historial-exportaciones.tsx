import { FlatList, Text, View } from 'react-native';
import { EstadoCarga } from '../../compartido/ui';
import { historialExportaciones } from '../../datos/exportaciones';
import { fechaHora } from '../../compartido/formato';
import { radio, useEstilos, type Paleta } from '../../compartido/tema';
import { comunes } from '../../compartido/estilos';
import { useCarga } from '../../compartido/useCarga';

/** Qué exportaciones se hicieron, cuándo y quién, con los filtros y la huella del archivo. Lo ve cualquier cuenta; el contenido no se guarda. */
export function HistorialExportaciones() {
  const e = useEstilos(fabrica);
  const { datos: lista, error, cargar, controlRecarga } = useCarga(() => historialExportaciones(), [], 'No se pudo cargar el historial.', { alEnfocar: true });

  return (
    <View style={e.contenedor}>
      <View style={e.columna}>
        <EstadoCarga error={error} cargando={!lista} alReintentar={cargar} />
        {lista && lista.length === 0 && <Text style={e.ayuda}>Todavía no se exportó nada.</Text>}
        {lista && lista.length > 0 && (
          <Text style={e.ayuda}>
            {lista.length} {lista.length === 1 ? 'exportación' : 'exportaciones'}. La huella permite comprobar que un archivo es el que se exportó.
          </Text>
        )}
      </View>
      <FlatList
        data={lista ?? []}
        keyExtractor={(i) => i.id}
        style={e.listaExterna}
        contentContainerStyle={e.lista}
        refreshControl={controlRecarga}
        renderItem={({ item }) => {
          const f = item.filtros;
          const detalle = [
            f?.alcance === 'todos' ? 'De todo el equipo' : 'Solo lo propio',
            f?.ubicacion ? `Ubicación: ${f.ubicacion}` : null,
            f?.resultado ? `Resultado: ${f.resultado}` : null,
            f?.desde ? `Desde ${fechaHora(f.desde)}` : null,
            f?.hasta ? `Hasta ${fechaHora(f.hasta)}` : null,
          ].filter((t): t is string => !!t);
          return (
            <View style={e.tarjeta}>
              <Text style={e.titulo}>
                {item.formato.toUpperCase()} · {item.filas} {item.filas === 1 ? 'fila' : 'filas'}
              </Text>
              <Text style={e.ayuda}>
                {fechaHora(item.creadoEn)} · {item.usuario}
              </Text>
              {detalle.length > 0 && <Text style={e.ayuda}>{detalle.join(' · ')}</Text>}
              {item.hashSha256 && (
                <Text style={e.huella} selectable>
                  Huella: {item.hashSha256.slice(0, 16)}…
                </Text>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 6, borderWidth: 1, borderColor: c.borde },
  titulo: { fontSize: 16, fontWeight: '700', color: c.titulo },
  huella: { fontSize: 12, color: c.suave, fontFamily: 'monospace' },
});
