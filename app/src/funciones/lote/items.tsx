// Cómo se muestra cada lectura del lote: etiquetas de estado y fila con su número, descripción y acción de quitar.
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { type ItemLote } from './lote';
import { useEstilos, useTema } from '../../compartido/tema';
import { fabricaLote } from './estilos';

function Etiqueta({ item }: { item: ItemLote }) {
  const e = useEstilos(fabricaLote);
  const { c } = useTema();
  const texto =
    item.estado === 'no_encontrado' ? 'No está en el catálogo' : item.estado === 'sin_verificar' ? 'Sin verificar' : item.enEsperados ? null : 'Otra ubicación';
  if (!texto) return null;
  const fondo = item.estado === 'no_encontrado' ? c.error : item.estado === 'sin_verificar' ? c.suave : c.primario;
  return (
    <View style={[e.etiqueta, { backgroundColor: fondo }]}>
      <Text style={e.etiquetaTexto}>{texto}</Text>
    </View>
  );
}

export function FilaItem({ item, alQuitar }: { item: ItemLote; alQuitar?: () => void }) {
  const e = useEstilos(fabricaLote);
  const { c } = useTema();
  const ok = item.estado === 'encontrado' && item.enEsperados;
  return (
    <View style={e.item}>
      <Ionicons name={ok ? 'checkmark-circle' : item.estado === 'encontrado' ? 'swap-horizontal' : 'help-circle'} size={24} color={ok ? c.ok : item.estado === 'no_encontrado' ? c.error : c.suave} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={e.itemNumero}>{item.bien?.numeroInventario ?? item.leido}</Text>
        {item.bien && (
          <Text style={e.suave} numberOfLines={1}>
            {item.bien.descripcion ?? 'Sin descripción'}
          </Text>
        )}
        <View style={e.etiquetasFila}>
          <Etiqueta item={item} />
          {item.veces > 1 && (
            <View style={[e.etiqueta, { backgroundColor: c.accion }]}>
              <Text style={e.etiquetaTexto}>Repetido ×{item.veces}</Text>
            </View>
          )}
        </View>
      </View>
      {alQuitar && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${item.bien?.numeroInventario ?? item.leido}`} onPress={alQuitar} hitSlop={10} style={e.quitar}>
          <Ionicons name="trash-outline" size={22} color={c.suave} />
        </Pressable>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ resumen */
