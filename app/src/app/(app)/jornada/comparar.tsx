import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { comunes } from '../../../compartido/estilos';
import { ETIQUETA_SITUACION, fechaCorta, mensajeDeError } from '../../../compartido/formato';
import { radio, useEstilos, type Paleta } from '../../../compartido/tema';
import { Chip, EstadoCarga, Opciones } from '../../../compartido/ui';
import { compararJornadas, listarJornadas, type CambioEntreJornadas, type FilaComparacion, type Jornada } from '../../../datos/jornadas';

type Filtro = 'cambios' | CambioEntreJornadas;

const ROTULO: Record<CambioEntreJornadas, string> = {
  aparecio: 'Aparecieron',
  desaparecio: 'No se volvieron a ver',
  cambio_lugar: 'Cambiaron de lugar',
  igual: 'Sin cambios',
  falto_en_ambas: 'Faltan en las dos',
};
const CAMBIOS: CambioEntreJornadas[] = ['aparecio', 'desaparecio', 'cambio_lugar'];

/** Compara una jornada con otra anterior del mismo área o ubicación: qué apareció, qué no se volvió a ver y qué cambió de lugar. */
export default function CompararJornadas() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const e = useEstilos(fabrica);
  const [actual, setActual] = useState<Jornada | null>(null);
  const [candidatas, setCandidatas] = useState<Jornada[] | null>(null);
  const [antesId, setAntesId] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaComparacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('cambios');

  // Las otras jornadas del mismo alcance; por defecto se compara con la anterior más cercana.
  useEffect(() => {
    listarJornadas()
      .then((todas) => {
        const esta = todas.find((j) => j.id === id) ?? null;
        setActual(esta);
        if (!esta) return setError('No se encontró la jornada.');
        const otras = todas.filter((j) => j.id !== id && j.tipo === esta.tipo && j.alcance === esta.alcance);
        setCandidatas(otras);
        const anterior = otras.find((j) => j.creadoEn < esta.creadoEn) ?? otras[0];
        setAntesId(anterior?.id ?? null);
      })
      .catch((err) => setError(mensajeDeError(err, 'No se pudieron cargar las jornadas.')));
  }, [id]);

  const comparar = useCallback(async () => {
    if (!antesId) return;
    setFilas(null);
    try {
      setFilas(await compararJornadas(antesId, id));
      setError(null);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo comparar.'));
    }
  }, [antesId, id]);

  useEffect(() => {
    void comparar();
  }, [comparar]);

  const cuenta = (c: CambioEntreJornadas) => (filas ?? []).filter((f) => f.cambio === c).length;
  const lista = useMemo(() => (filas ?? []).filter((f) => (filtro === 'cambios' ? CAMBIOS.includes(f.cambio) : f.cambio === filtro)), [filas, filtro]);
  const antes = candidatas?.find((j) => j.id === antesId) ?? null;

  return (
    <FlatList
      data={lista}
      keyExtractor={(f) => f.bienId}
      style={{ width: '100%' }}
      contentContainerStyle={e.lista}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          <Text style={e.titulo}>{actual?.alcance ?? 'Jornada'}</Text>
          {candidatas && candidatas.length === 0 && <Text style={e.ayuda}>No hay otra jornada de esta {actual?.tipo === 'area' ? 'área' : 'ubicación'} para comparar.</Text>}
          {candidatas && candidatas.length > 0 && (
            <>
              <Text style={e.ayuda}>Comparar la de {actual ? fechaCorta(actual.creadoEn) : ''} con la de:</Text>
              <View style={e.chips}>
                {candidatas.map((j) => (
                  <Chip key={j.id} texto={`${fechaCorta(j.creadoEn)}${j.estado === 'abierta' ? ' (abierta)' : ''}`} activo={j.id === antesId} alTocar={() => setAntesId(j.id)} />
                ))}
              </View>
            </>
          )}
          <EstadoCarga error={error} cargando={!!antesId && !filas && !error} alReintentar={comparar} />
          {filas && (
            <>
              <Opciones<Filtro>
                tamano="chico"
                opciones={[{ clave: 'cambios', titulo: `Cambios ${CAMBIOS.reduce((n, c) => n + cuenta(c), 0)}` }, ...(Object.keys(ROTULO) as CambioEntreJornadas[]).map((c) => ({ clave: c, titulo: `${ROTULO[c]} ${cuenta(c)}` }))]}
                actual={filtro}
                alElegir={setFiltro}
              />
              {actual?.estado === 'abierta' && <Text style={e.ayuda}>Esta jornada sigue abierta: lo que figura como no visto todavía puede aparecer.</Text>}
              {antes?.estado === 'abierta' && <Text style={e.ayuda}>La jornada con la que se compara sigue abierta.</Text>}
            </>
          )}
        </View>
      }
      ListEmptyComponent={<Text style={e.ayuda}>{filas ? 'No hay bienes en esta categoría.' : ''}</Text>}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/bien/[numero]', params: { numero: item.numeroInventario } })} style={({ pressed }) => [e.tarjeta, pressed && { opacity: 0.85 }]}>
          <Text style={e.numero}>{item.numeroInventario}</Text>
          <Text style={e.descripcion} numberOfLines={2}>
            {item.descripcion ?? 'Sin descripción'}
          </Text>
          <Text style={e.ayuda}>{detalle(item)}</Text>
          {item.situacionDespues && item.cambio === 'desaparecio' && <Text style={e.situacion}>Ahora: {ETIQUETA_SITUACION[item.situacionDespues] ?? item.situacionDespues}</Text>}
        </Pressable>
      )}
    />
  );
}

function detalle(f: FilaComparacion): string {
  switch (f.cambio) {
    case 'cambio_lugar':
      return `Estaba en ${f.ubicacionAntes} y ahora en ${f.ubicacionDespues}`;
    case 'aparecio':
      return `No se había visto; ahora lo relevó ${f.relevadorDespues}${f.ubicacionDespues ? ` en ${f.ubicacionDespues}` : ''}`;
    case 'desaparecio':
      return `Lo había relevado ${f.relevadorAntes}${f.ubicacionAntes ? ` en ${f.ubicacionAntes}` : ''}; ahora no se lo vio`;
    case 'igual':
      return `En las dos jornadas${f.ubicacionDespues ? `, en ${f.ubicacionDespues}` : ''}`;
    default:
      return f.ubicacionFisica ? `No se vio en ninguna. El catálogo lo ubica en ${f.ubicacionFisica}` : 'No se vio en ninguna';
  }
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  lista: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20 },
  titulo: { fontSize: 18, fontWeight: '800', color: c.titulo },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 4, borderWidth: 1, borderColor: c.borde },
  numero: { fontSize: 18, fontWeight: '800', color: c.titulo },
  descripcion: { fontSize: 15, color: c.texto },
  situacion: { fontSize: 13, fontWeight: '700', color: c.accion },
});
