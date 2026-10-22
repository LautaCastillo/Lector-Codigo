import { esSimbologia, type ResultadoEscaneoDto, type Simbologia } from '@patrimonio/shared';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native';
import { Boton } from '../../components/ui';
import { enviarEscaneo, simbologiasHabilitadas } from '../../lib/api';
import { useEstilos, useTema, type Paleta } from '../../lib/tema';

type Estado =
  | { tipo: 'listo' }
  | { tipo: 'consultando' }
  | { tipo: 'resultado'; leido: string; resultado: ResultadoEscaneoDto }
  | { tipo: 'error'; mensaje: string };

export default function Escanear() {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [simbologias, setSimbologias] = useState<Simbologia[] | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: 'listo' });
  const { c } = useTema();
  const e = useEstilos(fabrica);
  const { width, height } = useWindowDimensions();
  // En horizontal o en pantallas anchas el panel de resultado va al costado.
  const lateral = width > height && width >= 600;
  // La cámara emite varias lecturas por segundo: este flag evita consultas duplicadas.
  const ocupado = useRef(false);

  useEffect(() => {
    simbologiasHabilitadas().then(setSimbologias);
  }, []);

  const alLeer = useCallback(async ({ type, data }: BarcodeScanningResult) => {
    if (ocupado.current || !esSimbologia(type)) return;
    ocupado.current = true;
    setEstado({ tipo: 'consultando' });
    try {
      setEstado({ tipo: 'resultado', leido: data, resultado: await enviarEscaneo(type, data) });
    } catch (error) {
      setEstado({ tipo: 'error', mensaje: error instanceof Error ? error.message : 'Error de red' });
    }
  }, []);

  const escanearOtro = () => {
    ocupado.current = false;
    setEstado({ tipo: 'listo' });
  };

  if (!permiso) return <View style={e.centro} />;
  if (!permiso.granted) {
    return (
      <View style={e.centro}>
        <Text style={e.texto}>Se necesita acceso a la cámara para leer códigos.</Text>
        <Boton texto="Permitir cámara" onPress={pedirPermiso} />
      </View>
    );
  }

  return (
    <View style={[e.contenedor, lateral && { flexDirection: 'row' }]}>
      {simbologias && (
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: simbologias }}
          onBarcodeScanned={estado.tipo === 'listo' ? alLeer : undefined}
        />
      )}
      <View style={[e.panel, lateral && { width: 340 }]}>
        {estado.tipo === 'listo' && <Text style={e.texto}>Apuntá la cámara al código del bien.</Text>}
        {estado.tipo === 'consultando' && <ActivityIndicator size="large" color={c.accion} />}
        {estado.tipo === 'error' && (
          <>
            <Text style={e.error}>{estado.mensaje}</Text>
            <Boton texto="Reintentar" onPress={escanearOtro} />
          </>
        )}
        {estado.tipo === 'resultado' && (
          <>
            {estado.resultado.encontrado && estado.resultado.bien ? (
              <>
                <Text style={e.titulo}>N.º {estado.resultado.bien.numeroInventario}</Text>
                <Text style={e.texto}>{estado.resultado.bien.descripcion ?? 'Sin descripción'}</Text>
              </>
            ) : (
              <>
                <Text style={e.titulo}>Bien no encontrado</Text>
                <Text style={e.texto}>Código leído: {estado.leido}</Text>
              </>
            )}
            <Boton texto="Escanear otro" onPress={escanearOtro} />
          </>
        )}
      </View>
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  contenedor: { flex: 1, backgroundColor: '#000000' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: c.fondo },
  panel: { padding: 20, gap: 12, minHeight: 170, backgroundColor: c.superficie, justifyContent: 'center' },
  titulo: { fontSize: 22, fontWeight: '700', color: c.texto, textAlign: 'center' },
  texto: { fontSize: 16, color: c.texto, textAlign: 'center' },
  error: { fontSize: 16, color: c.error, textAlign: 'center' },
});
