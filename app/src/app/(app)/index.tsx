import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMenu } from '../../components/menu';
import { Entrada, Logo } from '../../components/ui';
import { useSesion } from '../../lib/sesion';
import { radio, useEstilos, useTema, type Paleta } from '../../lib/tema';

interface Funcion {
  titulo: string;
  detalle: string;
  icono: keyof typeof Ionicons.glyphMap;
  ruta?: '/escanear' | '/buscar' | '/lote';
}

// Las funciones sin ruta todavía no existen: se muestran para ver el recorrido completo y quedan deshabilitadas.
const FUNCIONES: Funcion[] = [
  { titulo: 'Escanear', detalle: 'Leer el código de un bien', icono: 'scan-outline', ruta: '/escanear' },
  { titulo: 'Lote por ubicación', detalle: 'Escanear en ráfaga', icono: 'albums-outline', ruta: '/lote' },
  { titulo: 'Mis relevamientos', detalle: 'Historial de escaneos', icono: 'time-outline' },
  { titulo: 'Buscar bienes', detalle: 'Por número o descripción', icono: 'search-outline', ruta: '/buscar' },
  { titulo: 'Nuevo bien', detalle: 'Sin código o dañado', icono: 'add-circle-outline' },
  { titulo: 'Pendientes', detalle: 'Cambios sin sincronizar', icono: 'sync-outline' },
  { titulo: 'Exportar', detalle: 'PDF o CSV con filtros', icono: 'download-outline' },
];

const SEPARACION = 14;
const MARGEN = 20;
const ANCHO_MAXIMO = 1000;

export default function Inicio() {
  const router = useRouter();
  const { perfil } = useSesion();
  const { c } = useTema();
  const { fijo, abrir } = useMenu();
  const { width } = useWindowDimensions();
  const e = useEstilos(fabrica);
  const nombre = perfil?.nombre?.split(' ')[0] ?? perfil?.cuenta;

  // Las tarjetas se reparten el ancho disponible: 2 columnas en celular, más en pantallas anchas.
  const disponible = Math.min(width - (fijo ? 280 : 0) - MARGEN * 2, ANCHO_MAXIMO);
  const columnas = disponible >= 720 ? 4 : disponible >= 480 ? 3 : 2;
  const ancho = Math.floor((disponible - SEPARACION * (columnas - 1)) / columnas);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.superficie }} edges={['top']}>
      <View style={e.cabecera}>
        {!fijo && (
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir menú" onPress={abrir} hitSlop={8}>
            <Ionicons name="menu" size={30} color={c.titulo} />
          </Pressable>
        )}
        <Logo ancho={fijo ? 190 : 150} />
      </View>
      <ScrollView style={{ flex: 1, backgroundColor: c.fondo }} contentContainerStyle={{ padding: MARGEN, alignItems: 'center' }}>
        <View style={{ width: disponible, gap: 20 }}>
          <Entrada>
            <View style={{ gap: 4 }}>
              <Text style={e.saludo}>Hola, {nombre}</Text>
              <Text style={e.suave}>
                {perfil?.rol === 'administrador' ? 'Administrador' : 'Relevador'} · Dirección de Patrimonio
              </Text>
            </View>
          </Entrada>
          <View style={e.grilla}>
            {FUNCIONES.map((f, i) => (
              <Entrada key={f.titulo} orden={i + 1}>
                <Tarjeta ancho={ancho} funcion={f} onPress={f.ruta ? () => router.push(f.ruta!) : undefined} />
              </Entrada>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tarjeta({ funcion, ancho, onPress }: { funcion: Funcion; ancho: number; onPress?: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const activa = !!onPress;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !activa }}
      disabled={!activa}
      onPress={onPress}
      style={({ pressed }) => [
        e.tarjeta,
        { width: ancho },
        activa ? { backgroundColor: c.primario } : { backgroundColor: c.superficie, borderWidth: 1, borderColor: c.borde },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons name={funcion.icono} size={30} color={activa ? c.sobrePrimario : c.suave} />
      <View style={{ gap: 2 }}>
        <Text style={[e.tarjetaTitulo, !activa && { color: c.texto }]}>{funcion.titulo}</Text>
        <Text style={[e.tarjetaDetalle, !activa && { color: c.suave }]}>{activa ? funcion.detalle : 'Próximamente'}</Text>
      </View>
    </Pressable>
  );
}

const fabrica = (c: Paleta) => ({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: MARGEN, paddingVertical: 10 },
  saludo: { fontSize: 26, fontWeight: '800', color: c.titulo },
  suave: { fontSize: 15, color: c.suave },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: SEPARACION },
  tarjeta: { minHeight: 130, borderRadius: radio, padding: 16, justifyContent: 'space-between' },
  tarjetaTitulo: { fontSize: 17, fontWeight: '700', color: c.sobrePrimario },
  tarjetaDetalle: { fontSize: 13, color: c.celeste },
});
