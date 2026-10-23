import type { CuentaDto, EstadoCuenta } from '@patrimonio/shared';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Boton } from '../../components/ui';
import { cambiarEstadoCuenta, listarCuentas, type AccionCuenta } from '../../lib/api';
import { useSesion } from '../../lib/sesion';
import { radio, useEstilos, useTema, type Paleta } from '../../lib/tema';

type Filtro = 'pendiente' | 'todas';
const FILTROS: { valor: Filtro; titulo: string }[] = [
  { valor: 'pendiente', titulo: 'Pendientes' },
  { valor: 'todas', titulo: 'Todas' },
];

const ETIQUETA: Record<EstadoCuenta, string> = {
  pendiente: 'Pendiente',
  activa: 'Activa',
  rechazada: 'Rechazada',
  suspendida: 'Suspendida',
  baja: 'Baja',
};

/** Acciones disponibles según el estado. Las que destruyen acceso piden un motivo. */
const ACCIONES: Record<EstadoCuenta, { accion: AccionCuenta; titulo: string; motivo: boolean; variante: 'primario' | 'peligro' }[]> = {
  pendiente: [
    { accion: 'aprobar', titulo: 'Aprobar', motivo: false, variante: 'primario' },
    { accion: 'rechazar', titulo: 'Rechazar', motivo: true, variante: 'peligro' },
  ],
  activa: [{ accion: 'suspender', titulo: 'Suspender', motivo: true, variante: 'peligro' }],
  suspendida: [
    { accion: 'reactivar', titulo: 'Reactivar', motivo: false, variante: 'primario' },
    { accion: 'baja', titulo: 'Dar de baja', motivo: true, variante: 'peligro' },
  ],
  rechazada: [{ accion: 'aprobar', titulo: 'Aprobar', motivo: false, variante: 'primario' }],
  baja: [],
};

export default function Cuentas() {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const { perfil } = useSesion();
  const [filtro, setFiltro] = useState<Filtro>('pendiente');
  const [cuentas, setCuentas] = useState<CuentaDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setCuentas(await listarCuentas(filtro === 'pendiente' ? 'pendiente' : undefined));
    } catch (err) {
      setCuentas(null);
      setError(err instanceof Error ? err.message : 'No se pudo cargar la lista.');
    }
  }, [filtro]);

  useEffect(() => {
    setCuentas(null);
    void cargar();
  }, [cargar]);

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.columna}>
        <View style={e.filtros}>
          {FILTROS.map((f) => (
            <Pressable
              key={f.valor}
              accessibilityRole="tab"
              accessibilityState={{ selected: filtro === f.valor }}
              onPress={() => setFiltro(f.valor)}
              style={[e.filtro, filtro === f.valor && { backgroundColor: c.primario }]}
            >
              <Text style={[e.filtroTexto, filtro === f.valor && { color: c.sobrePrimario }]}>{f.titulo}</Text>
            </Pressable>
          ))}
        </View>

        {error && (
          <View style={{ gap: 12 }}>
            <Text style={e.error}>{error}</Text>
            <Boton texto="Reintentar" variante="secundario" onPress={cargar} />
          </View>
        )}
        {!error && !cuentas && <ActivityIndicator size="large" color={c.accion} />}
        {cuentas?.length === 0 && (
          <Text style={e.vacio}>{filtro === 'pendiente' ? 'No hay solicitudes pendientes.' : 'No hay cuentas.'}</Text>
        )}
        {cuentas?.map((cuenta) => (
          <TarjetaCuenta key={cuenta.id} cuenta={cuenta} propia={cuenta.cuenta === perfil?.cuenta} alCambiar={cargar} />
        ))}
      </View>
    </ScrollView>
  );
}

function TarjetaCuenta({ cuenta, propia, alCambiar }: { cuenta: CuentaDto; propia: boolean; alCambiar: () => Promise<void> }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [pidiendo, setPidiendo] = useState<AccionCuenta | null>(null);
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un administrador no puede cambiar su propia cuenta (lo impide el servidor; acá se oculta).
  const acciones = propia ? [] : ACCIONES[cuenta.estado];
  const elegida = acciones.find((a) => a.accion === pidiendo);

  const ejecutar = async (accion: AccionCuenta, texto?: string) => {
    setTrabajando(true);
    setError(null);
    try {
      await cambiarEstadoCuenta(cuenta.id, accion, texto);
      await alCambiar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
      setTrabajando(false);
    }
  };

  return (
    <View style={e.tarjeta}>
      <View style={e.fila}>
        <View style={{ flex: 1 }}>
          <Text style={e.nombre}>{cuenta.nombre ?? 'Sin nombre'}</Text>
          <Text style={e.detalle}>{cuenta.cuenta}</Text>
        </View>
        <View style={[e.chip, cuenta.estado === 'activa' && { backgroundColor: c.ok }, cuenta.estado === 'pendiente' && { backgroundColor: c.accion }]}>
          <Text style={e.chipTexto}>{ETIQUETA[cuenta.estado]}</Text>
        </View>
      </View>
      <Text style={e.detalle}>
        {cuenta.rol === 'administrador' ? 'Administrador' : 'Relevador'} · Solicitó el {new Date(cuenta.creadoEn).toLocaleDateString('es-AR')}
      </Text>
      {cuenta.motivoEstado && <Text style={e.detalle}>Motivo: {cuenta.motivoEstado}</Text>}

      {elegida ? (
        <View style={{ gap: 10 }}>
          <TextInput
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Motivo (obligatorio)"
            placeholderTextColor={c.suave}
            style={e.campo}
            autoFocus
          />
          <View style={e.fila}>
            <View style={{ flex: 1 }}>
              <Boton texto="Cancelar" variante="secundario" onPress={() => { setPidiendo(null); setMotivo(''); }} />
            </View>
            <View style={{ flex: 1 }}>
              <Boton texto={`Confirmar ${elegida.titulo.toLowerCase()}`} variante="peligro" cargando={trabajando} deshabilitado={motivo.trim().length < 3} onPress={() => ejecutar(elegida.accion, motivo.trim())} />
            </View>
          </View>
        </View>
      ) : (
        acciones.length > 0 && (
          <View style={e.fila}>
            {acciones.map((a) => (
              <View key={a.accion} style={{ flex: 1 }}>
                <Boton
                  texto={a.titulo}
                  variante={a.variante}
                  cargando={trabajando}
                  onPress={() => (a.motivo ? setPidiendo(a.accion) : ejecutar(a.accion))}
                />
              </View>
            ))}
          </View>
        )
      )}
      {error && <Text style={e.error}>{error}</Text>}
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 640, gap: 14 },
  filtros: { flexDirection: 'row', gap: 8 },
  filtro: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 20, borderWidth: 1, borderColor: c.borde, backgroundColor: c.superficie },
  filtroTexto: { fontSize: 15, fontWeight: '600', color: c.texto },
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 16, gap: 10, borderWidth: 1, borderColor: c.borde },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nombre: { fontSize: 17, fontWeight: '700', color: c.texto },
  detalle: { fontSize: 14, color: c.suave },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: c.suave },
  chipTexto: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  campo: { minHeight: 48, borderWidth: 1.5, borderColor: c.borde, borderRadius: radio, paddingHorizontal: 14, fontSize: 16, color: c.texto, backgroundColor: c.fondo },
  vacio: { fontSize: 16, color: c.suave, textAlign: 'center', paddingVertical: 24 },
  error: { fontSize: 15, color: c.error },
});
