import { useState } from 'react';
import { Text, View } from 'react-native';
import { Boton, Cargando, Logo } from '../components/ui';
import { useSesion } from '../lib/sesion';
import { useEstilos, type Paleta } from '../lib/tema';

const TEXTOS = {
  pendiente: { titulo: 'Cuenta pendiente de aprobación', detalle: 'Un administrador de Patrimonio tiene que habilitarla antes de que puedas usar la app.' },
  rechazada: { titulo: 'Solicitud rechazada', detalle: 'Un administrador rechazó la solicitud de esta cuenta. Consultá con la Dirección de Patrimonio.' },
  suspendida: { titulo: 'Cuenta suspendida', detalle: 'Tu acceso está suspendido. Consultá con la Dirección de Patrimonio.' },
  baja: { titulo: 'Cuenta dada de baja', detalle: 'Esta cuenta ya no tiene acceso a la app.' },
} as const;

/** Se muestra con sesión abierta cuando la cuenta no está activa o no se pudo consultar su estado. */
export default function EstadoCuenta() {
  const { sesion, perfil, errorPerfil, recargarPerfil, cerrarSesion } = useSesion();
  const e = useEstilos(fabrica);
  const [actualizando, setActualizando] = useState(false);

  if (!perfil && !errorPerfil) return <Cargando texto="Consultando tu cuenta" />;
  const texto = TEXTOS[perfil?.estado === 'activa' || !perfil ? 'pendiente' : perfil.estado];

  const actualizar = async () => {
    setActualizando(true);
    await recargarPerfil();
    setActualizando(false);
  };

  return (
    <View style={e.contenedor}>
      <View style={e.columna}>
        <Logo ancho={200} />
        <Text style={e.titulo}>{errorPerfil ? 'No pudimos conectar' : texto.titulo}</Text>
        <Text style={e.texto}>
          {errorPerfil ?? `${sesion?.user.email}. ${texto.detalle}`}
        </Text>
        <View style={{ gap: 12, alignSelf: 'stretch' }}>
          <Boton texto={errorPerfil ? 'Reintentar' : 'Actualizar estado'} onPress={actualizar} cargando={actualizando} />
          <Boton texto="Cerrar sesión" variante="secundario" onPress={cerrarSesion} />
        </View>
      </View>
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  contenedor: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.fondo },
  columna: { width: '100%', maxWidth: 440, alignItems: 'center', gap: 18 },
  titulo: { fontSize: 22, fontWeight: '800', color: c.titulo, textAlign: 'center' },
  texto: { fontSize: 16, color: c.suave, textAlign: 'center' },
});
