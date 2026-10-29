import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { nombreDeCuenta } from '../lib/formato';
import { radio, useEstilos, type Paleta } from '../lib/tema';
import { Boton } from './ui';

/**
 * Muestra una sola vez el usuario y la contraseña temporal de una cuenta recién creada (o restablecida), para que
 * el administrador se las entregue a la persona. La contraseña no se guarda en ningún lado: al cerrar, se pierde.
 */
export function Credenciales({
  cuenta,
  clave,
  titulo,
  alCerrar,
}: {
  cuenta: string;
  clave: string;
  titulo: string;
  alCerrar: () => void;
}) {
  const e = useEstilos(fabrica);
  const [copiado, setCopiado] = useState(false);
  const usuario = nombreDeCuenta(cuenta);

  const copiar = async () => {
    await Clipboard.setStringAsync(`Usuario: ${usuario}\nContraseña temporal: ${clave}`);
    setCopiado(true);
  };

  return (
    <View style={e.tarjeta}>
      <Text style={e.titulo}>{titulo}</Text>
      <View style={{ gap: 2 }}>
        <Text style={e.etiqueta}>Usuario</Text>
        <Text style={e.valor} selectable>
          {usuario}
        </Text>
      </View>
      <View style={{ gap: 2 }}>
        <Text style={e.etiqueta}>Contraseña temporal</Text>
        <Text style={[e.valor, e.mono]} selectable>
          {clave}
        </Text>
      </View>
      <Text style={e.aviso}>
        Copiala o anotala ahora: no se vuelve a mostrar. La persona va a tener que elegir una contraseña propia al ingresar.
      </Text>
      <Boton texto={copiado ? 'Copiado' : 'Copiar usuario y contraseña'} variante="secundario" onPress={copiar} />
      <Boton texto="Listo" onPress={alCerrar} />
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 18, gap: 14, borderWidth: 1.5, borderColor: c.ok },
  titulo: { fontSize: 18, fontWeight: '700', color: c.titulo },
  etiqueta: { fontSize: 13, color: c.suave },
  valor: { fontSize: 18, fontWeight: '700', color: c.texto },
  mono: { fontFamily: 'monospace', letterSpacing: 1 },
  aviso: { fontSize: 14, color: c.suave },
});
