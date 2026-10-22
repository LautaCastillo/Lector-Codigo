import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, BackHandler, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSesion } from '../lib/sesion';
import { radio, useEstilos, useTema, type Paleta } from '../lib/tema';
import { Logo } from './ui';

const ANCHO_MENU = 280;
/** Desde este ancho (tablet o PC) el menú queda fijo a la izquierda en lugar de deslizarse. */
const ANCHO_FIJO = 900;

type Ruta = '/' | '/escanear' | '/perfil' | '/ajustes';
interface Item {
  titulo: string;
  icono: keyof typeof Ionicons.glyphMap;
  ruta: Ruta;
}
const ITEMS: Item[] = [
  { titulo: 'Inicio', icono: 'home-outline', ruta: '/' },
  { titulo: 'Escanear', icono: 'scan-outline', ruta: '/escanear' },
  { titulo: 'Mi perfil', icono: 'person-outline', ruta: '/perfil' },
  { titulo: 'Ajustes', icono: 'settings-outline', ruta: '/ajustes' },
];

interface ContextoMenu {
  fijo: boolean;
  abrir: () => void;
}
const Contexto = createContext<ContextoMenu>({ fijo: false, abrir: () => undefined });
export const useMenu = () => useContext(Contexto);

/** Envuelve las pantallas con el menú lateral: fijo en pantallas anchas, deslizable en el celular. */
export function ConMenu({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const fijo = width >= ANCHO_FIJO;
  const [abierto, setAbierto] = useState(false);
  const progreso = useRef(new Animated.Value(0)).current;
  const e = useEstilos(fabrica);

  useEffect(() => {
    Animated.timing(progreso, { toValue: abierto ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [abierto, progreso]);

  useEffect(() => {
    if (!abierto) return;
    const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
      setAbierto(false);
      return true;
    });
    return () => suscripcion.remove();
  }, [abierto]);

  const cerrar = useCallback(() => setAbierto(false), []);
  const valor = useMemo(() => ({ fijo, abrir: () => setAbierto(true) }), [fijo]);

  if (fijo) {
    return (
      <Contexto.Provider value={valor}>
        <View style={e.fila}>
          <View style={[e.panel, { width: ANCHO_MENU }]}>
            <Panel alElegir={cerrar} />
          </View>
          <View style={{ flex: 1 }}>{children}</View>
        </View>
      </Contexto.Provider>
    );
  }

  return (
    <Contexto.Provider value={valor}>
      <View style={{ flex: 1 }}>
        {children}
        <Animated.View pointerEvents={abierto ? 'auto' : 'none'} style={[e.velo, { opacity: progreso }]}>
          <Pressable style={{ flex: 1 }} onPress={cerrar} accessibilityLabel="Cerrar menú" />
        </Animated.View>
        <Animated.View
          pointerEvents={abierto ? 'auto' : 'none'}
          style={[
            e.panel,
            e.deslizable,
            { width: ANCHO_MENU, transform: [{ translateX: progreso.interpolate({ inputRange: [0, 1], outputRange: [-ANCHO_MENU, 0] }) }] },
          ]}
        >
          <Panel alElegir={cerrar} />
        </Animated.View>
      </View>
    </Contexto.Provider>
  );
}

function Panel({ alElegir }: { alElegir: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const router = useRouter();
  const ruta = usePathname();
  const { perfil, cerrarSesion } = useSesion();
  const inicial = (perfil?.nombre ?? perfil?.cuenta ?? '?').trim().charAt(0).toUpperCase();

  const ir = (destino: Ruta) => {
    alElegir();
    if (destino !== ruta) router.navigate(destino);
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, flexGrow: 1 }}>
        <Logo ancho={170} />
        <View style={e.usuario}>
          <View style={e.avatar}>
            <Text style={e.avatarTexto}>{inicial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={e.nombre} numberOfLines={1}>
              {perfil?.nombre ?? 'Sin nombre'}
            </Text>
            <Text style={e.cuenta} numberOfLines={1}>
              {perfil?.cuenta}
            </Text>
          </View>
        </View>
        <View style={{ gap: 4 }}>
          {ITEMS.map((item) => {
            const activo = item.ruta === ruta;
            return (
              <Pressable
                key={item.ruta}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
                onPress={() => ir(item.ruta)}
                style={[e.item, activo && { backgroundColor: c.celeste }]}
              >
                <Ionicons name={item.icono} size={22} color={activo ? c.titulo : c.suave} />
                <Text style={[e.itemTexto, activo && { color: c.titulo, fontWeight: '700' }]}>{item.titulo}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            alElegir();
            void cerrarSesion();
          }}
          style={e.item}
        >
          <Ionicons name="log-out-outline" size={22} color={c.error} />
          <Text style={[e.itemTexto, { color: c.error }]}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const fabrica = (c: Paleta) => ({
  fila: { flex: 1, flexDirection: 'row' },
  panel: { backgroundColor: c.superficie, borderRightWidth: 1, borderRightColor: c.borde },
  deslizable: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  velo: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  usuario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radio,
    backgroundColor: c.fondo,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.primario, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: c.sobrePrimario, fontSize: 20, fontWeight: '800' },
  nombre: { fontSize: 16, fontWeight: '700', color: c.texto },
  cuenta: { fontSize: 13, color: c.suave },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, paddingHorizontal: 12, borderRadius: radio },
  itemTexto: { fontSize: 16, color: c.texto },
});
