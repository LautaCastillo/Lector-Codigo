import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, BackHandler, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listarJornadas } from '../datos/jornadas';
import { CUENTA, INICIO, SECCIONES, type Funcion, type Ruta } from './navegacion';
import { useSesion } from '../sesion/sesion';
import { radio, useEstilos, useTema, type Paleta } from './tema';
import { Logo } from './ui';

const ANCHO_MENU = 280;
/** Desde este ancho (tablet o PC) el menú queda fijo a la izquierda en lugar de deslizarse. */
const ANCHO_FIJO = 900;

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

  const [abiertasAdmin, setAbiertasAdmin] = useState<boolean | null>(null);
  const [jornadasAbiertas, setJornadasAbiertas] = useState(0);
  const esAdmin = perfil?.rol === 'administrador';

  // El punto junto a "Jornadas por área" avisa que hay alguna abierta; si falla la consulta simplemente no se muestra.
  useEffect(() => {
    let vigente = true;
    listarJornadas('abierta')
      .then((j) => vigente && setJornadasAbiertas(j.length))
      .catch(() => vigente && setJornadasAbiertas(0));
    return () => {
      vigente = false;
    };
  }, [ruta]);

  const ir = (destino: Ruta) => {
    alElegir();
    if (destino !== ruta) router.navigate(destino);
  };

  const fila = (item: Funcion) => {
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
        <Text style={[e.itemTexto, { flex: 1 }, activo && { color: c.titulo, fontWeight: '700' }]}>{item.titulo}</Text>
        {item.ruta === '/jornadas' && jornadasAbiertas > 0 && (
          <View style={e.insignia} accessibilityLabel={`${jornadasAbiertas} jornadas abiertas`}>
            <Text style={e.insigniaTexto}>{jornadasAbiertas}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}>
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
              {esAdmin ? 'Administrador' : 'Relevador'} · {perfil?.cuenta}
            </Text>
          </View>
        </View>
        {fila(INICIO)}
        {SECCIONES.filter((sec) => !sec.soloAdministrador || esAdmin).map((sec) => {
          // Administración se pliega; arranca desplegada solo si se está en una de sus pantallas.
          const plegable = !!sec.soloAdministrador;
          const desplegada = !plegable || (abiertasAdmin ?? sec.funciones.some((f) => f.ruta === ruta));
          return (
            <View key={sec.titulo} style={{ gap: 2 }}>
              <Pressable
                accessibilityRole={plegable ? 'button' : 'header'}
                disabled={!plegable}
                onPress={() => setAbiertasAdmin(!desplegada)}
                style={e.seccion}
              >
                <Text style={e.seccionTexto}>{sec.titulo}</Text>
                {plegable && <Ionicons name={desplegada ? 'chevron-up' : 'chevron-down'} size={16} color={c.suave} />}
              </Pressable>
              {desplegada && sec.funciones.map(fila)}
            </View>
          );
        })}
        <View style={{ flex: 1 }} />
        <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: c.borde, paddingTop: 10 }}>
          {CUENTA.map(fila)}
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
        </View>
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
  seccion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6 },
  seccionTexto: { fontSize: 12, fontWeight: '700', color: c.suave, textTransform: 'uppercase', letterSpacing: 0.6 },
  insignia: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: c.ok, alignItems: 'center', justifyContent: 'center' },
  insigniaTexto: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
});
