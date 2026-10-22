import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { radio, useEstilos, useTema, type Paleta } from '../lib/tema';

export function Logo({ ancho = 220 }: { ancho?: number }) {
  const { esOscuro } = useTema();
  const imagen = (
    <Image
      source={require('../../assets/unsa-logo.png')}
      style={{ width: ancho, height: ancho * (320 / 1161) }}
      resizeMode="contain"
      accessibilityLabel="Universidad Nacional de Salta"
    />
  );
  // El logo es azul oscuro: en modo oscuro va sobre una base blanca para que se lea.
  return esOscuro ? (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>{imagen}</View>
  ) : (
    imagen
  );
}

interface BotonProps {
  texto: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario' | 'peligro';
  cargando?: boolean;
  deshabilitado?: boolean;
}

export function Boton({ texto, onPress, variante = 'primario', cargando, deshabilitado }: BotonProps) {
  const e = useEstilos(fabrica);
  const inactivo = deshabilitado || cargando;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={inactivo}
      onPress={onPress}
      style={({ pressed }) => [e.boton, e[variante], pressed && { opacity: 0.8 }, inactivo && { opacity: 0.5 }]}
    >
      {cargando ? (
        <ActivityIndicator color={variante === 'primario' ? '#FFFFFF' : undefined} />
      ) : (
        <Text style={[e.botonTexto, e[`${variante}Texto`]]}>{texto}</Text>
      )}
    </Pressable>
  );
}

/** Campo de texto. Si es de contraseña, trae el botón para mostrarla u ocultarla. */
export function Campo({ etiqueta, secureTextEntry, ...props }: { etiqueta: string } & TextInputProps) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={e.etiqueta}>{etiqueta}</Text>
      <View>
        <TextInput
          placeholderTextColor={c.suave}
          autoCapitalize="none"
          autoCorrect={false}
          style={[e.campo, secureTextEntry && { paddingRight: 52 }]}
          secureTextEntry={secureTextEntry && !visible}
          {...props}
        />
        {secureTextEntry && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            style={e.ojo}
          >
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={24} color={c.suave} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function Cargando({ texto }: { texto?: string }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  return (
    <View style={e.centro}>
      <ActivityIndicator size="large" color={c.accion} />
      {texto && <Text style={e.suave}>{texto}</Text>}
    </View>
  );
}

/** Aparición suave (opacidad y leve desplazamiento) con retraso escalonado. */
export function Entrada({ orden = 0, children }: { orden?: number; children: ReactNode }) {
  const progreso = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progreso, { toValue: 1, duration: 260, delay: orden * 50, useNativeDriver: true }).start();
  }, [progreso, orden]);
  return (
    <Animated.View
      style={{
        opacity: progreso,
        transform: [{ translateY: progreso.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

const fabrica = (c: Paleta) => ({
  boton: { minHeight: 52, borderRadius: radio, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primario: { backgroundColor: c.primario },
  secundario: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.accion },
  peligro: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.error },
  botonTexto: { fontSize: 16, fontWeight: '700' },
  primarioTexto: { color: c.sobrePrimario },
  secundarioTexto: { color: c.accion },
  peligroTexto: { color: c.error },
  etiqueta: { fontSize: 14, fontWeight: '600', color: c.texto },
  campo: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: c.borde,
    borderRadius: radio,
    paddingHorizontal: 14,
    fontSize: 16,
    color: c.texto,
    backgroundColor: c.superficie,
  },
  ojo: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 52, alignItems: 'center', justifyContent: 'center' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, backgroundColor: c.fondo },
  suave: { color: c.suave, fontSize: 15, textAlign: 'center' },
});
