// Primer paso del lote por ubicación: continuar el lote guardado o elegir una ubicación para empezar uno nuevo.
import { Ionicons } from '@expo/vector-icons';
import { type BienDto, type UbicacionDto } from '@patrimonio/shared';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Boton } from '../../compartido/ui';
import { bienesDeUbicacion, listarUbicaciones } from '../../datos/catalogo';
import { listarJornadas, type Jornada } from '../../datos/jornadas';
import { fechaHora, mensajeDeError } from '../../compartido/formato';
import { nuevoLote, type Lote } from './lote';
import { useEstilos, useTema } from '../../compartido/tema';
import { fabricaLote } from './estilos';

/* ------------------------------------------------------------------ elegir ubicación */

export function ElegirUbicacion({
  guardado,
  alContinuar,
  alDescartar,
  alEmpezar,
}: {
  guardado: Lote | null;
  alContinuar: () => void;
  alDescartar: () => void;
  alEmpezar: (lote: Lote) => void;
}) {
  const e = useEstilos(fabricaLote);
  const { c } = useTema();
  const [ubicaciones, setUbicaciones] = useState<UbicacionDto[] | null>(null);
  const [filtro, setFiltro] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setUbicaciones(await listarUbicaciones());
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar las ubicaciones.'));
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return (ubicaciones ?? []).filter((u) => !q || u.nombre.toLowerCase().includes(q));
  }, [ubicaciones, filtro]);

  /** Si hay una jornada abierta que abarca esta ubicación, se pregunta si el lote se suma a ella. */
  const jornadaParaSumar = async (nombre: string, bienes: BienDto[]): Promise<string | undefined> => {
    let abiertas: Jornada[];
    try {
      abiertas = await listarJornadas('abierta');
    } catch {
      return undefined; // sin conexión o sin permiso: el lote sigue siendo suelto
    }
    const areas = new Set(bienes.map((b) => b.areaResponsable));
    const candidata =
      abiertas.find((j) => j.tipo === 'ubicacion' && j.alcance === nombre) ?? abiertas.find((j) => j.tipo === 'area' && areas.has(j.alcance));
    if (!candidata) return undefined;
    return new Promise((resolver) =>
      Alert.alert('Hay una jornada abierta', `${candidata.alcance} (${candidata.encontrados} de ${candidata.esperados}). ¿Sumás este lote a la jornada?`, [
        { text: 'Sumar a la jornada', onPress: () => resolver(candidata.id) },
        { text: 'Lote suelto', onPress: () => resolver(undefined) },
      ], { cancelable: false }),
    );
  };

  const empezar = async (nombre: string) => {
    setIniciando(nombre);
    try {
      const bienes = await bienesDeUbicacion(nombre);
      alEmpezar(nuevoLote(nombre, bienes, Crypto.randomUUID(), new Date(), await jornadaParaSumar(nombre, bienes)));
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo iniciar el lote.'));
      setIniciando(null);
    }
  };

  const elegir = (nombre: string) => {
    if (!guardado) return void empezar(nombre);
    Alert.alert('Ya hay un lote en curso', `Empezar uno nuevo descarta el lote de "${guardado.ubicacion}" (${guardado.items.length} escaneados).`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Descartar y empezar', style: 'destructive', onPress: () => void empezar(nombre) },
    ]);
  };

  return (
    <View style={e.contenedor}>
      <View style={e.columna}>
        {guardado && (
          <View style={e.enCurso}>
            <Text style={e.enCursoTitulo}>Lote en curso</Text>
            <Text style={e.texto}>
              {guardado.ubicacion} · {guardado.items.length} escaneado{guardado.items.length === 1 ? '' : 's'} de {guardado.esperados.length} esperados
            </Text>
            <Text style={e.suave}>
              Iniciado el {fechaHora(guardado.iniciadoEn)}
              {guardado.jornadaId ? ' · suma a una jornada' : ''}
            </Text>
            <View style={e.fila}>
              <View style={{ flex: 1 }}>
                <Boton texto="Continuar" onPress={alContinuar} />
              </View>
              <View style={{ flex: 1 }}>
                <Boton
                  texto="Descartar"
                  variante="peligro"
                  onPress={() =>
                    Alert.alert('Descartar el lote', 'Se pierden los escaneos de este lote. No se puede deshacer.', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Descartar', style: 'destructive', onPress: alDescartar },
                    ])
                  }
                />
              </View>
            </View>
          </View>
        )}

        <Text style={e.titulo}>¿En qué ubicación vas a relevar?</Text>
        <Text style={e.suave}>Se escanea en ráfaga y al terminar ves qué falta respecto de lo que el catálogo ubica ahí.</Text>
        <View style={e.campoBusqueda}>
          <Ionicons name="search-outline" size={22} color={c.suave} />
          <TextInput value={filtro} onChangeText={setFiltro} placeholder="Filtrar ubicaciones" placeholderTextColor={c.suave} style={e.entradaBusqueda} autoCorrect={false} accessibilityLabel="Filtrar ubicaciones" />
        </View>
        {error && (
          <View style={{ gap: 10 }}>
            <Text style={e.error}>{error}</Text>
            <Boton texto="Reintentar" variante="secundario" onPress={cargar} />
          </View>
        )}
        {!error && !ubicaciones && <ActivityIndicator color={c.accion} />}
        {ubicaciones && visibles.length === 0 && <Text style={e.suave}>No hay ubicaciones que coincidan.</Text>}
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(u) => u.nombre}
        style={e.listaExterna}
        contentContainerStyle={e.lista}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.nombre}, ${item.cantidad} bienes`}
            disabled={iniciando !== null}
            onPress={() => elegir(item.nombre)}
            style={({ pressed }) => [e.ubicacion, pressed && { opacity: 0.85 }, iniciando && iniciando !== item.nombre && { opacity: 0.5 }]}
          >
            <Text style={e.ubicacionNombre} numberOfLines={3}>
              {item.nombre}
            </Text>
            {iniciando === item.nombre ? <ActivityIndicator color={c.accion} /> : <Text style={e.cantidad}>{item.cantidad}</Text>}
          </Pressable>
        )}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ escanear en ráfaga */
