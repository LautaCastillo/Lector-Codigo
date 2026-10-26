import { Ionicons } from '@expo/vector-icons';
import type { UbicacionDto } from '@patrimonio/shared';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Seccion } from '../../components/bien';
import { Boton } from '../../components/ui';
import { exportarRelevamientos, listarUbicaciones, type ArchivoCsv, type FiltroExportacion } from '../../lib/api';
import { useSesion } from '../../lib/sesion';
import { radio, useEstilos, useTema, type Paleta } from '../../lib/tema';

type Periodo = 'hoy' | '7' | '30' | 'todo';
const PERIODOS: { valor: Periodo; titulo: string }[] = [
  { valor: 'hoy', titulo: 'Hoy' },
  { valor: '7', titulo: 'Últimos 7 días' },
  { valor: '30', titulo: 'Últimos 30 días' },
  { valor: 'todo', titulo: 'Todo' },
];
const RESULTADOS: { valor: FiltroExportacion['resultado'] | null; titulo: string }[] = [
  { valor: null, titulo: 'Todos' },
  { valor: 'encontrado', titulo: 'Encontrados' },
  { valor: 'no_encontrado', titulo: 'Fuera del catálogo' },
  { valor: 'hallazgo', titulo: 'Hallazgos' },
];

/** Inicio del período elegido, en la hora del teléfono. */
function desdeDe(periodo: Periodo): string | undefined {
  if (periodo === 'todo') return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (periodo !== 'hoy') d.setDate(d.getDate() - Number(periodo));
  return d.toISOString();
}

export default function Exportar() {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const { perfil } = useSesion();
  const esAdmin = perfil?.rol === 'administrador';
  const [periodo, setPeriodo] = useState<Periodo>('30');
  const [resultado, setResultado] = useState<FiltroExportacion['resultado'] | null>(null);
  const [ubicacion, setUbicacion] = useState<string | null>(null);
  const [soloMios, setSoloMios] = useState(false);
  const [ubicaciones, setUbicaciones] = useState<UbicacionDto[]>([]);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<{ datos: ArchivoCsv; uri: string } | null>(null);

  useEffect(() => {
    listarUbicaciones().then(setUbicaciones).catch(() => undefined);
  }, []);

  const resumenFiltros = useMemo(
    () => [PERIODOS.find((p) => p.valor === periodo)?.titulo, RESULTADOS.find((r) => r.valor === resultado)?.titulo, ubicacion ?? 'Todas las ubicaciones'].join(' · '),
    [periodo, resultado, ubicacion],
  );

  const compartir = async (uri: string) => {
    if (!(await Sharing.isAvailableAsync())) {
      setError('Este teléfono no permite compartir archivos desde la app.');
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Relevamientos', UTI: 'public.comma-separated-values-text' });
  };

  const generar = async () => {
    setGenerando(true);
    setError(null);
    setArchivo(null);
    try {
      const datos = await exportarRelevamientos({
        desde: desdeDe(periodo),
        ...(resultado ? { resultado } : {}),
        ...(ubicacion ? { ubicacion } : {}),
        ...(esAdmin && soloMios ? { mios: true } : {}),
      }, esAdmin);
      if (datos.filas === 0) {
        setError('No hay relevamientos con esos filtros.');
      } else {
        // Se guarda en la caché del teléfono (el sistema la puede vaciar) y se ofrece para compartir.
        const archivoLocal = new File(Paths.cache, datos.nombre);
        archivoLocal.create({ overwrite: true });
        await archivoLocal.write(datos.csv);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setArchivo({ datos, uri: archivoLocal.uri });
        await compartir(archivoLocal.uri);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el archivo.');
    }
    setGenerando(false);
  };

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.columna}>
        <Text style={e.suave}>Genera un archivo CSV de relevamientos que se abre en Excel. Cada exportación queda registrada con quién, cuándo y con qué filtros.</Text>

        <Text style={e.titulo}>Período</Text>
        <Opciones opciones={PERIODOS.map((p) => ({ clave: p.valor, titulo: p.titulo }))} actual={periodo} alElegir={(v) => setPeriodo(v as Periodo)} />

        <Text style={e.titulo}>Resultado</Text>
        <Opciones opciones={RESULTADOS.map((r) => ({ clave: r.valor ?? 'todos', titulo: r.titulo }))} actual={resultado ?? 'todos'} alElegir={(v) => setResultado(v === 'todos' ? null : (v as FiltroExportacion['resultado']))} />

        {esAdmin && (
          <>
            <Text style={e.titulo}>Relevadores</Text>
            <Opciones
              opciones={[
                { clave: 'todos', titulo: 'Todos' },
                { clave: 'mios', titulo: 'Solo los míos' },
              ]}
              actual={soloMios ? 'mios' : 'todos'}
              alElegir={(v) => setSoloMios(v === 'mios')}
            />
          </>
        )}
        {!esAdmin && <Text style={e.suave}>Se exportan solo tus relevamientos.</Text>}

        <Seccion titulo="Ubicación" resumen={ubicacion ?? 'Todas'} inicialAbierta={false}>
          {[null, ...ubicaciones.map((u) => u.nombre)].map((nombre) => (
            <Pressable key={nombre ?? 'todas'} accessibilityRole="radio" accessibilityState={{ selected: ubicacion === nombre }} onPress={() => setUbicacion(nombre)} style={e.opcionUbicacion}>
              <Ionicons name={ubicacion === nombre ? 'radio-button-on' : 'radio-button-off'} size={22} color={ubicacion === nombre ? c.accion : c.suave} />
              <Text style={e.ubicacionTexto}>{nombre ?? 'Todas las ubicaciones'}</Text>
            </Pressable>
          ))}
        </Seccion>

        <Text style={e.suave}>Se exportará: {resumenFiltros}</Text>
        {error && <Text style={e.error}>{error}</Text>}
        <Boton texto="Generar y compartir CSV" onPress={generar} cargando={generando} />

        {archivo && (
          <View style={e.constancia} accessible>
            <Text style={e.constanciaTitulo}>Exportación registrada</Text>
            <Text style={e.texto}>
              {archivo.datos.filas} relevamiento{archivo.datos.filas === 1 ? '' : 's'} en {archivo.datos.nombre}
            </Text>
            <Text style={e.suave}>Huella SHA-256: {archivo.datos.hash.slice(0, 16)}…</Text>
            {archivo.datos.truncado && <Text style={e.error}>Había más de 10.000 filas: se exportaron las 10.000 más recientes. Acotá el período para el resto.</Text>}
            <Boton texto="Compartir de nuevo" variante="secundario" onPress={() => compartir(archivo.uri)} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Opciones({ opciones, actual, alElegir }: { opciones: { clave: string; titulo: string }[]; actual: string; alElegir: (clave: string) => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  return (
    <View style={e.chips}>
      {opciones.map((o) => (
        <Pressable
          key={o.clave}
          accessibilityRole="radio"
          accessibilityState={{ selected: actual === o.clave }}
          onPress={() => alElegir(o.clave)}
          style={[e.chip, actual === o.clave && { backgroundColor: c.primario, borderColor: c.primario }]}
        >
          <Text style={[e.chipTexto, actual === o.clave && { color: c.sobrePrimario }]}>{o.titulo}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 640, gap: 12 },
  titulo: { fontSize: 17, fontWeight: '800', color: c.titulo, marginTop: 6 },
  texto: { fontSize: 15, color: c.texto },
  suave: { fontSize: 14, color: c.suave },
  error: { fontSize: 15, color: c.error },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1.5, borderColor: c.borde, backgroundColor: c.superficie, alignItems: 'center', justifyContent: 'center' },
  chipTexto: { fontSize: 15, fontWeight: '600', color: c.texto },
  opcionUbicacion: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  ubicacionTexto: { flex: 1, fontSize: 15, color: c.texto },
  constancia: { backgroundColor: c.superficie, borderRadius: radio, padding: 16, gap: 8, borderWidth: 2, borderColor: c.ok },
  constanciaTitulo: { fontSize: 16, fontWeight: '800', color: c.ok },
});
