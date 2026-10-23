import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Boton, Campo, Entrada, Logo } from '../../components/ui';
import { useSesion } from '../../lib/sesion';
import { useEstilos, type Paleta } from '../../lib/tema';

const LARGO_MINIMO = 8;

export default function Registro() {
  const { registrar } = useSesion();
  const e = useEstilos(fabrica);
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const validar = () => {
    if (nombre.trim().length < 3) return 'Ingresá tu nombre y apellido.';
    if (!/^\S+@\S+\.\S+$/.test(correo.trim())) return 'Ingresá un correo válido.';
    if (clave.length < LARGO_MINIMO) return `La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.`;
    if (clave !== repetida) return 'Las contraseñas no coinciden.';
    return null;
  };

  const crear = async () => {
    setAviso(null);
    const invalido = validar();
    setError(invalido);
    if (invalido) return;
    setEnviando(true);
    const resultado = await registrar(nombre, correo, clave);
    setEnviando(false);
    if (resultado.error) setError(resultado.error);
    else if (resultado.confirmar) {
      setAviso('Te enviamos un correo para confirmar la cuenta. Después un administrador la va a aprobar.');
    }
    // Sin confirmación de correo la sesión se abre sola y se muestra "cuenta pendiente de aprobación".
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
        <View style={e.columna}>
          <Entrada>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Logo ancho={200} />
              <Text style={e.titulo}>Crear cuenta</Text>
              <Text style={e.subtitulo}>
                Un administrador de Patrimonio debe aprobar tu cuenta antes de que puedas usar la app.
              </Text>
            </View>
          </Entrada>
          <Entrada orden={1}>
            <View style={{ gap: 16 }}>
              <Campo etiqueta="Nombre y apellido" value={nombre} onChangeText={setNombre} autoCapitalize="words" autoComplete="name" />
              <Campo etiqueta="Correo electrónico" value={correo} onChangeText={setCorreo} keyboardType="email-address" autoComplete="email" />
              <Campo etiqueta="Contraseña" value={clave} onChangeText={setClave} secureTextEntry textContentType="newPassword" />
              <Campo etiqueta="Repetir contraseña" value={repetida} onChangeText={setRepetida} secureTextEntry textContentType="newPassword" onSubmitEditing={crear} />
              {error && <Text style={e.error}>{error}</Text>}
              {aviso && <Text style={e.aviso}>{aviso}</Text>}
              <Boton texto="Crear cuenta" onPress={crear} cargando={enviando} />
            </View>
          </Entrada>
          <Entrada orden={2}>
            <View style={e.pie}>
              <Text style={e.subtitulo}>¿Ya tenés cuenta?</Text>
              <Link href="/login" replace style={e.enlace}>
                Ingresar
              </Link>
            </View>
          </Entrada>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  columna: { width: '100%', maxWidth: 440, gap: 28 },
  titulo: { fontSize: 24, fontWeight: '800', color: c.titulo, textAlign: 'center' },
  subtitulo: { fontSize: 15, color: c.suave, textAlign: 'center' },
  error: { color: c.error, fontSize: 15, textAlign: 'center' },
  aviso: { color: c.ok, fontSize: 15, textAlign: 'center' },
  pie: { alignItems: 'center', gap: 4 },
  enlace: { color: c.accion, fontSize: 16, fontWeight: '700', paddingVertical: 8 },
});
