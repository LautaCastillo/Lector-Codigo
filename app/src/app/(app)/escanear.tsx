import { Ionicons } from '@expo/vector-icons';
import { esSimbologia, type ResultadoEscaneoDto, type Simbologia } from '@patrimonio/shared';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Etiquetas } from '../../components/bien';
import { Boton } from '../../components/ui';
import { enviarEscaneo, simbologiasHabilitadas } from '../../lib/api';
import { useEstilos, useTema, type Paleta } from '../../lib/tema';

/** Tras "Escanear otro", el mismo código se ignora este tiempo: la cámara sigue viendo la etiqueta anterior. */
const IGNORAR_REPETIDO_MS = 2000;

type Estado =
  | { tipo: 'listo' }
  | { tipo: 'consultando' }
  | { tipo: 'resultado'; leido: string; simbologia: string; resultado: ResultadoEscaneoDto }
  | { tipo: 'error'; mensaje: string };

export default function Escanear() {
  const router = useRouter();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [simbologias, setSimbologias] = useState<Simbologia[] | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: 'listo' });
  const [linterna, setLinterna] = useState(false);
  const { c } = useTema();
  const e = useEstilos(fabrica);
  const { width, height } = useWindowDimensions();
  // En horizontal o en pantallas anchas el panel de resultado va al costado.
  const lateral = width > height && width >= 600;
  // La cámara emite varias lecturas por segundo: este flag evita consultas duplicadas.
  const ocupado = useRef(false);
  const ultimo = useRef({ clave: '', hasta: 0 });

  useEffect(() => {
    simbologiasHabilitadas().then(setSimbologias);
  }, []);

  const alLeer = useCallback(async ({ type, data }: BarcodeScanningResult) => {
    const clave = `${type}:${data}`;
    if (ocupado.current || !esSimbologia(type)) return;
    if (clave === ultimo.current.clave && Date.now() < ultimo.current.hasta) return;
    ocupado.current = true;
    ultimo.current.clave = clave;
    setEstado({ tipo: 'consultando' });
    try {
      const resultado = await enviarEscaneo(type, data);
      void Haptics.notificationAsync(
        resultado.encontrado ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      );
      setEstado({ tipo: 'resultado', leido: data, simbologia: type, resultado });
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setEstado({ tipo: 'error', mensaje: error instanceof Error ? error.message : 'Error de red' });
    }
  }, []);

  const escanearOtro = () => {
    ultimo.current.hasta = Date.now() + IGNORAR_REPETIDO_MS;
    ocupado.current = false;
    setEstado({ tipo: 'listo' });
  };

  const registrar = (numero: string, simbologia: string, leido: string) =>
    router.push({ pathname: '/relevamiento/nuevo', params: { numero, simbologia, leido } });

  const verFicha = (numero: string) => router.push({ pathname: '/bien/[numero]', params: { numero } });

  if (!permiso) return <View style={e.centro} />;
  if (!permiso.granted) {
    return (
      <View style={e.centro}>
        <Text style={e.texto}>Se necesita acceso a la cámara para leer códigos.</Text>
        <Boton texto="Permitir cámara" onPress={pedirPermiso} />
      </View>
    );
  }

  const bien = estado.tipo === 'resultado' ? estado.resultado.bien : undefined;

  return (
    <View style={[e.contenedor, lateral && { flexDirection: 'row' }]}>
      <View style={{ flex: 1 }}>
        {simbologias && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={linterna}
            barcodeScannerSettings={{ barcodeTypes: simbologias }}
            onBarcodeScanned={estado.tipo === 'listo' ? alLeer : undefined}
          />
        )}
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
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: c.fondo },
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
