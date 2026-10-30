import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Boton, Campo, Entrada, Logo } from '../../compartido/ui';
import { useSesion } from '../../sesion/sesion';
import { useEstilos, type Paleta } from '../../compartido/tema';

/** Inicio de sesión con correo y contraseña. No hay registro: las cuentas las crea un administrador. */
export default function Login() {
  const { iniciarSesion } = useSesion();
  const e = useEstilos(fabrica);
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const ingresar = async () => {
    setError(null);
    setEnviando(true);
    setError(await iniciarSesion(usuario, clave));
    setEnviando(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
        <View style={e.columna}>
          <Entrada>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Logo ancho={240} />
              <Text style={e.titulo}>Inventario de Patrimonio</Text>
              <Text style={e.subtitulo}>Ingresá con tu cuenta para relevar bienes.</Text>
            </View>
          </Entrada>
          <Entrada orden={1}>
            <View style={{ gap: 16 }}>
              <Campo
                etiqueta="Usuario o correo"
                value={usuario}
                onChangeText={setUsuario}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="username"
              />
              <Campo
                etiqueta="Contraseña"
                value={clave}
                onChangeText={setClave}
                secureTextEntry
                textContentType="password"
                autoComplete="password"
                onSubmitEditing={ingresar}
              />
              {error && <Text style={e.error}>{error}</Text>}
              <Boton texto="Ingresar" onPress={ingresar} cargando={enviando} deshabilitado={!usuario.trim() || !clave} />
            </View>
          </Entrada>
          <Entrada orden={2}>
            <View style={e.pie}>
              <Text style={e.subtitulo}>¿No tenés cuenta? Pedísela a un administrador de Patrimonio.</Text>
            </View>
          </Entrada>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  columna: { width: '100%', maxWidth: 440, gap: 32 },
  titulo: { fontSize: 24, fontWeight: '800', color: c.titulo, textAlign: 'center' },
  subtitulo: { fontSize: 15, color: c.suave, textAlign: 'center' },
  error: { color: c.error, fontSize: 15, textAlign: 'center' },
  pie: { alignItems: 'center', gap: 4 },
});
