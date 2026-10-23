import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Boton, Logo } from '../components/ui';
import { PanelPin } from '../components/pin';
import { LARGO_PIN, pinDebil, useBloqueo } from '../lib/bloqueo';
import { useSesion } from '../lib/sesion';
import { useEstilos, type Paleta } from '../lib/tema';

type Paso = { tipo: 'crear' } | { tipo: 'confirmar'; pin: string } | { tipo: 'biometria'; pin: string };

/** Primer ingreso de una sesión: se crea un PIN para proteger la app, y opcionalmente la huella o el rostro. */
export default function ConfigurarBloqueo() {
  const { configurar, biometriaDisponible } = useBloqueo();
  const { cerrarSesion } = useSesion();
  const e = useEstilos(fabrica);
  const [paso, setPaso] = useState<Paso>({ tipo: 'crear' });
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const crear = async (pin: string) => {
    if (pinDebil(pin)) return 'Elegí un PIN menos obvio (sin dígitos repetidos ni secuencias).';
    setAviso(null);
    setPaso({ tipo: 'confirmar', pin });
    return null;
  };

  const confirmar = async (pin: string) => {
    if (paso.tipo !== 'confirmar') return null;
    if (pin !== paso.pin) {
      setAviso('Los PIN no coinciden. Volvé a crearlo.');
      setPaso({ tipo: 'crear' });
      return null;
    }
    if (biometriaDisponible) setPaso({ tipo: 'biometria', pin });
    else await configurar(pin, false);
    return null;
  };

  const terminar = async (pin: string, biometria: boolean) => {
    setGuardando(true);
    await configurar(pin, biometria);
  };

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.columna}>
        <Logo ancho={180} />
        {paso.tipo === 'biometria' ? (
          <>
            <Text style={e.titulo}>¿Desbloquear con huella o rostro?</Text>
            <Text style={e.texto}>Podés usar la biometría del teléfono en lugar del PIN. El PIN sigue siendo el respaldo.</Text>
            <View style={{ gap: 12, alignSelf: 'stretch' }}>
              <Boton texto="Activar" cargando={guardando} onPress={() => terminar(paso.pin, true)} />
              <Boton texto="Ahora no" variante="secundario" deshabilitado={guardando} onPress={() => terminar(paso.pin, false)} />
            </View>
          </>
        ) : (
          <>
            <Text style={e.titulo}>{paso.tipo === 'crear' ? 'Creá un PIN de bloqueo' : 'Confirmá tu PIN'}</Text>
            <Text style={e.texto}>
              {paso.tipo === 'crear'
                ? `La app se bloquea al abrirla y tras 5 minutos en segundo plano. Elegí ${LARGO_PIN} dígitos.`
                : 'Ingresá el mismo PIN otra vez.'}
            </Text>
            {aviso && <Text style={e.aviso}>{aviso}</Text>}
            <PanelPin alCompletar={paso.tipo === 'crear' ? crear : confirmar} reinicio={paso.tipo} />
            <Boton texto="Cerrar sesión" variante="secundario" onPress={cerrarSesion} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.fondo },
  columna: { width: '100%', maxWidth: 400, alignItems: 'center', gap: 16 },
  titulo: { fontSize: 22, fontWeight: '800', color: c.titulo, textAlign: 'center' },
  texto: { fontSize: 15, color: c.suave, textAlign: 'center' },
  aviso: { fontSize: 15, color: c.error, textAlign: 'center' },
});
