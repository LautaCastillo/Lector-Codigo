import { Ionicons } from '@expo/vector-icons';
import type { BienDto } from '@patrimonio/shared';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ETIQUETA_CODIGO, ETIQUETA_RESULTADO, tonoEstado } from '../lib/formato';
import { radio, useEstilos, useTema, type Paleta } from '../lib/tema';

/** Estado del bien (y del código, si no se puede leer) como etiquetas con texto y color. */
export function Etiquetas({ bien }: { bien: Pick<BienDto, 'estadoBien' | 'estadoCodigo'> }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const tono = tonoEstado(bien.estadoBien);
  const fondo = tono === 'bueno' ? c.ok : tono === 'malo' ? c.error : c.suave;
  return (
    <View style={e.etiquetas}>
      {bien.estadoBien && (
        <View style={[e.etiqueta, { backgroundColor: fondo }]}>
          <Text style={e.etiquetaTexto}>{bien.estadoBien}</Text>
        </View>
      )}
      {bien.estadoCodigo !== 'legible' && (
        <View style={[e.etiqueta, { backgroundColor: c.primario }]}>
          <Text style={e.etiquetaTexto}>{ETIQUETA_CODIGO[bien.estadoCodigo] ?? bien.estadoCodigo}</Text>
        </View>
      )}
    </View>
  );
}

/** Resultado de un relevamiento como etiqueta con texto y color. */
export function ChipResultado({ resultado }: { resultado: string }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const fondo = resultado === 'encontrado' ? c.ok : resultado === 'no_encontrado' ? c.error : c.suave;
  return (
    <View style={[e.etiqueta, { backgroundColor: fondo, alignSelf: 'flex-start' }]}>
      <Text style={e.etiquetaTexto}>{ETIQUETA_RESULTADO[resultado] ?? resultado}</Text>
    </View>
  );
}

/** Sección con título que se puede plegar. */
export function Seccion({ titulo, inicialAbierta = true, resumen, children }: { titulo: string; inicialAbierta?: boolean; resumen?: string; children: ReactNode }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [abierta, setAbierta] = useState(inicialAbierta);
  return (
    <View style={e.seccion}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: abierta }}
        accessibilityLabel={`${titulo}, ${abierta ? 'desplegada' : 'plegada'}`}
        onPress={() => setAbierta((a) => !a)}
        style={e.seccionCabecera}
      >
        <View style={{ flex: 1 }}>
          <Text style={e.seccionTitulo}>{titulo}</Text>
          {!abierta && resumen && <Text style={e.seccionResumen}>{resumen}</Text>}
        </View>
        <Ionicons name={abierta ? 'chevron-up' : 'chevron-down'} size={22} color={c.suave} />
      </Pressable>
      {abierta && <View style={e.seccionCuerpo}>{children}</View>}
    </View>
  );
}

/** Par etiqueta y valor. Con `valor` vacío muestra un guion, para que se vea que el dato no existe. */
export function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  const e = useEstilos(fabrica);
  return (
    <View style={e.dato} accessible accessibilityLabel={`${etiqueta}: ${valor || 'sin dato'}`}>
      <Text style={e.datoEtiqueta}>{etiqueta}</Text>
      <Text style={[e.datoValor, !valor && { color: e.datoEtiqueta.color }]} selectable>
        {valor || '—'}
      </Text>
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  etiqueta: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  etiquetaTexto: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  seccion: { backgroundColor: c.superficie, borderRadius: radio, borderWidth: 1, borderColor: c.borde, overflow: 'hidden' },
  seccionCabecera: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 56 },
  seccionTitulo: { fontSize: 16, fontWeight: '700', color: c.titulo },
  seccionResumen: { fontSize: 13, color: c.suave },
  seccionCuerpo: { paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  dato: { gap: 2 },
  datoEtiqueta: { fontSize: 13, color: c.suave },
  datoValor: { fontSize: 16, color: c.texto },
});
