import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMenu } from '../../compartido/menu';
import { Barra, Entrada, Logo } from '../../compartido/ui';
import { type Jornada, listarJornadas } from '../../datos/jornadas';
import { ESCANEAR, SECCIONES, type Funcion } from '../../compartido/navegacion';
import { useSesion } from '../../sesion/sesion';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';

const SEPARACION = 14;
const MARGEN = 20;
const ANCHO_MAXIMO = 1000;
/** Cuántas jornadas abiertas se muestran arriba; el resto se ve en "Jornadas por área". */
const MAX_JORNADAS = 3;

/** Pantalla de inicio: escanear, las jornadas abiertas y el resto de las funciones agrupadas por tarea (ver `lib/navegacion.ts`). */
export default function Inicio() {
  const router = useRouter();
  const { perfil } = useSesion();
  const { c } = useTema();
  const { fijo, abrir } = useMenu();
  const { width } = useWindowDimensions();
  const e = useEstilos(fabrica);
  const nombre = perfil?.nombre?.split(' ')[0] ?? perfil?.cuenta;
  const esAdmin = perfil?.rol === 'administrador';
  const [jornadas, setJornadas] = useState<Jornada[]>([]);

  // Sin las jornadas el inicio sigue sirviendo: si la consulta falla, la franja simplemente no aparece.
  useFocusEffect(
    useCallback(() => {
      listarJornadas('abierta')
        .then(setJornadas)
        .catch(() => setJornadas([]));
    }, []),
  );

  // Las tarjetas se reparten el ancho disponible: 2 columnas en celular, más en pantallas anchas.
  const disponible = Math.min(width - (fijo ? 280 : 0) - MARGEN * 2, ANCHO_MAXIMO);
  const columnas = disponible >= 720 ? 4 : disponible >= 480 ? 3 : 2;
  const ancho = Math.floor((disponible - SEPARACION * (columnas - 1)) / columnas);

  // "Escanear" va grande arriba, así que no se repite en la grilla de Relevar.
  const secciones = SECCIONES.filter((s) => !s.soloAdministrador || esAdmin).map((s) => ({
    ...s,
    funciones: s.funciones.filter((f) => f.ruta !== ESCANEAR.ruta),
  }));

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
                {esAdmin ? 'Administrador' : 'Relevador'} · Dirección de Patrimonio
              </Text>
            </View>
          </Entrada>

          <Entrada orden={1}>
            <Pressable accessibilityRole="button" onPress={() => router.push(ESCANEAR.ruta)} style={({ pressed }) => [e.escanear, pressed && { opacity: 0.85 }]}>
              <Ionicons name={ESCANEAR.icono} size={40} color={c.sobrePrimario} />
              <View style={{ flex: 1 }}>
                <Text style={e.escanearTitulo}>Escanear</Text>
                <Text style={e.escanearDetalle}>{ESCANEAR.detalle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={26} color={c.sobrePrimario} />
            </Pressable>
          </Entrada>

          {jornadas.length > 0 && (
            <Entrada orden={2}>
              <View style={{ gap: 8 }}>
                <Text style={e.seccion}>Jornadas abiertas</Text>
                {jornadas.slice(0, MAX_JORNADAS).map((j) => {
                  const porcentaje = j.esperados > 0 ? Math.round((j.encontrados / j.esperados) * 100) : 0;
                  return (
                    <Pressable
                      key={j.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Jornada de ${j.alcance}. ${j.encontrados} de ${j.esperados} encontrados`}
                      onPress={() => router.push({ pathname: '/jornada/[id]', params: { id: j.id } })}
                      style={({ pressed }) => [e.jornada, pressed && { opacity: 0.85 }]}
                    >
                      <Text style={e.jornadaNombre} numberOfLines={2}>
                        {j.alcance}
                      </Text>
                      <Barra porcentaje={porcentaje} />
                      <Text style={e.suave}>
                        {j.encontrados} de {j.esperados} encontrados ({porcentaje} %)
                      </Text>
                    </Pressable>
                  );
                })}
                {jornadas.length > MAX_JORNADAS && (
                  <Pressable accessibilityRole="button" onPress={() => router.push('/jornadas')}>
                    <Text style={e.enlace}>Ver las {jornadas.length} jornadas abiertas</Text>
                  </Pressable>
                )}
              </View>
            </Entrada>
          )}

          {secciones.map((sec, s) => (
            <View key={sec.titulo} style={{ gap: 10 }}>
              <Text style={e.seccion}>{sec.titulo}</Text>
              <View style={e.grilla}>
                {sec.funciones.map((f, i) => (
                  <Entrada key={f.ruta} orden={3 + s + i}>
                    <Tarjeta ancho={ancho} funcion={f} onPress={() => router.push(f.ruta)} />
                  </Entrada>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tarjeta({ funcion, ancho, onPress }: { funcion: Funcion; ancho: number; onPress: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [e.tarjeta, { width: ancho, backgroundColor: c.superficie, borderWidth: 1, borderColor: c.borde }, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name={funcion.icono} size={28} color={c.primario} />
      <View style={{ gap: 2 }}>
        <Text style={e.tarjetaTitulo}>{funcion.titulo}</Text>
        <Text style={e.tarjetaDetalle}>{funcion.detalle}</Text>
      </View>
    </Pressable>
  );
}

const fabrica = (c: Paleta) => ({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: MARGEN, paddingVertical: 10 },
  saludo: { fontSize: 26, fontWeight: '800', color: c.titulo },
  suave: { fontSize: 15, color: c.suave },
  seccion: { fontSize: 13, fontWeight: '700', color: c.suave, textTransform: 'uppercase', letterSpacing: 0.6 },
  escanear: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 96, padding: 18, borderRadius: radio, backgroundColor: c.primario },
  escanearTitulo: { fontSize: 24, fontWeight: '800', color: c.sobrePrimario },
  escanearDetalle: { fontSize: 14, color: c.celeste },
  jornada: { gap: 6, padding: 14, borderRadius: radio, backgroundColor: c.superficie, borderWidth: 1, borderColor: c.borde },
  jornadaNombre: { fontSize: 16, fontWeight: '700', color: c.titulo },
  enlace: { fontSize: 15, fontWeight: '600', color: c.accion },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: SEPARACION },
  tarjeta: { minHeight: 120, borderRadius: radio, padding: 14, justifyContent: 'space-between' },
  tarjetaTitulo: { fontSize: 16, fontWeight: '700', color: c.titulo },
  tarjetaDetalle: { fontSize: 13, color: c.suave },
});
