// Segundo paso del lote: cámara en ráfaga contra lo que el catálogo ubica en la ubicación, con aviso por cada lectura.
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Boton } from '../../compartido/ui';
import { resolverEscaneo } from '../../datos/catalogo';
import { agregarLectura, buscarEnEsperados, quitarItem, resumir, type ItemLote, type Lote, type Resolucion } from './lote';
import { useEstilos, useTema } from '../../compartido/tema';
import { PermisoCamara } from '../../compartido/permiso-camara';
import { useLector } from '../../compartido/useLector';
import { fabricaLote } from './estilos';
import { FilaItem } from './items';

/** Mientras la misma etiqueta siga a la vista no se vuelve a contar; recién cuenta de nuevo si se aleja y vuelve. */
const MS_MISMA_ETIQUETA = 3000;
const MS_AVISO = 2600;

interface Aviso {
  texto: string;
  tono: 'ok' | 'aviso' | 'error';
}

export function EscaneoLote(props: { lote: Lote; alCambiar: (l: Lote) => void; alTerminar: () => void }) {
  return (
    <PermisoCamara>
      <EscaneoDeLote {...props} />
    </PermisoCamara>
  );
}

function EscaneoDeLote({ lote, alCambiar, alTerminar }: { lote: Lote; alCambiar: (l: Lote) => void; alTerminar: () => void }) {
  const e = useEstilos(fabricaLote);
  const { c } = useTema();
  // Mientras la etiqueta siga a la vista se extiende la espera: solo cuenta al alejarse y volver.
  const { simbologias, tomar, liberar } = useLector({ ventanaMs: MS_MISMA_ETIQUETA, extender: true });
  const [linterna, setLinterna] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const { width, height } = useWindowDimensions();
  const lateral = width > height && width >= 600;
  // `loteRef` evita leer un lote viejo desde el callback de la cámara, que se crea una sola vez.
  const loteRef = useRef(lote);
  loteRef.current = lote;
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  const avisar = useCallback((nuevo: Aviso) => {
    setAviso(nuevo);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAviso(null), MS_AVISO);
  }, []);

  const alLeer = useCallback(
    async ({ type: tipo, data }: BarcodeScanningResult) => {
      const type = tomar(tipo, data);
      if (!type) return;
      try {
        const lectura = { simbologia: type, valor: data };
        // Primero contra lo esperado, sin red; solo lo desconocido se consulta al servidor.
        const local = buscarEnEsperados(loteRef.current, type, data);
        let resolucion: Resolucion;
        if (local) resolucion = { estado: 'encontrado', bien: local };
        else {
          try {
            const r = await resolverEscaneo(type, data);
            resolucion = r.encontrado && r.bien ? { estado: 'encontrado', bien: r.bien } : { estado: 'no_encontrado' };
          } catch {
            resolucion = { estado: 'sin_verificar' };
          }
        }
        const { lote: nuevo, repetido, item } = agregarLectura(loteRef.current, lectura, resolucion, Crypto.randomUUID);
        loteRef.current = nuevo;
        alCambiar(nuevo);
        if (repetido) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          avisar({ texto: `Ya escaneado (${item.veces} veces): ${item.bien?.numeroInventario ?? item.leido}`, tono: 'aviso' });
        } else if (item.estado === 'encontrado' && item.enEsperados) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          avisar({ texto: `${item.bien!.numeroInventario} · ${item.bien!.descripcion ?? 'Sin descripción'}`, tono: 'ok' });
        } else if (item.estado === 'encontrado') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          avisar({ texto: `${item.bien!.numeroInventario} figura en otra ubicación`, tono: 'aviso' });
        } else if (item.estado === 'sin_verificar') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          avisar({ texto: `Sin conexión: ${item.leido} queda sin verificar`, tono: 'aviso' });
        } else {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          avisar({ texto: `No está en el catálogo: ${item.leido}`, tono: 'error' });
        }
      } finally {
        liberar();
      }
    },
    [alCambiar, avisar, tomar, liberar],
  );

  const r = useMemo(() => resumir(lote), [lote]);

  const quitar = (item: ItemLote) =>
    Alert.alert('Quitar del lote', `${item.bien?.numeroInventario ?? item.leido}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => alCambiar(quitarItem(lote, item.clave)) },
    ]);

  const colorAviso = aviso?.tono === 'ok' ? c.ok : aviso?.tono === 'error' ? c.error : c.primario;

  return (
    <View style={[e.escaneo, lateral && { flexDirection: 'row' }]}>
      <View style={{ flex: 1 }}>
        <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={linterna} barcodeScannerSettings={{ barcodeTypes: simbologias }} onBarcodeScanned={alLeer} />
        <View style={e.guia} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={e.marco} />
        </View>
        <View style={e.contador} accessible accessibilityLabel={`${r.encontrados.length} de ${r.esperados} esperados encontrados`}>
          <Text style={e.contadorTexto}>
            {r.encontrados.length} / {r.esperados}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={linterna ? 'Apagar linterna' : 'Encender linterna'} onPress={() => setLinterna((l) => !l)} style={[e.linterna, linterna && { backgroundColor: c.accion }]}>
          <Ionicons name={linterna ? 'flash' : 'flash-outline'} size={26} color="#FFFFFF" />
        </Pressable>
        {aviso && (
          <View style={[e.aviso, { backgroundColor: colorAviso }]} accessibilityLiveRegion="polite">
            <Text style={e.avisoTexto} numberOfLines={2}>
              {aviso.texto}
            </Text>
          </View>
        )}
      </View>

      <View style={[e.panelLote, lateral && { width: 380 }]}>
        <View style={e.panelCabecera}>
          <View style={{ flex: 1 }}>
            <Text style={e.panelTitulo} numberOfLines={1}>
              {lote.ubicacion}
            </Text>
            <Text style={e.suave}>
              {lote.items.length} escaneado{lote.items.length === 1 ? '' : 's'} · {r.faltantes.length} falta{r.faltantes.length === 1 ? '' : 'n'}
            </Text>
          </View>
          <View style={{ width: 150 }}>
            <Boton texto="Terminar lote" onPress={alTerminar} />
          </View>
        </View>
        <FlatList
          data={lote.items}
          keyExtractor={(i) => i.clave}
          style={{ maxHeight: lateral ? undefined : Math.round(height * 0.32) }}
          ListEmptyComponent={<Text style={e.suave}>Apuntá la cámara a las etiquetas, una tras otra. Se cuentan solas.</Text>}
          renderItem={({ item }) => <FilaItem item={item} alQuitar={() => quitar(item)} />}
        />
      </View>
    </View>
  );
}
