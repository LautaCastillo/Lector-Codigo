import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PanelPin } from '../../components/pin';
import { Boton } from '../../components/ui';
import { LARGO_PIN, pinDebil, useBloqueo } from '../../lib/bloqueo';
import { useEstilos, type Paleta } from '../../lib/tema';

type Paso = { tipo: 'crear' } | { tipo: 'confirmar'; pin: string } | { tipo: 'biometria'; pin: string };

/** Activa (o cambia) el PIN opcional que protege la app, y opcionalmente la huella o el rostro. Se abre desde Ajustes. */
export default function ConfigurarBloqueo() {
  const { configurar, biometriaDisponible } = useBloqueo();
  const router = useRouter();
  const e = useEstilos(fabrica);
  const [paso, setPaso] = useState<Paso>({ tipo: 'crear' });
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async (pin: string, biometria: boolean) => {
    setGuardando(true);
    await configurar(pin, biometria);
    router.back();
  };

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
    else await guardar(pin, false);
    return null;
  };

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.columna}>
        {paso.tipo === 'biometria' ? (
          <>
            <Text style={e.titulo}>¿Desbloquear con huella o rostro?</Text>
            <Text style={e.texto}>Podés usar la biometría del teléfono en lugar del PIN. El PIN sigue siendo el respaldo.</Text>
            <View style={{ gap: 12, alignSelf: 'stretch' }}>
              <Boton texto="Activar" cargando={guardando} onPress={() => guardar(paso.pin, true)} />
              <Boton texto="Ahora no" variante="secundario" deshabilitado={guardando} onPress={() => guardar(paso.pin, false)} />
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
            <Boton texto="Cancelar" variante="secundario" onPress={() => router.back()} />
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
