import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Boton, Chip, EstadoCarga } from '../../compartido/ui';
import { listarAuditoria } from '../../datos/auditoria';
import { listarCuentas } from '../../datos/cuentas';
import { fechaHora } from '../../compartido/formato';
import { categoria, CATEGORIAS, describirEvento, type Categoria } from '../../compartido/actividad';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { comunes } from '../../compartido/estilos';
import { useCarga } from '../../compartido/useCarga';

const PAGINA = 50;
const LIMITE_SERVIDOR = 200;

const ICONOS: Record<Categoria, keyof typeof Ionicons.glyphMap> = {
  cuentas: 'person-outline',
  sesiones: 'log-in-outline',
  relevamientos: 'albums-outline',
  consultas: 'eye-outline',
};

/** Solo administradores: el registro de auditoría reciente, con filtros por cuentas, sesiones y consultas. */
export default function Actividad() {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [filtro, setFiltro] = useState<Categoria | null>(null);
  const [limite, setLimite] = useState(PAGINA);

  // Las cuentas se piden aparte para mostrar nombres en lugar de identificadores.
  const { datos, error, cargar, controlRecarga } = useCarga(
    async () => {
      const [lista, personas] = await Promise.all([listarAuditoria(limite), listarCuentas()]);
      return { eventos: lista, cuentas: personas };
    },
    [limite],
    'No se pudo cargar la actividad.',
    { conservar: true },
  );
  const eventos = datos?.eventos ?? null;
  const cuentas = datos?.cuentas ?? [];

  const nombres = useMemo(() => new Map(cuentas.map((p) => [p.id, p.nombre ?? p.cuenta])), [cuentas]);
  const nombre = useCallback((id: string | null) => (id ? (nombres.get(id) ?? 'una cuenta desconocida') : 'una cuenta'), [nombres]);

  const visibles = useMemo(() => (eventos ?? []).filter((ev) => !filtro || categoria(ev.tipo) === filtro), [eventos, filtro]);
  // Si el servidor devolvió menos de lo pedido, ya no hay más eventos.
  const hayMas = eventos !== null && eventos.length >= limite && limite < LIMITE_SERVIDOR;

  return (
    <ScrollView
      contentContainerStyle={e.contenido}
      refreshControl={controlRecarga}
    >
      <View style={e.columna}>
        <Text style={e.ayuda}>Registro de cuentas y sesiones. No se puede editar ni borrar. Cada consulta a esta pantalla también queda registrada.</Text>

        <View style={e.filtros}>
          <Chip rol="tab" tamano="pestana" texto="Todo" activo={filtro === null} alTocar={() => setFiltro(null)} />
          {CATEGORIAS.map((cat) => (
            <Chip key={cat.valor} rol="tab" tamano="pestana" texto={cat.titulo} activo={filtro === cat.valor} alTocar={() => setFiltro(cat.valor)} />
          ))}
        </View>

        <EstadoCarga error={error} cargando={!eventos} alReintentar={cargar} grande />
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

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 640, gap: 12 },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tarjeta: { flexDirection: 'row', gap: 12, backgroundColor: c.superficie, borderRadius: radio, padding: 14, borderWidth: 1, borderColor: c.borde },
  icono: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.celeste, alignItems: 'center', justifyContent: 'center' },
  frase: { fontSize: 15, fontWeight: '600', color: c.texto },
  detalle: { fontSize: 13, color: c.suave },
  vacio: { fontSize: 16, color: c.suave, textAlign: 'center', paddingVertical: 24 },
});
