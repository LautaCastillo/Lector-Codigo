import { Ionicons } from '@expo/vector-icons';
import { type ResultadoEscaneoDto } from '@patrimonio/shared';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Etiquetas } from '../../compartido/bien';
import { Boton } from '../../compartido/ui';
import { resolverEscaneo } from '../../datos/catalogo';
import { useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { mensajeDeError } from '../../compartido/formato';
import { PermisoCamara } from '../../compartido/permiso-camara';
import { useLector } from '../../compartido/useLector';

/** Tras "Escanear otro", el mismo código se ignora este tiempo: la cámara sigue viendo la etiqueta anterior. */
const IGNORAR_REPETIDO_MS = 2000;

type Estado =
  | { tipo: 'listo' }
  | { tipo: 'consultando' }
  | { tipo: 'resultado'; leido: string; simbologia: string; resultado: ResultadoEscaneoDto }
  | { tipo: 'error'; mensaje: string };

export default function Escanear() {
  return (
    <PermisoCamara>
      <PantallaEscaneo />
    </PermisoCamara>
  );
}

function PantallaEscaneo() {
  const router = useRouter();
  const { simbologias, tomar, liberar } = useLector();
  const [estado, setEstado] = useState<Estado>({ tipo: 'listo' });
  const [linterna, setLinterna] = useState(false);
  const { c } = useTema();
  const e = useEstilos(fabrica);
  const { width, height } = useWindowDimensions();
  // En horizontal o en pantallas anchas el panel de resultado va al costado.
  const lateral = width > height && width >= 600;

  const alLeer = useCallback(async ({ type: tipo, data }: BarcodeScanningResult) => {
    const type = tomar(tipo, data);
    if (!type) return;
    setEstado({ tipo: 'consultando' });
    try {
      const resultado = await resolverEscaneo(type, data);
      void Haptics.notificationAsync(
        resultado.encontrado ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      );
      setEstado({ tipo: 'resultado', leido: data, simbologia: type, resultado });
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setEstado({ tipo: 'error', mensaje: mensajeDeError(error, 'Error de red') });
    }
  }, [tomar]);

  const escanearOtro = () => {
    liberar(IGNORAR_REPETIDO_MS);
    setEstado({ tipo: 'listo' });
  };

  const registrar = (numero: string, simbologia: string, leido: string) =>
    router.push({ pathname: '/relevamiento/nuevo', params: { numero, simbologia, leido } });

  const verFicha = (numero: string) => router.push({ pathname: '/bien/[numero]', params: { numero } });

  const bien = estado.tipo === 'resultado' ? estado.resultado.bien : undefined;

  return (
    <View style={[e.contenedor, lateral && { flexDirection: 'row' }]}>
      <View style={{ flex: 1 }}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={linterna}
          barcodeScannerSettings={{ barcodeTypes: simbologias }}
          onBarcodeScanned={estado.tipo === 'listo' ? alLeer : undefined}
        />
        <View style={e.guia} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[e.marco, estado.tipo !== 'listo' && { borderColor: estado.tipo === 'resultado' && estado.resultado.encontrado ? c.ok : c.suave }]} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={linterna ? 'Apagar linterna' : 'Encender linterna'}
          accessibilityState={{ selected: linterna }}
          onPress={() => setLinterna((l) => !l)}
          style={[e.linterna, linterna && { backgroundColor: c.accion }]}
        >
          <Ionicons name={linterna ? 'flash' : 'flash-outline'} size={26} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={[e.panel, lateral && { width: 360 }]}>
        {estado.tipo === 'listo' && <Text style={e.texto}>Apuntá la cámara al código del bien.</Text>}
        {estado.tipo === 'consultando' && <ActivityIndicator size="large" color={c.accion} />}
        {estado.tipo === 'error' && (
          <>
            <Text style={e.error}>{estado.mensaje}</Text>
            <Boton texto="Reintentar" onPress={escanearOtro} />
          </>
        )}
        {estado.tipo === 'resultado' && bien && (
          <>
            <View style={e.resumen}>
              <Text style={e.rotulo}>Número patrimonial</Text>
              <Text style={e.numero} accessibilityLabel={`Número patrimonial ${bien.numeroInventario.split('').join(' ')}`}>
                {bien.numeroInventario}
              </Text>
              <Text style={e.descripcion} numberOfLines={3}>
                {bien.descripcion ?? 'Sin descripción'}
              </Text>
              {bien.ubicacionFisica && (
                <View style={e.ubicacion}>
                  <Ionicons name="location-outline" size={18} color={c.suave} />
                  <Text style={e.ubicacionTexto} numberOfLines={2}>
                    {bien.ubicacionFisica}
                  </Text>
                </View>
              )}
              <Etiquetas bien={bien} />
            </View>
            <Boton texto="Registrar relevamiento" onPress={() => registrar(bien.numeroInventario, estado.simbologia, estado.leido)} />
            <Boton texto="Ver ficha completa" variante="secundario" onPress={() => verFicha(bien.numeroInventario)} />
            <Boton texto="Escanear otro" variante="secundario" onPress={escanearOtro} />
          </>
        )}
        {estado.tipo === 'resultado' && !bien && (
          <>
            <Text style={e.titulo}>Bien no encontrado</Text>
            <Text style={e.texto}>Código leído: {estado.leido}</Text>
            <Boton texto="Buscar manualmente" onPress={() => router.push({ pathname: '/buscar', params: { q: estado.leido } })} />
            <Boton texto="Registrar hallazgo" variante="secundario" onPress={() => router.push({ pathname: '/hallazgo/nuevo', params: { simbologia: estado.simbologia, leido: estado.leido } })} />
            <Boton texto="Escanear otro" variante="secundario" onPress={escanearOtro} />
          </>
        )}
      </View>
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  contenedor: { flex: 1, backgroundColor: '#000000' },
  guia: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  marco: { width: '78%', maxWidth: 360, aspectRatio: 1.8, borderRadius: 16, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  linterna: { position: 'absolute', top: 16, right: 16, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  panel: { padding: 20, gap: 12, minHeight: 170, backgroundColor: c.superficie, justifyContent: 'center' },
  resumen: { gap: 4 },
  rotulo: { fontSize: 13, color: c.suave },
  numero: { fontSize: 30, fontWeight: '800', color: c.titulo, letterSpacing: 1 },
  descripcion: { fontSize: 16, color: c.texto },
  ubicacion: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ubicacionTexto: { flex: 1, fontSize: 14, color: c.suave },
  titulo: { fontSize: 22, fontWeight: '700', color: c.texto, textAlign: 'center' },
  texto: { fontSize: 16, color: c.texto, textAlign: 'center' },
  error: { fontSize: 16, color: c.error, textAlign: 'center' },
});
