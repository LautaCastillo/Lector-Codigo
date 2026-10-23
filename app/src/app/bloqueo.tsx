import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Boton, Logo } from '../components/ui';
import { PanelPin } from '../components/pin';
import { useBloqueo } from '../lib/bloqueo';
import { useSesion } from '../lib/sesion';
import { useEstilos, useTema, type Paleta } from '../lib/tema';

/** Pantalla de desbloqueo: biometría si está activada, y siempre el PIN como respaldo. */
export default function Bloqueo() {
  const { desbloquearConPin, desbloquearConBiometria, biometriaActiva, intentosRestantes } = useBloqueo();
  const { cerrarSesion, perfil } = useSesion();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const intentoAutomatico = useRef(false);

  // Ofrece la biometría apenas aparece la pantalla, una sola vez.
  useEffect(() => {
    if (biometriaActiva && !intentoAutomatico.current) {
      intentoAutomatico.current = true;
      void desbloquearConBiometria();
    }
  }, [biometriaActiva, desbloquearConBiometria]);

  const probar = async (pin: string) => {
    const resultado = await desbloquearConPin(pin);
    if (resultado === 'ok' || resultado === 'sesion_cerrada') return null;
    return intentosRestantes - 1 > 0
      ? `PIN incorrecto. Te quedan ${intentosRestantes - 1} ${intentosRestantes - 1 === 1 ? 'intento' : 'intentos'}.`
      : 'PIN incorrecto.';
  };

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.columna}>
        <Logo ancho={180} />
        <Text style={e.titulo}>App bloqueada</Text>
        <Text style={e.texto}>{perfil?.nombre ?? perfil?.cuenta}. Ingresá tu PIN para continuar.</Text>
        <PanelPin alCompletar={probar} />
        {biometriaActiva && (
          <Pressable accessibilityRole="button" onPress={desbloquearConBiometria} style={e.biometria}>
            <Ionicons name="finger-print-outline" size={28} color={c.accion} />
            <Text style={e.biometriaTexto}>Usar huella o rostro</Text>
          </Pressable>
        )}
        <Boton texto="Cerrar sesión" variante="secundario" onPress={cerrarSesion} />
      </View>
    </ScrollView>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.fondo },
  columna: { width: '100%', maxWidth: 400, alignItems: 'center', gap: 16 },
  titulo: { fontSize: 22, fontWeight: '800', color: c.titulo, textAlign: 'center' },
  texto: { fontSize: 15, color: c.suave, textAlign: 'center' },
  biometria: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  biometriaTexto: { fontSize: 16, fontWeight: '600', color: c.accion },
});
