import { Alert, FlatList, Text, View } from 'react-native';
import { comunes } from '../../compartido/estilos';
import { fechaHora } from '../../compartido/formato';
import { radio, useEstilos, type Paleta } from '../../compartido/tema';
import { Boton } from '../../compartido/ui';
import { descartar, enviarPendientes, useCola } from '../../datos/cola-envio';
import { comprobarRed } from '../../datos/red';
import type { Pendiente } from '../../funciones/cola/cola';

/** Las lecturas hechas en este teléfono que todavía no llegaron al servidor, y las que el servidor rechazó. */
export default function Pendientes() {
  const e = useEstilos(fabrica);
  const { pendientes, rechazadas, enviando, error, sinRed } = useCola();

  const enviarAhora = async () => {
    if (sinRed) await comprobarRed();
    await enviarPendientes();
  };

  const descartarLectura = (p: Pendiente) =>
    Alert.alert('Descartar la lectura', `${p.titulo}\nNo se envía y se pierde.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => descartar([p.idCliente]) },
    ]);

  return (
    <FlatList
      data={[...rechazadas, ...pendientes]}
      keyExtractor={(p) => p.idCliente}
      style={{ width: '100%' }}
      contentContainerStyle={e.lista}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          <Text style={e.ayuda}>
            {sinRed
              ? 'No hay conexión con el servidor. Lo que leas se guarda en el teléfono y se envía solo cuando vuelva la señal.'
              : 'Las lecturas se guardan en el teléfono y se envían solas. Acá ves las que todavía no llegaron.'}
          </Text>
          {error && <Text style={e.error}>{error}</Text>}
          {pendientes.length > 0 && <Boton texto={`Enviar ${pendientes.length} ahora`} cargando={enviando} onPress={enviarAhora} />}
        </View>
      }
      ListEmptyComponent={<Text style={e.ayuda}>No hay nada sin enviar.</Text>}
      renderItem={({ item }) => (
        <View style={e.tarjeta}>
          <Text style={e.titulo} numberOfLines={2}>
            {item.titulo}
          </Text>
          <Text style={e.ayuda}>
            {item.relevamiento.resultado === 'encontrado' ? 'Encontrado' : item.relevamiento.resultado === 'hallazgo' ? 'Hallazgo' : 'No encontrado'} · {fechaHora(item.relevamiento.relevadoEnDispositivo)}
            {item.porResolver ? ' · falta comprobar el código en el catálogo' : ''}
          </Text>
          {item.rechazo ? (
            <>
              <Text style={e.error}>El servidor la rechazó: {item.rechazo}</Text>
              <Boton texto="Descartar" variante="peligro" onPress={() => descartarLectura(item)} />
            </>
          ) : (
            <Text style={e.ayuda}>{enviando ? 'Enviando…' : 'Esperando para enviarse'}</Text>
          )}
        </View>
      )}
    />
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 6, borderWidth: 1, borderColor: c.borde },
  titulo: { fontSize: 16, fontWeight: '700', color: c.titulo },
});
