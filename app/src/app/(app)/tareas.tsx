import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, Text, View } from 'react-native';
import { comunes } from '../../compartido/estilos';
import { fechaCorta, mensajeDeError } from '../../compartido/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { Boton, EstadoCarga, Opciones } from '../../compartido/ui';
import { cancelarTarea, iniciarTarea, misTareas, tareasDelEquipo, terminarTarea, type EstadoTarea, type Tarea } from '../../datos/tareas';
import { aFechaIso, estaVencida } from '../../funciones/tareas/fechas';
import { useSesion } from '../../sesion/sesion';

type Vista = 'mias' | 'equipo';
type Filtro = EstadoTarea | 'todas';

const ROTULO_ESTADO: Record<EstadoTarea, string> = { pendiente: 'Pendientes', hecha: 'Hechas', cancelada: 'Canceladas' };

/** Las tareas de relevamiento: las propias y, para administradores, las de todo el equipo. */
export default function Tareas() {
  const router = useRouter();
  const { perfil } = useSesion();
  const e = useEstilos(fabrica);
  const esAdmin = perfil?.rol === 'administrador';
  const [vista, setVista] = useState<Vista>('mias');
  const [filtro, setFiltro] = useState<Filtro>('pendiente');
  const [mias, setMias] = useState<Tarea[] | null>(null);
  const [equipo, setEquipo] = useState<Tarea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setMias(await misTareas());
      if (esAdmin) setEquipo(await tareasDelEquipo());
      setError(null);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar las tareas.'));
    }
  }, [esAdmin]);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const hacer = async (id: string, accion: () => Promise<void>) => {
    setOcupada(id);
    try {
      await accion();
      await cargar();
    } catch (err) {
      Alert.alert('No se pudo', mensajeDeError(err, 'Revisá la conexión y reintentá.'));
    }
    setOcupada(null);
  };

  const empezar = (t: Tarea) =>
    hacer(t.id, async () => {
      const jornadaId = await iniciarTarea(t.id);
      router.push({ pathname: '/jornada/[id]', params: { id: jornadaId } });
    });

  const terminar = (t: Tarea) =>
    Alert.alert('Marcar como hecha', `${t.alcance}\nLa tarea pasa a hechas; la jornada no se cierra.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Marcar como hecha', onPress: () => void hacer(t.id, () => terminarTarea(t.id)) },
    ]);

  const cancelar = (t: Tarea) =>
    Alert.alert('Cancelar la tarea', `${t.alcance}, para ${t.asignadaA}.`, [
      { text: 'No', style: 'cancel' },
      { text: 'Cancelar la tarea', style: 'destructive', onPress: () => void hacer(t.id, () => cancelarTarea(t.id)) },
    ]);

  const base = vista === 'mias' ? mias : equipo;
  const lista = useMemo(() => (vista === 'mias' || filtro === 'todas' ? (base ?? []) : (base ?? []).filter((t) => t.estado === filtro)), [base, vista, filtro]);

  return (
    <FlatList
      data={lista}
      keyExtractor={(t) => t.id}
      style={{ width: '100%' }}
      contentContainerStyle={e.lista}
      refreshControl={
        <RefreshControl
          refreshing={actualizando}
          onRefresh={async () => {
            setActualizando(true);
            await cargar();
            setActualizando(false);
          }}
        />
      }
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          {esAdmin && (
            <>
              <Boton texto="Asignar una tarea" onPress={() => router.push('/tarea-nueva')} />
              <Opciones<Vista> tamano="chico" opciones={[{ clave: 'mias', titulo: 'Mías' }, { clave: 'equipo', titulo: 'Del equipo' }]} actual={vista} alElegir={setVista} />
              {vista === 'equipo' && (
                <Opciones<Filtro>
                  tamano="chico"
                  opciones={[...(['pendiente', 'hecha', 'cancelada'] as const).map((s) => ({ clave: s, titulo: ROTULO_ESTADO[s] })), { clave: 'todas' as const, titulo: 'Todas' }]}
                  actual={filtro}
                  alElegir={setFiltro}
                />
              )}
            </>
          )}
          <EstadoCarga error={error} cargando={!base && !error} alReintentar={cargar} />
        </View>
      }
      ListEmptyComponent={<Text style={e.ayuda}>{base ? (vista === 'mias' ? 'No tenés tareas asignadas.' : 'No hay tareas con ese estado.') : ''}</Text>}
      renderItem={({ item }) => <TarjetaTarea tarea={item} vista={vista} ocupada={ocupada === item.id} alEmpezar={() => empezar(item)} alTerminar={() => terminar(item)} alCancelar={() => cancelar(item)} alIrAJornada={() => item.jornadaId && router.push({ pathname: '/jornada/[id]', params: { id: item.jornadaId } })} />}
    />
  );
}

function TarjetaTarea({ tarea: t, vista, ocupada, alEmpezar, alTerminar, alCancelar, alIrAJornada }: { tarea: Tarea; vista: Vista; ocupada: boolean; alEmpezar: () => void; alTerminar: () => void; alCancelar: () => void; alIrAJornada: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const hoy = aFechaIso(new Date());
  const pendiente = t.estado === 'pendiente';
  const vencida = pendiente && estaVencida(t.fechaPrevista, hoy);
  return (
    <View style={[e.tarjeta, vencida && { borderColor: c.accion, borderWidth: 1.5 }]}>
      <Text style={e.alcance}>{t.alcance}</Text>
      <Text style={e.ayuda}>
        {t.tipo === 'area' ? 'Área' : 'Ubicación'} · {fechaCorta(t.fechaPrevista)}
        {pendiente && t.fechaPrevista === hoy ? ' · hoy' : ''}
      </Text>
      {vencida && <Text style={e.alerta}>Vencida: era para el {fechaCorta(t.fechaPrevista)}</Text>}
      {!pendiente && <Text style={e.ayuda}>{t.estado === 'hecha' ? 'Hecha' : 'Cancelada'}{t.resueltaEn ? ` el ${fechaCorta(t.resueltaEn)}` : ''}</Text>}
      {t.nota && <Text style={e.texto}>{t.nota}</Text>}
      {(vista === 'equipo' || !t.propia) && (
        <Text style={e.ayuda}>
          Para {t.propia ? 'vos' : t.asignadaA} · la asignó {t.creadaPor}
        </Text>
      )}
      {pendiente && t.propia && (
        <>
          <Boton texto={t.jornadaId ? 'Seguir en la jornada' : 'Empezar la jornada'} cargando={ocupada} onPress={t.jornadaId ? alIrAJornada : alEmpezar} />
          <Boton texto="Marcar como hecha" variante="secundario" deshabilitado={ocupada} onPress={alTerminar} />
        </>
      )}
      {pendiente && vista === 'equipo' && <Boton texto="Cancelar la tarea" variante="peligro" deshabilitado={ocupada} onPress={alCancelar} />}
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  lista: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20 },
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 6, borderWidth: 1, borderColor: c.borde },
  alcance: { fontSize: 17, fontWeight: '800', color: c.titulo },
  texto: { fontSize: 15, color: c.texto },
  alerta: { fontSize: 13, fontWeight: '700', color: c.accion },
});
