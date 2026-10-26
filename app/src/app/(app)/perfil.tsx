import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Boton, Campo } from '../../components/ui';
import { actualizarNombre } from '../../lib/api';
import { useSesion } from '../../lib/sesion';
import { radio, useEstilos, type Paleta } from '../../lib/tema';

const LARGO_MINIMO = 8;

export default function Perfil() {
  const { perfil, recargarPerfil, cambiarClave, cerrarSesion } = useSesion();
  const e = useEstilos(fabrica);
  const [nombre, setNombre] = useState(perfil?.nombre ?? '');
  const [msgNombre, setMsgNombre] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [msgClave, setMsgClave] = useState<{ ok: boolean; texto: string } | null>(null);
  const [cambiando, setCambiando] = useState(false);

  const guardarNombre = async () => {
    setMsgNombre(null);
    if (nombre.trim().length < 3) return setMsgNombre({ ok: false, texto: 'Ingresá tu nombre y apellido.' });
    setGuardando(true);
    try {
      if (!perfil) throw new Error('No se pudo identificar la cuenta.');
      await actualizarNombre(perfil.id, nombre.trim());
      await recargarPerfil();
      setMsgNombre({ ok: true, texto: 'Datos guardados.' });
    } catch (error) {
      setMsgNombre({ ok: false, texto: error instanceof Error ? error.message : 'No se pudo guardar.' });
    }
    setGuardando(false);
  };

  const guardarClave = async () => {
    setMsgClave(null);
    if (clave.length < LARGO_MINIMO) return setMsgClave({ ok: false, texto: `Debe tener al menos ${LARGO_MINIMO} caracteres.` });
    if (clave !== repetida) return setMsgClave({ ok: false, texto: 'Las contraseñas no coinciden.' });
    setCambiando(true);
    const error = await cambiarClave(clave);
    setCambiando(false);
    if (error) return setMsgClave({ ok: false, texto: error });
    setClave('');
    setRepetida('');
    setMsgClave({ ok: true, texto: 'Contraseña actualizada.' });
  };

  return (
    <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
      <View style={e.columna}>
        <View style={e.tarjeta}>
          <Text style={e.seccion}>Mis datos</Text>
          <Campo etiqueta="Nombre y apellido" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
          <View style={{ gap: 2 }}>
            <Text style={e.etiqueta}>Cuenta</Text>
            <Text style={e.valor}>{perfil?.cuenta}</Text>
          </View>
          <View style={{ gap: 2 }}>
            <Text style={e.etiqueta}>Rol</Text>
            <Text style={e.valor}>{perfil?.rol === 'administrador' ? 'Administrador' : 'Relevador'}</Text>
          </View>
          {msgNombre && <Text style={msgNombre.ok ? e.ok : e.error}>{msgNombre.texto}</Text>}
          <Boton texto="Guardar cambios" onPress={guardarNombre} cargando={guardando} deshabilitado={nombre.trim() === (perfil?.nombre ?? '')} />
        </View>

        <View style={e.tarjeta}>
          <Text style={e.seccion}>Cambiar contraseña</Text>
          <Campo etiqueta="Contraseña nueva" value={clave} onChangeText={setClave} secureTextEntry textContentType="newPassword" />
          <Campo etiqueta="Repetir contraseña" value={repetida} onChangeText={setRepetida} secureTextEntry textContentType="newPassword" />
          {msgClave && <Text style={msgClave.ok ? e.ok : e.error}>{msgClave.texto}</Text>}
          <Boton texto="Actualizar contraseña" variante="secundario" onPress={guardarClave} cargando={cambiando} deshabilitado={!clave} />
        </View>

        <Boton texto="Cerrar sesión" variante="peligro" onPress={cerrarSesion} />
      </View>
    </ScrollView>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 560, gap: 16 },
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 18, gap: 14, borderWidth: 1, borderColor: c.borde },
  seccion: { fontSize: 18, fontWeight: '700', color: c.titulo },
  etiqueta: { fontSize: 13, color: c.suave },
  valor: { fontSize: 16, color: c.texto, fontWeight: '600' },
  ok: { color: c.ok, fontSize: 15 },
  error: { color: c.error, fontSize: 15 },
});
