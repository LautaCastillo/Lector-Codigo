import type { Rol } from '@patrimonio/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Credenciales } from '../../components/credenciales';
import { Boton, Campo } from '../../components/ui';
import { crearCuenta, type CuentaCreada } from '../../lib/api';
import { useEstilos, useTema, type Paleta } from '../../lib/tema';

const ROLES: { valor: Rol; titulo: string; detalle: string }[] = [
  { valor: 'relevador', titulo: 'Relevador', detalle: 'Escanea, relevó y exporta lo suyo' },
  { valor: 'administrador', titulo: 'Administrador', detalle: 'Además gestiona cuentas y ve la actividad' },
];

/** Solo administradores. La cuenta se crea con una contraseña temporal que se muestra una sola vez. */
export default function CuentaNueva() {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [rol, setRol] = useState<Rol>('relevador');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [creada, setCreada] = useState<CuentaCreada | null>(null);

  const crear = async () => {
    setError(null);
    setEnviando(true);
    try {
      setCreada(await crearCuenta(usuario, nombre.trim(), rol));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    }
    setEnviando(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
        <View style={e.columna}>
          {creada ? (
            <Credenciales cuenta={creada.cuenta} clave={creada.claveTemporal} titulo="Cuenta creada" alCerrar={() => router.back()} />
          ) : (
            <>
              <Campo etiqueta="Nombre y apellido" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
              <Campo etiqueta="Usuario o correo" value={usuario} onChangeText={setUsuario} keyboardType="email-address" />
              <Text style={e.ayuda}>
                Con el nombre de usuario (por ejemplo mperez) la persona ingresa sin correo. Usá 3 a 30 letras, números, puntos o guiones.
              </Text>

              <Text style={e.etiqueta}>Rol</Text>
              {ROLES.map((r) => {
                const activo = r.valor === rol;
                return (
                  <Pressable
                    key={r.valor}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: activo }}
                    onPress={() => setRol(r.valor)}
                    style={[e.opcion, activo && { borderColor: c.accion }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={e.opcionTitulo}>{r.titulo}</Text>
                      <Text style={e.ayuda}>{r.detalle}</Text>
                    </View>
                    <View style={[e.radio, activo && { borderColor: c.accion }]}>{activo && <View style={e.radioRelleno} />}</View>
                  </Pressable>
                );
              })}

              {error && <Text style={e.error}>{error}</Text>}
              <Boton texto="Crear cuenta" onPress={crear} cargando={enviando} deshabilitado={nombre.trim().length < 3 || usuario.trim().length < 3} />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 560, gap: 14 },
  etiqueta: { fontSize: 14, fontWeight: '600', color: c.texto },
  ayuda: { fontSize: 14, color: c.suave },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: c.borde, backgroundColor: c.superficie },
  opcionTitulo: { fontSize: 16, fontWeight: '600', color: c.texto },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.borde, alignItems: 'center', justifyContent: 'center' },
  radioRelleno: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.accion },
  error: { fontSize: 15, color: c.error },
});
