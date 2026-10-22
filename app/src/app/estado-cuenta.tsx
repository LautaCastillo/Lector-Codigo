import { useState } from 'react';
import { Text, View } from 'react-native';
import { Boton, Cargando, Logo } from '../components/ui';
import { useSesion } from '../lib/sesion';
import { useEstilos, type Paleta } from '../lib/tema';

/** Se muestra con sesión abierta cuando la cuenta todavía no fue aprobada o no se pudo consultar el estado. */
export default function EstadoCuenta() {
  const { sesion, perfil, errorPerfil, recargarPerfil, cerrarSesion } = useSesion();
  const e = useEstilos(fabrica);
  const [actualizando, setActualizando] = useState(false);

  if (!perfil && !errorPerfil) return <Cargando texto="Consultando tu cuenta" />;

  const actualizar = async () => {
    setActualizando(true);
    await recargarPerfil();
    setActualizando(false);
  };

  return (
    <View style={e.contenedor}>
      <View style={e.columna}>
        <Logo ancho={200} />
        <Text style={e.titulo}>{errorPerfil ? 'No pudimos conectar' : 'Cuenta pendiente de aprobación'}</Text>
        <Text style={e.texto}>
          {errorPerfil ??
            `Registraste ${sesion?.user.email}. Un administrador de Patrimonio tiene que habilitarla antes de que puedas usar la app.`}
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
