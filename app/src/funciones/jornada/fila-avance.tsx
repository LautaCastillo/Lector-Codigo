// Una fila de la lista de la jornada: el bien, quién lo relevó (y quién más lo vio) y los avisos que conviene revisar.
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { comunes } from '../../compartido/estilos';
import { fechaHora } from '../../compartido/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import type { FilaAvance } from '../../datos/jornadas';

/** `yo`: nombre de la cuenta, para escribir "vos" en lugar de repetirlo. `marcable`: se puede marcar a mano como encontrado. */
export function FilaDeAvance({ item, yo, marcable, alTocar }: { item: FilaAvance; yo: string; marcable: boolean; alTocar: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  return (
    <Pressable accessibilityRole="button" onPress={alTocar} style={({ pressed }) => [e.fila, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={e.numero}>{item.numeroInventario ?? item.codigoProvisorio ?? 'Sin número'}</Text>
        <Text style={e.descripcion} numberOfLines={2}>
          {item.descripcion ?? 'Sin descripción'}
        </Text>
        {item.tipo === 'esperado' && !item.encontrado && item.ubicacionFisica && <Text style={e.ayuda}>{item.ubicacionFisica}</Text>}
        {item.encontrado && item.relevador && (
          <Text style={e.ayuda}>
            Relevó {item.relevador === yo ? 'vos' : item.relevador}
            {item.relevadoEn ? ` · ${fechaHora(item.relevadoEn)}` : ''}
          </Text>
        )}
        {item.tambienVieron.length > 0 && <Text style={e.ayuda}>También lo vio {item.tambienVieron.map((n) => (n === yo ? 'vos' : n)).join(', ')}</Text>}
        {item.discrepancia && <Text style={e.alerta}>Revisar: las lecturas no coinciden (otro resultado u otra ubicación)</Text>}
        {item.fueraDeLugar && (
          <Text style={e.alerta}>
            Está en {item.ubicacionObservada}; el catálogo dice {item.ubicacionFisica ?? 'sin ubicación'}
          </Text>
        )}
        {item.tipo === 'extra' && item.areaResponsable && <Text style={e.alerta}>Pertenece a {item.areaResponsable}</Text>}
        {item.resultado === 'hallazgo' && <Text style={e.alerta}>Hallazgo: se registró durante esta jornada</Text>}
        {item.tipo === 'extra' && !item.bienId && item.resultado !== 'hallazgo' && <Text style={e.alerta}>No figura en el catálogo</Text>}
      </View>
      {marcable && <Ionicons name="checkmark-circle-outline" size={24} color={c.suave} />}
    </Pressable>
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.superficie, borderRadius: radio, padding: 14, borderWidth: 1, borderColor: c.borde },
  numero: { fontSize: 18, fontWeight: '800', color: c.titulo },
  descripcion: { fontSize: 15, color: c.texto },
  alerta: { fontSize: 13, fontWeight: '600', color: c.accion },
});
