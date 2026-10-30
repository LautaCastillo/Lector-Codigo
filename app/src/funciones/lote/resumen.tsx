// Tercer paso del lote: cifras, listas de faltantes y otras ubicaciones, compartir el resumen y enviarlo al servidor.
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Seccion } from '../../compartido/bien';
import { Boton } from '../../compartido/ui';
import { resolverEscaneo } from '../../datos/catalogo';
import { subirRelevamientos } from '../../datos/relevamientos';
import { fechaHora, mensajeDeError } from '../../compartido/formato';
import { marcarEnviados, relevamientosPorEnviar, resolverPendiente, resumir, textoResumen, type Lote } from './lote';
import { useEstilos, useTema } from '../../compartido/tema';
import { fabricaLote } from './estilos';
import { FilaItem } from './items';

export function Resumen({ lote, alCambiar, alSeguir, alCerrar }: { lote: Lote; alCambiar: (l: Lote) => void; alSeguir: () => void; alCerrar: () => void }) {
  const e = useEstilos(fabricaLote);
  const router = useRouter();
  const r = useMemo(() => resumir(lote), [lote]);
  const [verificando, setVerificando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultadoEnvio, setResultadoEnvio] = useState<{ ok: boolean; texto: string } | null>(null);
  const porEnviar = useMemo(() => relevamientosPorEnviar(lote), [lote]);

  const compartir = () => void Share.share({ message: textoResumen(lote, fechaHora(new Date().toISOString())), title: `Lote en ${lote.ubicacion}` });

  const verificar = async () => {
    setVerificando(true);
    setMensaje(null);
    let actual = lote;
    let fallos = 0;
    for (const item of r.sinVerificar) {
      try {
        const res = await resolverEscaneo(item.simbologia, item.leido);
        actual = resolverPendiente(actual, item.clave, res.encontrado && res.bien ? { estado: 'encontrado', bien: res.bien } : { estado: 'no_encontrado' });
      } catch {
        fallos += 1;
      }
    }
    alCambiar(actual);
    setMensaje(fallos ? `${fallos} siguen sin verificar: no hay conexión.` : 'Todos verificados.');
    setVerificando(false);
  };

  /** Registra en el servidor lo que todavía no confirmó. Repetir el envío no duplica nada. */
  const enviar = async () => {
    setEnviando(true);
    setResultadoEnvio(null);
    try {
      const lista = relevamientosPorEnviar(lote);
      const res = await subirRelevamientos(lista);
      const rechazados = new Set(res.rechazados.map((x) => x.idCliente));
      alCambiar(marcarEnviados(lote, lista.map((x) => x.idCliente).filter((id) => !rechazados.has(id))));
      setResultadoEnvio(
        res.rechazados.length
          ? { ok: false, texto: `${res.registrados + res.duplicados} registrados. ${res.rechazados.length} rechazados: ${res.rechazados[0]?.motivo}` }
          : { ok: true, texto: `${res.registrados + res.duplicados} relevamientos registrados en el servidor.` },
      );
    } catch (err) {
      setResultadoEnvio({ ok: false, texto: mensajeDeError(err, 'No se pudo enviar. Revisá la conexión y reintentá.') });
    }
    setEnviando(false);
  };

  const cerrar = () =>
    Alert.alert('Cerrar el lote', porEnviar.length ? `Hay ${porEnviar.length} relevamientos sin enviar al servidor: se perderían. Enviá el lote antes de cerrarlo.` : 'Se borran los escaneos de este lote del teléfono. Lo ya enviado queda en Mis relevamientos.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar lote', style: 'destructive', onPress: alCerrar },
    ]);

  const abrir = (numero: string) => router.push({ pathname: '/bien/[numero]', params: { numero } });

  return (
    <ScrollView contentContainerStyle={e.resumenContenido}>
      <View style={e.columna}>
        <Text style={e.titulo}>{lote.ubicacion}</Text>
        <View style={e.tarjetas}>
          <Cifra valor={`${r.encontrados.length}/${r.esperados}`} etiqueta="Encontrados" tono="ok" />
          <Cifra valor={String(r.faltantes.length)} etiqueta="Faltantes" tono={r.faltantes.length ? 'error' : 'ok'} />
          <Cifra valor={String(r.otraUbicacion.length)} etiqueta="De otra ubicación" tono="neutro" />
          <Cifra valor={String(r.noEncontrados.length)} etiqueta="Fuera del catálogo" tono={r.noEncontrados.length ? 'error' : 'neutro'} />
        </View>
        {r.repetidos > 0 && <Text style={e.suave}>{r.repetidos} bien{r.repetidos === 1 ? '' : 'es'} se escaneó más de una vez; se cuentan una sola vez.</Text>}

        {r.sinVerificar.length > 0 && (
          <View style={e.enCurso}>
            <Text style={e.enCursoTitulo}>{r.sinVerificar.length} sin verificar</Text>
            <Text style={e.suave}>Se leyeron sin conexión y no se pudo comprobar si están en el catálogo.</Text>
            <Boton texto="Verificar ahora" cargando={verificando} onPress={verificar} />
            {mensaje && <Text style={e.suave}>{mensaje}</Text>}
          </View>
        )}

        <View style={e.envio}>
          <Text style={e.enCursoTitulo}>Registro en el servidor</Text>
          {porEnviar.length > 0 ? (
            <Text style={e.suave}>
              {porEnviar.length} relevamiento{porEnviar.length === 1 ? '' : 's'} sin enviar. Al enviarlos quedan en "Mis relevamientos" y Patrimonio puede consultarlos. No modifica SIU.
            </Text>
          ) : (
            <Text style={e.suave}>{lote.enviados.length > 0 ? 'Todo lo escaneado ya está registrado en el servidor.' : 'Todavía no hay nada para enviar.'}</Text>
          )}
          {r.sinVerificar.length > 0 && <Text style={e.suave}>Los {r.sinVerificar.length} sin verificar no se envían hasta comprobarlos.</Text>}
          {porEnviar.length > 0 && <Boton texto={`Enviar ${porEnviar.length} al servidor`} cargando={enviando} onPress={enviar} />}
          {resultadoEnvio && <Text style={resultadoEnvio.ok ? e.exito : e.error}>{resultadoEnvio.texto}</Text>}
        </View>

        <Seccion titulo={`Faltantes (${r.faltantes.length})`} inicialAbierta={r.faltantes.length > 0}>
          {r.faltantes.length === 0 ? (
            <Text style={e.suave}>No falta ningún bien de los que el catálogo ubica acá.</Text>
          ) : (
            r.faltantes.map((b) => (
              <Pressable key={b.id} accessibilityRole="button" onPress={() => abrir(b.numeroInventario)} style={e.faltante}>
                <Text style={e.itemNumero}>{b.numeroInventario}</Text>
                <Text style={e.suave} numberOfLines={2}>
                  {b.descripcion ?? 'Sin descripción'}
                </Text>
              </Pressable>
            ))
          )}
        </Seccion>
        <Seccion titulo={`De otra ubicación (${r.otraUbicacion.length})`} inicialAbierta={r.otraUbicacion.length > 0}>
          {r.otraUbicacion.length === 0 ? (
            <Text style={e.suave}>Todo lo escaneado figura en esta ubicación.</Text>
          ) : (
            r.otraUbicacion.map((i) => (
              <View key={i.clave} style={{ gap: 2 }}>
                <Text style={e.itemNumero}>{i.bien!.numeroInventario}</Text>
                <Text style={e.suave}>Figura en: {i.bien!.ubicacionFisica ?? 'sin ubicación'}</Text>
              </View>
            ))
          )}
        </Seccion>
        <Seccion titulo={`Fuera del catálogo (${r.noEncontrados.length})`} inicialAbierta={r.noEncontrados.length > 0}>
          {r.noEncontrados.length === 0 ? <Text style={e.suave}>Todo lo escaneado está en el catálogo.</Text> : r.noEncontrados.map((i) => (
              <View key={i.clave} style={{ gap: 6 }}>
                <FilaItem item={i} />
                <Boton texto="Registrar como hallazgo" variante="secundario" onPress={() => router.push({ pathname: '/hallazgo/nuevo', params: { simbologia: i.simbologia, leido: i.leido } })} />
              </View>
            ))}
        </Seccion>
        <Seccion titulo={`Encontrados (${r.encontrados.length})`} inicialAbierta={false}>
          {r.encontrados.map((i) => (
            <FilaItem key={i.clave} item={i} />
          ))}
        </Seccion>

        <Text style={e.suave}>El resumen de faltantes se calcula en el teléfono: se puede compartir como texto. Lo que se envía al servidor son los relevamientos escaneados.</Text>

        <Boton texto="Compartir resumen" onPress={compartir} />
        <Boton texto="Seguir escaneando" variante="secundario" onPress={alSeguir} />
        <Boton texto="Cerrar lote" variante="peligro" onPress={cerrar} />
      </View>
    </ScrollView>
  );
}

function Cifra({ valor, etiqueta, tono }: { valor: string; etiqueta: string; tono: 'ok' | 'error' | 'neutro' }) {
  const e = useEstilos(fabricaLote);
  const { c } = useTema();
  const color = tono === 'ok' ? c.ok : tono === 'error' ? c.error : c.titulo;
  return (
    <View style={e.cifra} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      <Text style={[e.cifraValor, { color }]}>{valor}</Text>
      <Text style={e.suave}>{etiqueta}</Text>
    </View>
  );
}
