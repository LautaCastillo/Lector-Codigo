// Comentarios de un bien o de una jornada: la lista, el cuadro para escribir uno nuevo y retirar los propios (o cualquiera, siendo administrador).
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { fechaHora, mensajeDeError } from '../../compartido/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { Boton, EstadoCarga } from '../../compartido/ui';
import { comentar, comentariosDe, retirarComentario, type Comentario, type DestinoComentario } from '../../datos/comentarios';
import { useSesion } from '../../sesion/sesion';

const LARGO = 500;

export function Comentarios({ destino, alCambiar }: { destino: DestinoComentario; alCambiar?: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const { perfil } = useSesion();
  const [lista, setLista] = useState<Comentario[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Si el envío falla y se reintenta, el servidor no duplica el comentario.
  const idCliente = useRef(Crypto.randomUUID());
  const esAdmin = perfil?.rol === 'administrador';
  const clave = destino.bienId ?? destino.jornadaId;

  const cargar = useCallback(async () => {
    try {
      setLista(await comentariosDe(destino.bienId ? { bienId: destino.bienId } : { jornadaId: destino.jornadaId! }));
      setErrorCarga(null);
    } catch (err) {
      setErrorCarga(mensajeDeError(err, 'No se pudieron cargar los comentarios.'));
    }
  }, [clave]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enviar = async () => {
    setError(null);
    setEnviando(true);
    try {
      await comentar(destino, texto, idCliente.current);
      idCliente.current = Crypto.randomUUID();
      setTexto('');
      await cargar();
      alCambiar?.();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el comentario. Revisá la conexión y reintentá.'));
    }
    setEnviando(false);
  };

  const retirar = (comentario: Comentario) =>
    Alert.alert('Retirar el comentario', `${comentario.texto}\nDeja de mostrarse; queda registrado quién lo retiró.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Retirar',
        style: 'destructive',
        onPress: async () => {
          try {
            await retirarComentario(comentario.id);
            await cargar();
            alCambiar?.();
          } catch (err) {
            setError(mensajeDeError(err, 'No se pudo retirar el comentario.'));
          }
        },
      },
    ]);

  return (
    <View style={{ gap: 10 }}>
      <TextInput
        value={texto}
        onChangeText={(t) => setTexto(t.slice(0, LARGO))}
        placeholder={destino.bienId ? 'Por ejemplo: prestado a otra oficina' : 'Por ejemplo: la puerta del sector estaba cerrada'}
        placeholderTextColor={c.suave}
        style={e.campo}
        multiline
        accessibilityLabel="Nuevo comentario"
      />
      <Text style={e.contador}>
        {texto.length}/{LARGO}
      </Text>
      {error && <Text style={e.error}>{error}</Text>}
      <Boton texto="Comentar" cargando={enviando} deshabilitado={texto.trim().length === 0} onPress={enviar} />

      <EstadoCarga error={errorCarga} cargando={lista === null} alReintentar={cargar} />
      {lista?.length === 0 && <Text style={e.ayuda}>Todavía no hay comentarios.</Text>}
      {lista?.map((x) => (
        <View key={x.id} style={e.comentario}>
          <Text style={e.encabezado}>
            {x.propio ? 'Vos' : x.autor} · {fechaHora(x.creadoEn)}
            {x.bien ? ` · ${x.bien.numeroInventario}` : ''}
          </Text>
          <Text style={e.texto} selectable>
            {x.texto}
          </Text>
          {(x.propio || esAdmin) && (
            <Pressable accessibilityRole="button" onPress={() => retirar(x)} hitSlop={8}>
              <Text style={e.retirar}>Retirar</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  campo: { minHeight: 70, borderWidth: 1.5, borderColor: c.borde, borderRadius: radio, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: c.texto, backgroundColor: c.fondo, textAlignVertical: 'top' },
  contador: { fontSize: 12, color: c.suave, textAlign: 'right' },
  error: { fontSize: 14, color: c.error },
  ayuda: { fontSize: 14, color: c.suave },
  comentario: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.borde },
  encabezado: { fontSize: 13, fontWeight: '700', color: c.suave },
  texto: { fontSize: 15, color: c.texto },
  retirar: { fontSize: 13, fontWeight: '600', color: c.accion },
});
