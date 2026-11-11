// Avisos en la app: mantiene la cuenta de los no leídos y muestra un cartel cuando llega uno nuevo mientras la app está abierta;
// la campana del encabezado muestra la cuenta. No usa notificaciones del teléfono: los avisos se ven con la app abierta.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { contarAvisosSinLeer, suscribirseAAvisos, type Aviso } from '../../datos/avisos';
import { useSesion } from '../../sesion/sesion';

const CARTEL_MS = 6000;

interface Estado {
  sinLeer: number;
  /** El último aviso que llegó con la app abierta, mientras se muestra el cartel. */
  cartel: Aviso | null;
}
let estado: Estado = { sinLeer: 0, cartel: null };
const oyentes = new Set<() => void>();
const cambiar = (parcial: Partial<Estado>) => {
  estado = { ...estado, ...parcial };
  oyentes.forEach((f) => f());
};
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
};

/** Cuántos avisos faltan leer. */
export const useAvisosSinLeer = () => useSyncExternalStore(suscribir, () => estado.sinLeer);

/** La pantalla de avisos avisa cuántos quedan sin leer después de marcar. */
export const fijarAvisosSinLeer = (n: number) => cambiar({ sinLeer: Math.max(0, n) });

/** Se monta una vez en la zona con sesión: carga la cuenta, escucha los avisos nuevos y los muestra en un cartel. */
export function AvisosEnVivo() {
  const { sesion } = useSesion();
  const router = useRouter();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const insets = useSafeAreaInsets();
  const cartel = useSyncExternalStore(suscribir, () => estado.cartel);
  const cuenta = sesion?.user.id ?? null;

  useEffect(() => {
    if (!cuenta) return;
    const recontar = () => contarAvisosSinLeer().then((n) => cambiar({ sinLeer: n })).catch(() => undefined);
    void recontar();
    const baja = suscribirseAAvisos((aviso) => {
      cambiar({ sinLeer: estado.sinLeer + 1, cartel: aviso });
    });
    // Al volver a la app se vuelve a contar: pudo llegar algo mientras estaba en segundo plano.
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') void recontar();
    });
    return () => {
      baja();
      app.remove();
      cambiar({ sinLeer: 0, cartel: null });
    };
  }, [cuenta]);

  useEffect(() => {
    if (!cartel) return;
    const t = setTimeout(() => cambiar({ cartel: null }), CARTEL_MS);
    return () => clearTimeout(t);
  }, [cartel]);

  if (!cartel) return null;
  return (
    <View style={[e.cartelFuera, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="alert"
        accessibilityLabel={`${cartel.titulo}. ${cartel.detalle ?? ''}`}
        onPress={() => {
          cambiar({ cartel: null });
          router.navigate('/avisos');
        }}
        style={e.cartel}
      >
        <Ionicons name="notifications" size={22} color={c.sobrePrimario} />
        <View style={{ flex: 1 }}>
          <Text style={e.cartelTitulo}>{cartel.titulo}</Text>
          {cartel.detalle && (
            <Text style={e.cartelDetalle} numberOfLines={2}>
              {cartel.detalle}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

/** La campana del encabezado, con la cuenta de avisos sin leer. */
export function CampanaDeAvisos() {
  const e = useEstilos(fabrica);
  const router = useRouter();
  const { c } = useTema();
  const sinLeer = useAvisosSinLeer();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={sinLeer ? `Avisos, ${sinLeer} sin leer` : 'Avisos'} onPress={() => router.navigate('/avisos')} hitSlop={8} style={e.campana}>
      <Ionicons name={sinLeer ? 'notifications' : 'notifications-outline'} size={24} color={sinLeer ? c.accion : c.suave} />
      {sinLeer > 0 && (
        <View style={e.insignia}>
          <Text style={e.insigniaTexto}>{sinLeer > 9 ? '9+' : sinLeer}</Text>
        </View>
      )}
    </Pressable>
  );
}

const fabrica = (c: Paleta) => ({
  cartelFuera: { position: 'absolute', left: 12, right: 12, zIndex: 50 },
  cartel: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radio, backgroundColor: c.primario, elevation: 6, shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  cartelTitulo: { fontSize: 15, fontWeight: '800', color: c.sobrePrimario },
  cartelDetalle: { fontSize: 13, color: c.celeste },
  campana: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  insignia: { position: 'absolute', top: 0, right: 0, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: c.accion, alignItems: 'center', justifyContent: 'center' },
  insigniaTexto: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
});
