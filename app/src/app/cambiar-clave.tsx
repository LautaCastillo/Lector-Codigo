import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Boton, Campo, Logo } from '../compartido/ui';
import { useSesion } from '../sesion/sesion';
import { useEstilos, type Paleta } from '../compartido/tema';

const LARGO_MINIMO = 8;

/** Primer ingreso (o contraseña restablecida por un administrador): hay que elegir una contraseña propia. */
export default function CambiarClave() {
  const { perfil, cambiarClave, cerrarSesion } = useSesion();
  const e = useEstilos(fabrica);
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const guardar = async () => {
    setError(null);
    if (clave.length < LARGO_MINIMO) return setError(`Debe tener al menos ${LARGO_MINIMO} caracteres.`);
    if (clave !== repetida) return setError('Las contraseñas no coinciden.');
    setEnviando(true);
    const fallo = await cambiarClave(clave);
    // Si salió bien, el perfil se recarga y la app deja esta pantalla sola.
    if (fallo) setError(fallo);
    setEnviando(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
        <View style={e.columna}>
          <Logo ancho={200} />
          <Text style={e.titulo}>Elegí tu contraseña</Text>
          <Text style={e.texto}>
            {perfil?.nombre ? `${perfil.nombre}, ` : ''}la contraseña que te dieron es temporal. Elegí una propia para seguir.
          </Text>
          <View style={{ gap: 16, alignSelf: 'stretch' }}>
            <Campo etiqueta="Contraseña nueva" value={clave} onChangeText={setClave} secureTextEntry textContentType="newPassword" />
            <Campo
              etiqueta="Repetir contraseña"
              value={repetida}
              onChangeText={setRepetida}
              secureTextEntry
              textContentType="newPassword"
              onSubmitEditing={guardar}
            />
            {error && <Text style={e.error}>{error}</Text>}
            <Boton texto="Guardar y continuar" onPress={guardar} cargando={enviando} deshabilitado={!clave || !repetida} />
            <Boton texto="Cerrar sesión" variante="secundario" onPress={cerrarSesion} deshabilitado={enviando} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.fondo },
  columna: { width: '100%', maxWidth: 440, alignItems: 'center', gap: 18 },
  titulo: { fontSize: 22, fontWeight: '800', color: c.titulo, textAlign: 'center' },
  texto: { fontSize: 15, color: c.suave, textAlign: 'center' },
  error: { color: c.error, fontSize: 15, textAlign: 'center' },
});
