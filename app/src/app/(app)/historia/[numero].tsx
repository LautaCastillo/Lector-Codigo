import type { BienDetalleDto, CambioBienDto, RelevamientoRegistradoDto } from '@patrimonio/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { comunes } from '../../../compartido/estilos';
import { fechaHora, mensajeDeError } from '../../../compartido/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../../compartido/tema';
import { EstadoCarga, Opciones } from '../../../compartido/ui';
import { historialBien, obtenerBien } from '../../../datos/catalogo';
import { comentariosDe, type Comentario } from '../../../datos/comentarios';
import { relevamientosDeBien } from '../../../datos/relevamientos';
import { situacionesDeBien, type SituacionDeBien } from '../../../datos/situaciones';
import { armarHistoria, filtrarHistoria, type EventoHistoria, type TipoEvento } from '../../../funciones/historia/historia';

type Filtro = 'todo' | TipoEvento;

const ROTULO: Record<TipoEvento, string> = { lectura: 'Lecturas', catalogo: 'Catálogo', situacion: 'Situación', comentario: 'Comentarios' };
/** Cuántas lecturas se piden (es el máximo que devuelve el servidor). */
const MAX_LECTURAS = 50;

interface Fuentes {
  lecturas: RelevamientoRegistradoDto[];
  cambios: CambioBienDto[];
  situaciones: SituacionDeBien[];
  comentarios: Comentario[];
}

/** La historia de un bien en una sola línea de tiempo: lecturas (dónde estuvo y en qué estado), cambios del catálogo, situación y comentarios. */
export default function HistoriaDelBien() {
  const { numero } = useLocalSearchParams<{ numero: string }>();
  const router = useRouter();
  const e = useEstilos(fabrica);
  const [bien, setBien] = useState<BienDetalleDto | null>(null);
  const [fuentes, setFuentes] = useState<Fuentes | null>(null);
  const [faltan, setFaltan] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todo');

  const cargar = useCallback(async () => {
    try {
      const ficha = await obtenerBien(numero);
      setBien(ficha);
      // Si falla una fuente, se muestran las demás y se avisa cuál faltó.
      const [lecturas, cambios, situaciones, comentarios] = await Promise.allSettled([
        relevamientosDeBien(ficha.numeroInventario, MAX_LECTURAS),
        historialBien(ficha.numeroInventario),
        situacionesDeBien(ficha.id),
        comentariosDe({ bienId: ficha.id }),
      ]);
      const ok = <T,>(r: PromiseSettledResult<T>, vacio: T) => (r.status === 'fulfilled' ? r.value : vacio);
      setFuentes({ lecturas: ok(lecturas, []), cambios: ok(cambios, []), situaciones: ok(situaciones, []), comentarios: ok(comentarios, []) });
      setFaltan([
        ...(lecturas.status === 'rejected' ? ['las lecturas'] : []),
        ...(cambios.status === 'rejected' ? ['los cambios del catálogo'] : []),
        ...(situaciones.status === 'rejected' ? ['la situación'] : []),
        ...(comentarios.status === 'rejected' ? ['los comentarios'] : []),
      ]);
      setError(null);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cargar la historia.'));
    }
  }, [numero]);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const todos = useMemo(() => (fuentes ? armarHistoria(fuentes) : []), [fuentes]);
  const cuenta = (t: TipoEvento) => todos.filter((x) => x.tipo === t).length;
  const lista = useMemo(() => filtrarHistoria(todos, filtro === 'todo' ? null : filtro), [todos, filtro]);

  return (
    <FlatList
      data={lista}
      keyExtractor={(x) => x.clave}
      style={{ width: '100%' }}
      contentContainerStyle={e.lista}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          {bien && (
            <View style={{ gap: 2 }}>
              <Text style={e.numero}>{bien.numeroInventario}</Text>
              <Text style={e.descripcion} numberOfLines={2}>
                {bien.descripcion ?? 'Sin descripción'}
              </Text>
            </View>
          )}
          <EstadoCarga error={error} cargando={!fuentes && !error} alReintentar={cargar} />
          {fuentes && (
            <>
              <Opciones<Filtro>
                tamano="chico"
                opciones={[
                  { clave: 'todo', titulo: `Todo ${todos.length}` },
                  ...(['lectura', 'catalogo', 'situacion', 'comentario'] as const).map((t) => ({ clave: t, titulo: `${ROTULO[t]} ${cuenta(t)}` })),
                ]}
                actual={filtro}
                alElegir={setFiltro}
              />
              {faltan.length > 0 && <Text style={e.error}>No se pudo cargar {faltan.join(', ')}. Volvé a abrir la pantalla para reintentar.</Text>}
              {cuenta('lectura') >= MAX_LECTURAS && <Text style={e.ayuda}>Se muestran las últimas {MAX_LECTURAS} lecturas.</Text>}
            </>
          )}
        </View>
      }
      ListEmptyComponent={<Text style={e.ayuda}>{fuentes ? 'Todavía no hay nada para mostrar.' : ''}</Text>}
      renderItem={({ item, index }) => <Hecho evento={item} ultimo={index === lista.length - 1} alTocar={item.relevamientoId && item.propio ? () => router.push({ pathname: '/relevamiento/[id]', params: { id: item.relevamientoId! } }) : undefined} />}
    />
  );
}

function Hecho({ evento, ultimo, alTocar }: { evento: EventoHistoria; ultimo: boolean; alTocar?: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const contenido = (
    <View style={e.hecho}>
      <View style={e.linea}>
        <View style={[e.punto, { backgroundColor: evento.alerta ? c.accion : c.primario }]} />
        {!ultimo && <View style={e.tramo} />}
      </View>
      <View style={{ flex: 1, gap: 3, paddingBottom: ultimo ? 0 : 14 }}>
        <Text style={e.rotulo}>
          {ROTULO[evento.tipo]} · {fechaHora(evento.en)}
        </Text>
        <Text style={e.titulo}>{evento.titulo}</Text>
        {evento.detalle.map((d, i) => (
          <Text key={i} style={[e.detalle, evento.alerta && d.startsWith('Cambió de lugar') && { color: c.accion, fontWeight: '700' }]} selectable>
            {d}
          </Text>
        ))}
      </View>
    </View>
  );
  return alTocar ? (
    <Pressable accessibilityRole="button" onPress={alTocar} style={({ pressed }) => pressed && { opacity: 0.8 }}>
      {contenido}
    </Pressable>
  ) : (
    contenido
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  lista: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 0 },
  numero: { fontSize: 26, fontWeight: '800', color: c.titulo, letterSpacing: 1 },
  descripcion: { fontSize: 15, color: c.texto },
  hecho: { flexDirection: 'row', gap: 12, backgroundColor: c.fondo, borderRadius: radio },
  linea: { alignItems: 'center', width: 14 },
  punto: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  tramo: { flex: 1, width: 2, backgroundColor: c.borde, marginTop: 2 },
  rotulo: { fontSize: 12, fontWeight: '700', color: c.suave, textTransform: 'uppercase' },
  titulo: { fontSize: 15, fontWeight: '700', color: c.texto },
  detalle: { fontSize: 13, color: c.suave },
});
