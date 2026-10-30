import type { CuentaDto, EstadoCuenta, Rol } from '@patrimonio/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Credenciales } from '../../sesion/credenciales';
import { Boton, EstadoCarga, Opciones } from '../../compartido/ui';
import { type AccionCuenta, cambiarEstadoCuenta, cambiarRolCuenta, listarCuentas, restablecerClave } from '../../datos/cuentas';
import { mensajeDeError, nombreDeCuenta } from '../../compartido/formato';
import { useSesion } from '../../sesion/sesion';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { comunes } from '../../compartido/estilos';
import { useCarga } from '../../compartido/useCarga';

type Filtro = 'activas' | 'todas';
const FILTROS: { valor: Filtro; titulo: string }[] = [
  { valor: 'activas', titulo: 'Activas' },
  { valor: 'todas', titulo: 'Todas' },
];

const ETIQUETA: Record<EstadoCuenta, string> = {
  pendiente: 'Pendiente',
  activa: 'Activa',
  rechazada: 'Rechazada',
  suspendida: 'Suspendida',
  baja: 'Baja',
};

/** Lo que se hace sobre una cuenta. `motivo`: se pide y queda en el registro de actividad. */
type Modo = AccionCuenta | 'rol' | 'clave';
interface Accion {
  modo: Modo;
  titulo: string;
  motivo: boolean;
  variante: 'primario' | 'secundario' | 'peligro';
}

const ACTIVAR: Accion = { modo: 'reactivar', titulo: 'Activar', motivo: false, variante: 'primario' };
const ACCIONES: Record<EstadoCuenta, Accion[]> = {
  activa: [
    { modo: 'clave', titulo: 'Restablecer contraseña', motivo: false, variante: 'secundario' },
    { modo: 'rol', titulo: 'Cambiar rol', motivo: true, variante: 'secundario' },
    { modo: 'suspender', titulo: 'Suspender', motivo: true, variante: 'peligro' },
  ],
  suspendida: [
    { modo: 'reactivar', titulo: 'Reactivar', motivo: false, variante: 'primario' },
    { modo: 'baja', titulo: 'Dar de baja', motivo: true, variante: 'peligro' },
  ],
  // Cuentas del registro anterior (autorregistro con aprobación): se pueden activar.
  pendiente: [ACTIVAR],
  rechazada: [ACTIVAR],
  baja: [],
};

export default function Cuentas() {
  const e = useEstilos(fabrica);
  const router = useRouter();
  const { perfil } = useSesion();
  const [filtro, setFiltro] = useState<Filtro>('activas');

  // Se actualiza cada vez que la pantalla vuelve a verse (por ejemplo, al volver de "Nueva cuenta").
  const { datos: cuentas, error, cargar } = useCarga(() => listarCuentas(), [], 'No se pudo cargar la lista.', { alEnfocar: true });

  const visibles = cuentas?.filter((cuenta) => filtro === 'todas' || cuenta.estado === 'activa');

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.columna}>
        <Boton texto="Nueva cuenta" onPress={() => router.push('/cuenta-nueva')} />
        <Opciones opciones={FILTROS.map((f) => ({ clave: f.valor, titulo: f.titulo }))} actual={filtro} alElegir={setFiltro} />

        <EstadoCarga error={error} cargando={!cuentas} alReintentar={cargar} grande />
        {visibles?.length === 0 && <Text style={e.vacio}>No hay cuentas.</Text>}
        {visibles?.map((cuenta) => (
          <TarjetaCuenta key={cuenta.id} cuenta={cuenta} propia={cuenta.id === perfil?.id} alCambiar={cargar} />
        ))}
      </View>
    </ScrollView>
  );
}

function TarjetaCuenta({ cuenta, propia, alCambiar }: { cuenta: CuentaDto; propia: boolean; alCambiar: () => Promise<void> }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [modo, setModo] = useState<Modo | null>(null);
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clave, setClave] = useState<string | null>(null);
  // Un administrador no puede cambiar su propia cuenta (lo impide la base; acá se oculta).
  const acciones = propia ? [] : ACCIONES[cuenta.estado];
  const elegida = acciones.find((a) => a.modo === modo);
  const rolNuevo: Rol = cuenta.rol === 'administrador' ? 'relevador' : 'administrador';

  const cancelar = () => {
    setModo(null);
    setMotivo('');
    setError(null);
  };

  const ejecutar = async (accion: Accion) => {
    setTrabajando(true);
    setError(null);
    try {
      if (accion.modo === 'clave') {
        setClave((await restablecerClave(cuenta.id)).claveTemporal);
        cancelar();
      } else if (accion.modo === 'rol') {
        await cambiarRolCuenta(cuenta.id, rolNuevo, motivo.trim());
        cancelar();
        await alCambiar();
      } else {
        await cambiarEstadoCuenta(cuenta.id, accion.modo, motivo.trim() || undefined);
        cancelar();
        await alCambiar();
      }
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo completar la acción.'));
    }
    setTrabajando(false);
  };

  const alPresionar = (accion: Accion) => {
    if (accion.motivo || accion.modo === 'clave') setModo(accion.modo);
    else void ejecutar(accion);
  };

  return (
    <View style={e.tarjeta}>
      <View style={e.fila}>
        <View style={{ flex: 1 }}>
          <Text style={e.nombre}>
            {cuenta.nombre ?? 'Sin nombre'}
            {propia ? ' (vos)' : ''}
          </Text>
          <Text style={e.detalle}>{nombreDeCuenta(cuenta.cuenta)}</Text>
        </View>
        <View style={[e.chip, cuenta.estado === 'activa' && { backgroundColor: c.ok }, cuenta.estado === 'suspendida' && { backgroundColor: c.error }]}>
          <Text style={e.chipTexto}>{ETIQUETA[cuenta.estado]}</Text>
        </View>
      </View>
      <Text style={e.detalle}>
        {cuenta.rol === 'administrador' ? 'Administrador' : 'Relevador'} · Creada el {new Date(cuenta.creadoEn).toLocaleDateString('es-AR')}
      </Text>
      {cuenta.debeCambiarClave && <Text style={e.detalle}>Todavía no cambió la contraseña temporal.</Text>}
      {cuenta.motivoEstado && <Text style={e.detalle}>Motivo: {cuenta.motivoEstado}</Text>}

      {clave && (
        <Credenciales cuenta={cuenta.cuenta} clave={clave} titulo="Contraseña restablecida" alCerrar={() => { setClave(null); void alCambiar(); }} />
      )}

      {elegida ? (
        <View style={{ gap: 10 }}>
          {elegida.modo === 'rol' && (
            <Text style={e.detalle}>
              Pasa de {cuenta.rol === 'administrador' ? 'administrador' : 'relevador'} a {rolNuevo === 'administrador' ? 'administrador' : 'relevador'}.
            </Text>
          )}
          {elegida.modo === 'clave' && (
            <Text style={e.detalle}>Se genera una contraseña temporal nueva. La persona tendrá que elegir otra al ingresar.</Text>
          )}
          {elegida.motivo && (
            <TextInput
              value={motivo}
              onChangeText={setMotivo}
              placeholder="Motivo (obligatorio)"
              placeholderTextColor={c.suave}
              style={e.campo}
              autoFocus
            />
          )}
          <View style={e.fila}>
            <View style={{ flex: 1 }}>
              <Boton texto="Cancelar" variante="secundario" onPress={cancelar} />
            </View>
            <View style={{ flex: 1 }}>
              <Boton
                texto="Confirmar"
                variante={elegida.variante === 'peligro' ? 'peligro' : 'primario'}
                cargando={trabajando}
                deshabilitado={elegida.motivo && motivo.trim().length < 3}
                onPress={() => ejecutar(elegida)}
              />
            </View>
          </View>
        </View>
      ) : (
        !clave &&
        acciones.length > 0 && (
          <View style={{ gap: 8 }}>
            {acciones.map((a) => (
              <Boton key={a.modo} texto={a.titulo} variante={a.variante} cargando={trabajando} onPress={() => alPresionar(a)} />
            ))}
          </View>
        )
      )}
      {error && <Text style={e.error}>{error}</Text>}
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 640, gap: 14 },
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 16, gap: 10, borderWidth: 1, borderColor: c.borde },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nombre: { fontSize: 17, fontWeight: '700', color: c.texto },
  detalle: { fontSize: 14, color: c.suave },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: c.suave },
  chipTexto: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  campo: { minHeight: 48, borderWidth: 1.5, borderColor: c.borde, borderRadius: radio, paddingHorizontal: 14, fontSize: 16, color: c.texto, backgroundColor: c.fondo },
  vacio: { fontSize: 16, color: c.suave, textAlign: 'center', paddingVertical: 24 },
});
