import { Ionicons } from '@expo/vector-icons';
import type { CuentaDto, EventoAuditoriaDto } from '@patrimonio/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Boton } from '../../components/ui';
import { listarAuditoria, listarCuentas } from '../../lib/api';
import { fechaHora } from '../../lib/formato';
import { categoria, CATEGORIAS, describirEvento, type Categoria } from '../../lib/actividad';
import { radio, useEstilos, useTema, type Paleta } from '../../lib/tema';

const PAGINA = 50;
const LIMITE_SERVIDOR = 200;

const ICONOS: Record<Categoria, keyof typeof Ionicons.glyphMap> = {
  cuentas: 'person-outline',
  sesiones: 'log-in-outline',
  relevamientos: 'albums-outline',
  consultas: 'eye-outline',
};

export default function Actividad() {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [eventos, setEventos] = useState<EventoAuditoriaDto[] | null>(null);
  const [cuentas, setCuentas] = useState<CuentaDto[]>([]);
  const [filtro, setFiltro] = useState<Categoria | null>(null);
  const [limite, setLimite] = useState(PAGINA);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      // Las cuentas se piden aparte para mostrar nombres en lugar de identificadores.
      const [lista, personas] = await Promise.all([listarAuditoria(limite), listarCuentas()]);
      setEventos(lista);
      setCuentas(personas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la actividad.');
    }
  }, [limite]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const nombres = useMemo(() => new Map(cuentas.map((p) => [p.id, p.nombre ?? p.cuenta])), [cuentas]);
  const nombre = useCallback((id: string | null) => (id ? (nombres.get(id) ?? 'una cuenta desconocida') : 'una cuenta'), [nombres]);

  const visibles = useMemo(() => (eventos ?? []).filter((ev) => !filtro || categoria(ev.tipo) === filtro), [eventos, filtro]);
  // Si el servidor devolvió menos de lo pedido, ya no hay más eventos.
  const hayMas = eventos !== null && eventos.length >= limite && limite < LIMITE_SERVIDOR;

  return (
    <ScrollView
      contentContainerStyle={e.contenido}
      refreshControl={
        <RefreshControl
          refreshing={actualizando}
          onRefresh={async () => {
            setActualizando(true);
            await cargar();
            setActualizando(false);
          }}
          tintColor={c.accion}
        />
      }
    >
      <View style={e.columna}>
        <Text style={e.ayuda}>Registro de cuentas y sesiones. No se puede editar ni borrar. Cada consulta a esta pantalla también queda registrada.</Text>

        <View style={e.filtros}>
          <Chip titulo="Todo" activo={filtro === null} alTocar={() => setFiltro(null)} />
          {CATEGORIAS.map((cat) => (
            <Chip key={cat.valor} titulo={cat.titulo} activo={filtro === cat.valor} alTocar={() => setFiltro(cat.valor)} />
          ))}
        </View>

        {error && (
          <View style={{ gap: 12 }}>
            <Text style={e.error}>{error}</Text>
            <Boton texto="Reintentar" variante="secundario" onPress={cargar} />
          </View>
        )}
        {!error && !eventos && <ActivityIndicator size="large" color={c.accion} />}
        {eventos && visibles.length === 0 && <Text style={e.vacio}>No hay actividad para mostrar.</Text>}

        {visibles.map((ev) => (
          <View key={ev.id} style={e.tarjeta} accessible accessibilityLabel={`${describirEvento(ev, nombre)}. ${fechaHora(ev.horaServidor)}`}>
            <View style={e.icono}>
              <Ionicons name={ICONOS[categoria(ev.tipo)]} size={20} color={c.titulo} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={e.frase}>{describirEvento(ev, nombre)}</Text>
              {ev.motivo && <Text style={e.detalle}>Motivo: {ev.motivo}</Text>}
              <Text style={e.detalle}>{fechaHora(ev.horaServidor)}</Text>
            </View>
          </View>
        ))}

        {hayMas && <Boton texto="Ver más" variante="secundario" onPress={() => setLimite((l) => Math.min(l + PAGINA, LIMITE_SERVIDOR))} />}
        {eventos && limite >= LIMITE_SERVIDOR && eventos.length >= LIMITE_SERVIDOR && (
          <Text style={e.ayuda}>Se muestran los {LIMITE_SERVIDOR} eventos más recientes.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function Chip({ titulo, activo, alTocar }: { titulo: string; activo: boolean; alTocar: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: activo }}
      onPress={alTocar}
      style={[e.filtro, activo && { backgroundColor: c.primario, borderColor: c.primario }]}
    >
      <Text style={[e.filtroTexto, activo && { color: c.sobrePrimario }]}>{titulo}</Text>
    </Pressable>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 640, gap: 12 },
  ayuda: { fontSize: 14, color: c.suave },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filtro: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 20, borderWidth: 1, borderColor: c.borde, backgroundColor: c.superficie },
  filtroTexto: { fontSize: 15, fontWeight: '600', color: c.texto },
  tarjeta: { flexDirection: 'row', gap: 12, backgroundColor: c.superficie, borderRadius: radio, padding: 14, borderWidth: 1, borderColor: c.borde },
  icono: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.celeste, alignItems: 'center', justifyContent: 'center' },
  frase: { fontSize: 15, fontWeight: '600', color: c.texto },
  detalle: { fontSize: 13, color: c.suave },
  vacio: { fontSize: 16, color: c.suave, textAlign: 'center', paddingVertical: 24 },
  error: { fontSize: 15, color: c.error },
});
