import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { comunes } from '../../compartido/estilos';
import { fechaCorta, fechaHora, mensajeDeError, nombreDeCuenta } from '../../compartido/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { Barra, Boton, EstadoCarga, Opciones } from '../../compartido/ui';
import { avancePorArea, lecturasPorPersona, resumenDelPanel, type AreaPanel, type PersonaPanel, type ResumenPanel } from '../../datos/panel';
import { useSesion } from '../../sesion/sesion';

const PERIODOS = [7, 30, 90] as const;
type Periodo = (typeof PERIODOS)[number];

/** Vista de conjunto para administradores: cifras generales, avance por área y trabajo de cada persona. */
export default function Panel() {
  const router = useRouter();
  const { perfil } = useSesion();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [resumen, setResumen] = useState<ResumenPanel | null>(null);
  const [areas, setAreas] = useState<AreaPanel[] | null>(null);
  const [personas, setPersonas] = useState<PersonaPanel[] | null>(null);
  const [dias, setDias] = useState<Periodo>(30);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const esAdmin = perfil?.rol === 'administrador';

  const cargar = useCallback(
    async (periodo: Periodo) => {
      try {
        const [r, a, p] = await Promise.all([resumenDelPanel(), avancePorArea(), lecturasPorPersona(periodo)]);
        setResumen(r);
        setAreas(a);
        setPersonas(p);
        setError(null);
      } catch (err) {
        setError(mensajeDeError(err, 'No se pudo cargar el panel.'));
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (esAdmin) void cargar(dias);
    }, [cargar, dias, esAdmin]),
  );

  if (!esAdmin) {
    return (
      <View style={e.centro}>
        <Text style={e.error}>El panel es solo para administradores.</Text>
      </View>
    );
  }

  const sinRelevar = resumen ? resumen.bienes - resumen.relevados - resumen.apartados : 0;
  const porcentaje = (relevados: number, bienes: number, apartados: number) => (bienes - apartados > 0 ? Math.round((relevados / (bienes - apartados)) * 100) : 0);

  return (
    <ScrollView
      contentContainerStyle={e.contenido}
      refreshControl={
        <RefreshControl
          refreshing={actualizando}
          onRefresh={async () => {
            setActualizando(true);
            await cargar(dias);
            setActualizando(false);
          }}
          tintColor={c.accion}
        />
      }
    >
      <View style={e.columna}>
        <EstadoCarga error={error} cargando={!resumen && !error} alReintentar={() => cargar(dias)} />

        {resumen && (
          <>
            <View style={e.cifras}>
              <Cifra valor={String(resumen.bienes)} etiqueta="Bienes en el catálogo" />
              <Cifra valor={`${porcentaje(resumen.relevados, resumen.bienes, resumen.apartados)} %`} etiqueta={`${resumen.relevados} relevados alguna vez`} tono="ok" />
              <Cifra valor={String(sinRelevar)} etiqueta="Nunca encontrados" tono={sinRelevar > 0 ? 'error' : 'neutro'} alTocar={() => router.push('/panel-sin-relevar')} />
              <Cifra valor={String(resumen.apartados)} etiqueta="Apartados (con situación)" />
              <Cifra valor={String(resumen.jornadasAbiertas)} etiqueta={`Jornadas abiertas · ${resumen.jornadasCerradas} cerradas`} alTocar={() => router.push('/jornadas')} />
              <Cifra valor={String(resumen.lecturas7Dias)} etiqueta="Lecturas en 7 días" />
              <Cifra valor={String(resumen.cuentasActivas)} etiqueta="Cuentas activas" />
              <Cifra valor={String(resumen.hallazgosSinVincular)} etiqueta="Hallazgos sin vincular" tono={resumen.hallazgosSinVincular > 0 ? 'error' : 'neutro'} />
            </View>
            <Text style={e.ayuda}>"Relevado" es un bien que alguna vez tuvo una lectura vigente en cualquier jornada o lote. Las lecturas deshechas no cuentan.</Text>
          </>
        )}

        {areas && (
          <>
            <Text style={e.titulo}>Avance por área</Text>
            {areas.length === 0 && <Text style={e.ayuda}>Todavía no hay bienes con área en el catálogo.</Text>}
            {areas.map((a) => (
              <Pressable key={a.area} accessibilityRole="button" onPress={() => router.push({ pathname: '/panel-sin-relevar', params: { area: a.area } })} style={({ pressed }) => [e.tarjeta, pressed && { opacity: 0.85 }]}>
                <Text style={e.area}>{a.area}</Text>
                <Barra porcentaje={porcentaje(a.relevados, a.bienes, a.apartados)} alto={8} />
                <Text style={e.ayuda}>
                  {a.relevados} de {a.bienes - a.apartados} relevados ({porcentaje(a.relevados, a.bienes, a.apartados)} %) · {a.sinRelevar} sin relevar
                  {a.apartados ? ` · ${a.apartados} apartados` : ''}
                </Text>
                <Text style={e.ayuda}>
                  {a.ultimaCerradaEn ? `Última jornada cerrada: ${fechaCorta(a.ultimaCerradaEn)}, ${a.ultimaEncontrados} de ${a.ultimaEsperados} encontrados` : 'Todavía no se cerró ninguna jornada de esta área'}
                </Text>
              </Pressable>
            ))}
          </>
        )}

        {personas && (
          <>
            <Text style={e.titulo}>Trabajo por persona</Text>
            <Opciones<`${Periodo}`>
              tamano="chico"
              opciones={PERIODOS.map((d) => ({ clave: `${d}` as `${Periodo}`, titulo: `${d} días` }))}
              actual={`${dias}`}
              alElegir={(d) => setDias(Number(d) as Periodo)}
            />
            {personas.map((p) => (
              <View key={p.usuarioId} style={e.tarjeta}>
                <Text style={e.area}>
                  {p.nombre ?? nombreDeCuenta(p.cuenta)}
                  {p.rol === 'administrador' ? ' · administrador' : ''}
                  {p.estado !== 'activa' ? ` · ${p.estado}` : ''}
                </Text>
                <Text style={e.ayuda}>
                  {p.lecturas} lectura{p.lecturas === 1 ? '' : 's'} · {p.hallazgos} hallazgo{p.hallazgos === 1 ? '' : 's'} · {p.deshechas} deshecha{p.deshechas === 1 ? '' : 's'} en {dias} días
                </Text>
                <Text style={e.ayuda}>
                  {p.ultimaActividad ? `Última actividad: ${fechaHora(p.ultimaActividad)}` : 'Sin actividad'}
                  {p.jornadasAbiertas ? ` · ${p.jornadasAbiertas} jornada${p.jornadasAbiertas === 1 ? '' : 's'} abierta${p.jornadasAbiertas === 1 ? '' : 's'}` : ''}
                </Text>
              </View>
            ))}
          </>
        )}
        {resumen && <Boton texto="Actualizar" variante="secundario" onPress={() => cargar(dias)} />}
      </View>
    </ScrollView>
  );
}

function Cifra({ valor, etiqueta, tono = 'neutro', alTocar }: { valor: string; etiqueta: string; tono?: 'ok' | 'error' | 'neutro'; alTocar?: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const color = tono === 'ok' ? c.ok : tono === 'error' ? c.error : c.titulo;
  const cuerpo = (
    <>
      <Text style={[e.cifraValor, { color }]}>{valor}</Text>
      <Text style={e.ayuda}>{etiqueta}</Text>
    </>
  );
  return alTocar ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`${etiqueta}: ${valor}`} onPress={alTocar} style={({ pressed }) => [e.cifra, pressed && { opacity: 0.85 }]}>
      {cuerpo}
    </Pressable>
  ) : (
    <View style={e.cifra} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      {cuerpo}
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 720, gap: 12 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.fondo },
  titulo: { fontSize: 17, fontWeight: '800', color: c.titulo, marginTop: 8 },
  cifras: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cifra: { flexGrow: 1, flexBasis: '45%', backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 2, borderWidth: 1, borderColor: c.borde },
  cifraValor: { fontSize: 26, fontWeight: '800' },
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 6, borderWidth: 1, borderColor: c.borde },
  area: { fontSize: 15, fontWeight: '700', color: c.titulo },
});
