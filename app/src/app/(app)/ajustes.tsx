import Constants from 'expo-constants';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { radio, useEstilos, useTema, type Paleta, type Preferencia } from '../../lib/tema';

const OPCIONES: { valor: Preferencia; titulo: string; detalle: string }[] = [
  { valor: 'sistema', titulo: 'Automático', detalle: 'Sigue el modo del celular' },
  { valor: 'claro', titulo: 'Claro', detalle: 'Mejor a la luz del día' },
  { valor: 'oscuro', titulo: 'Oscuro', detalle: 'Descansa la vista y ahorra batería' },
];

export default function Ajustes() {
  const { preferencia, setPreferencia, c } = useTema();
  const e = useEstilos(fabrica);
  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.columna}>
        <Text style={e.seccion}>Apariencia</Text>
        <View style={e.tarjeta}>
          {OPCIONES.map((o, i) => {
            const activa = o.valor === preferencia;
            return (
              <Pressable
                key={o.valor}
                accessibilityRole="radio"
                accessibilityState={{ selected: activa }}
                onPress={() => setPreferencia(o.valor)}
                style={[e.opcion, i > 0 && { borderTopWidth: 1, borderTopColor: c.borde }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={e.titulo}>{o.titulo}</Text>
                  <Text style={e.detalle}>{o.detalle}</Text>
                </View>
                <View style={[e.radio, activa && { borderColor: c.accion }]}>{activa && <View style={e.radioRelleno} />}</View>
              </Pressable>
            );
          })}
        </View>
        <Text style={e.seccion}>Acerca de</Text>
        <View style={[e.tarjeta, { padding: 16, gap: 4 }]}>
          <Text style={e.titulo}>Inventario de Patrimonio</Text>
          <Text style={e.detalle}>Versión {Constants.expoConfig?.version ?? '0.1.0'}</Text>
          <Text style={e.detalle}>Universidad Nacional de Salta</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 560, gap: 12 },
  seccion: { fontSize: 13, fontWeight: '700', color: c.suave, textTransform: 'uppercase', marginTop: 8 },
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, borderWidth: 1, borderColor: c.borde },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 64 },
  titulo: { fontSize: 16, fontWeight: '600', color: c.texto },
  detalle: { fontSize: 14, color: c.suave },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.borde, alignItems: 'center', justifyContent: 'center' },
  radioRelleno: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.accion },
});
