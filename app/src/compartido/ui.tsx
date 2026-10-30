// Componentes básicos de la interfaz: logo, botón, campo de texto, opciones (pestañas y chips) con la paleta de la UNSa.
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
import { radio, useEstilos, useTema, type Paleta } from './tema';

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

/** 'pestana': pestañas y filtros; 'chico': filtros dentro de una lista; 'grande': opciones de un formulario (más fáciles de tocar). */
export type TamanoChip = 'pestana' | 'chico' | 'grande';

/** Opción tocable con forma de píldora, resaltada cuando está elegida. */
export function Chip({ texto, activo, alTocar, rol = 'button', tamano = 'chico' }: { texto: string; activo: boolean; alTocar: () => void; rol?: 'button' | 'tab' | 'radio'; tamano?: TamanoChip }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  return (
    <Pressable
      accessibilityRole={rol}
      accessibilityState={{ selected: activo }}
      onPress={alTocar}
      style={[e.chip, e[`chip_${tamano}`], activo && { backgroundColor: c.primario, borderColor: c.primario }]}
    >
      <Text style={[e.chipTexto, e[`chipTexto_${tamano}`], activo && { color: c.sobrePrimario }]} numberOfLines={1}>
        {texto}
      </Text>
    </Pressable>
  );
}

/** Una fila de `Chip` para elegir una opción entre varias: pestañas, filtros o una respuesta de formulario. */
export function Opciones<T extends string>({
  opciones,
  actual,
  alElegir,
  rol = 'tab',
  tamano = 'pestana',
}: {
  opciones: { clave: T; titulo: string }[];
  actual: T | null;
  alElegir: (clave: T) => void;
  rol?: 'tab' | 'radio';
  tamano?: TamanoChip;
}) {
  const e = useEstilos(fabrica);
  return (
    <View style={e.opciones}>
      {opciones.map((o) => (
        <Chip key={o.clave} texto={o.titulo} activo={actual === o.clave} alTocar={() => alElegir(o.clave)} rol={rol} tamano={tamano} />
      ))}
    </View>
  );
}

/** Estado de una carga: el error con su botón "Reintentar" o, mientras llegan los datos, un spinner. No muestra nada si ya hay datos. */
export function EstadoCarga({ error, cargando, alReintentar, grande }: { error: string | null; cargando: boolean; alReintentar: () => void; grande?: boolean }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  if (error) {
    return (
      <View style={{ gap: 10 }}>
        <Text style={e.errorTexto}>{error}</Text>
        <Boton texto="Reintentar" variante="secundario" onPress={alReintentar} />
      </View>
    );
  }
  return cargando ? <ActivityIndicator size={grande ? 'large' : 'small'} color={c.accion} /> : null;
}

/** Barra de avance: `porcentaje` de 0 a 100. */
export function Barra({ porcentaje, alto = 8 }: { porcentaje: number; alto?: number }) {
  const { c } = useTema();
  return (
    <View style={{ height: alto, borderRadius: alto / 2, backgroundColor: c.borde, overflow: 'hidden' }}>
      <View style={{ height: alto, width: `${Math.min(100, Math.max(0, porcentaje))}%`, backgroundColor: c.ok }} />
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
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderColor: c.borde, backgroundColor: c.superficie },
  chip_pestana: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1 },
  chip_chico: { maxWidth: 260, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  chip_grande: { minHeight: 48, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  chipTexto: { fontWeight: '600', color: c.texto },
  chipTexto_pestana: { fontSize: 15 },
  chipTexto_chico: { fontSize: 14 },
  chipTexto_grande: { fontSize: 15 },
  errorTexto: { fontSize: 15, color: c.error },
  ojo: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 52, alignItems: 'center', justifyContent: 'center' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, backgroundColor: c.fondo },
  suave: { color: c.suave, fontSize: 15, textAlign: 'center' },
});
