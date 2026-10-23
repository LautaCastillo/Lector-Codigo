import { Ionicons } from '@expo/vector-icons';
import { esSimbologia, type Simbologia, type UbicacionDto } from '@patrimonio/shared';
import * as Crypto from 'expo-crypto';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Seccion } from '../../components/bien';
import { Boton } from '../../components/ui';
import { bienesDeUbicacion, enviarEscaneo, listarUbicaciones, simbologiasHabilitadas, subirRelevamientos } from '../../lib/api';
import { fechaHora } from '../../lib/formato';
import {
  agregarLectura,
  asegurarIds,
  buscarEnEsperados,
  marcarEnviados,
  nuevoLote,
  quitarItem,
  relevamientosPorEnviar,
  resolverPendiente,
  resumir,
  textoResumen,
  type ItemLote,
  type Lote,
  type Resolucion,
} from '../../lib/lote';
import { cargarLote, guardarLote } from '../../lib/lote-almacen';
import { radio, useEstilos, useTema, type Paleta } from '../../lib/tema';

type Fase = 'cargando' | 'elegir' | 'escanear' | 'resumen';

/** Mientras la misma etiqueta siga a la vista no se vuelve a contar; recién cuenta de nuevo si se aleja y vuelve. */
const MS_MISMA_ETIQUETA = 3000;
const MS_AVISO = 2600;

interface Aviso {
  texto: string;
  tono: 'ok' | 'aviso' | 'error';
}

export default function LotePorUbicacion() {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [fase, setFase] = useState<Fase>('cargando');
  const [lote, setLote] = useState<Lote | null>(null);
  const [guardado, setGuardado] = useState<Lote | null>(null);

  // Al entrar, si quedó un lote a medias se ofrece continuarlo.
  useEffect(() => {
    cargarLote().then((l) => {
      setGuardado(l ? asegurarIds(l, Crypto.randomUUID) : null);
      setFase('elegir');
    });
  }, []);

  const cambiar = useCallback((nuevo: Lote | null) => {
    setLote(nuevo);
    void guardarLote(nuevo);
  }, []);

  if (fase === 'cargando') {
    return (
      <View style={e.centro}>
        <ActivityIndicator size="large" color={c.accion} />
      </View>
    );
  }

  if (fase === 'elegir' || !lote) {
    return (
      <ElegirUbicacion
        guardado={guardado}
        alContinuar={() => {
          setLote(guardado);
          setFase('escanear');
        }}
        alDescartar={() => {
          setGuardado(null);
          cambiar(null);
        }}
        alEmpezar={(nuevo) => {
          setGuardado(null);
          cambiar(nuevo);
          setFase('escanear');
        }}
      />
    );
  }

  if (fase === 'resumen') {
    return (
      <Resumen
        lote={lote}
        alCambiar={cambiar}
        alSeguir={() => setFase('escanear')}
        alCerrar={() => {
          cambiar(null);
          setFase('elegir');
        }}
      />
    );
  }

  return <Escanear lote={lote} alCambiar={cambiar} alTerminar={() => setFase('resumen')} />;
}

/* ------------------------------------------------------------------ elegir ubicación */

function ElegirUbicacion({
  guardado,
  alContinuar,
  alDescartar,
  alEmpezar,
}: {
  guardado: Lote | null;
  alContinuar: () => void;
  alDescartar: () => void;
  alEmpezar: (lote: Lote) => void;
}) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [ubicaciones, setUbicaciones] = useState<UbicacionDto[] | null>(null);
  const [filtro, setFiltro] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setUbicaciones(await listarUbicaciones());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las ubicaciones.');
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return (ubicaciones ?? []).filter((u) => !q || u.nombre.toLowerCase().includes(q));
  }, [ubicaciones, filtro]);

  const empezar = async (nombre: string) => {
    setIniciando(nombre);
    try {
      alEmpezar(nuevoLote(nombre, await bienesDeUbicacion(nombre), Crypto.randomUUID()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar el lote.');
      setIniciando(null);
    }
  };

  const elegir = (nombre: string) => {
    if (!guardado) return void empezar(nombre);
    Alert.alert('Ya hay un lote en curso', `Empezar uno nuevo descarta el lote de "${guardado.ubicacion}" (${guardado.items.length} escaneados).`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Descartar y empezar', style: 'destructive', onPress: () => void empezar(nombre) },
    ]);
  };

  return (
    <View style={e.contenedor}>
      <View style={e.columna}>
        {guardado && (
          <View style={e.enCurso}>
            <Text style={e.enCursoTitulo}>Lote en curso</Text>
            <Text style={e.texto}>
              {guardado.ubicacion} · {guardado.items.length} escaneado{guardado.items.length === 1 ? '' : 's'} de {guardado.esperados.length} esperados
            </Text>
            <Text style={e.suave}>Iniciado el {fechaHora(guardado.iniciadoEn)}</Text>
            <View style={e.fila}>
              <View style={{ flex: 1 }}>
                <Boton texto="Continuar" onPress={alContinuar} />
              </View>
              <View style={{ flex: 1 }}>
                <Boton
                  texto="Descartar"
                  variante="peligro"
                  onPress={() =>
                    Alert.alert('Descartar el lote', 'Se pierden los escaneos de este lote. No se puede deshacer.', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Descartar', style: 'destructive', onPress: alDescartar },
                    ])
                  }
                />
              </View>
            </View>
          </View>
        )}

        <Text style={e.titulo}>¿En qué ubicación vas a relevar?</Text>
        <Text style={e.suave}>Se escanea en ráfaga y al terminar ves qué falta respecto de lo que el catálogo ubica ahí.</Text>
        <View style={e.campo}>
          <Ionicons name="search-outline" size={22} color={c.suave} />
          <TextInput value={filtro} onChangeText={setFiltro} placeholder="Filtrar ubicaciones" placeholderTextColor={c.suave} style={e.entrada} autoCorrect={false} accessibilityLabel="Filtrar ubicaciones" />
        </View>
        {error && (
          <View style={{ gap: 10 }}>
            <Text style={e.error}>{error}</Text>
            <Boton texto="Reintentar" variante="secundario" onPress={cargar} />
          </View>
        )}
        {!error && !ubicaciones && <ActivityIndicator color={c.accion} />}
        {ubicaciones && visibles.length === 0 && <Text style={e.suave}>No hay ubicaciones que coincidan.</Text>}
      </View>

      <FlatList
        data={visibles}
        keyExtractor={(u) => u.nombre}
        style={e.listaExterna}
        contentContainerStyle={e.lista}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.nombre}, ${item.cantidad} bienes`}
            disabled={iniciando !== null}
            onPress={() => elegir(item.nombre)}
            style={({ pressed }) => [e.ubicacion, pressed && { opacity: 0.85 }, iniciando && iniciando !== item.nombre && { opacity: 0.5 }]}
          >
            <Text style={e.ubicacionNombre} numberOfLines={3}>
              {item.nombre}
            </Text>
            {iniciando === item.nombre ? <ActivityIndicator color={c.accion} /> : <Text style={e.cantidad}>{item.cantidad}</Text>}
          </Pressable>
        )}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ escanear en ráfaga */

function Escanear({ lote, alCambiar, alTerminar }: { lote: Lote; alCambiar: (l: Lote) => void; alTerminar: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [simbologias, setSimbologias] = useState<Simbologia[] | null>(null);
  const [linterna, setLinterna] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const { width, height } = useWindowDimensions();
  const lateral = width > height && width >= 600;
  // `loteRef` evita leer un lote viejo desde el callback de la cámara, que se crea una sola vez.
  const loteRef = useRef(lote);
  loteRef.current = lote;
  const ocupado = useRef(false);
  const ultimaVista = useRef({ clave: '', hasta: 0 });
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    simbologiasHabilitadas().then(setSimbologias);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  const avisar = useCallback((nuevo: Aviso) => {
    setAviso(nuevo);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAviso(null), MS_AVISO);
  }, []);

  const alLeer = useCallback(
    async ({ type, data }: BarcodeScanningResult) => {
      if (!esSimbologia(type)) return;
      const clave = `${type}:${data}`;
      const ahora = Date.now();
      // Mientras la etiqueta siga a la vista se extiende la espera: solo cuenta al alejarse y volver.
      const sigueIgual = clave === ultimaVista.current.clave && ahora < ultimaVista.current.hasta;
      ultimaVista.current = { clave, hasta: ahora + MS_MISMA_ETIQUETA };
      if (sigueIgual || ocupado.current) return;
      ocupado.current = true;
      try {
        const lectura = { simbologia: type, valor: data };
        // Primero contra lo esperado, sin red; solo lo desconocido se consulta al servidor.
        const local = buscarEnEsperados(loteRef.current, type, data);
        let resolucion: Resolucion;
        if (local) resolucion = { estado: 'encontrado', bien: local };
        else {
          try {
            const r = await enviarEscaneo(type, data);
            resolucion = r.encontrado && r.bien ? { estado: 'encontrado', bien: r.bien } : { estado: 'no_encontrado' };
          } catch {
            resolucion = { estado: 'sin_verificar' };
          }
        }
        const { lote: nuevo, repetido, item } = agregarLectura(loteRef.current, lectura, resolucion, Crypto.randomUUID);
        loteRef.current = nuevo;
        alCambiar(nuevo);
        if (repetido) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          avisar({ texto: `Ya escaneado (${item.veces} veces): ${item.bien?.numeroInventario ?? item.leido}`, tono: 'aviso' });
        } else if (item.estado === 'encontrado' && item.enEsperados) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          avisar({ texto: `${item.bien!.numeroInventario} · ${item.bien!.descripcion ?? 'Sin descripción'}`, tono: 'ok' });
        } else if (item.estado === 'encontrado') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          avisar({ texto: `${item.bien!.numeroInventario} figura en otra ubicación`, tono: 'aviso' });
        } else if (item.estado === 'sin_verificar') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          avisar({ texto: `Sin conexión: ${item.leido} queda sin verificar`, tono: 'aviso' });
        } else {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          avisar({ texto: `No está en el catálogo: ${item.leido}`, tono: 'error' });
        }
      } finally {
        ocupado.current = false;
      }
    },
    [alCambiar, avisar],
  );

  const r = useMemo(() => resumir(lote), [lote]);

  const quitar = (item: ItemLote) =>
    Alert.alert('Quitar del lote', `${item.bien?.numeroInventario ?? item.leido}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => alCambiar(quitarItem(lote, item.clave)) },
    ]);

  if (!permiso) return <View style={e.centro} />;
  if (!permiso.granted) {
    return (
      <View style={e.centro}>
        <Text style={e.texto}>Se necesita acceso a la cámara para leer códigos.</Text>
        <Boton texto="Permitir cámara" onPress={pedirPermiso} />
      </View>
    );
  }

  const colorAviso = aviso?.tono === 'ok' ? c.ok : aviso?.tono === 'error' ? c.error : c.primario;

  return (
    <View style={[e.escaneo, lateral && { flexDirection: 'row' }]}>
      <View style={{ flex: 1 }}>
        {simbologias && <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={linterna} barcodeScannerSettings={{ barcodeTypes: simbologias }} onBarcodeScanned={alLeer} />}
        <View style={e.guia} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={e.marco} />
        </View>
        <View style={e.contador} accessible accessibilityLabel={`${r.encontrados.length} de ${r.esperados} esperados encontrados`}>
          <Text style={e.contadorTexto}>
            {r.encontrados.length} / {r.esperados}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={linterna ? 'Apagar linterna' : 'Encender linterna'} onPress={() => setLinterna((l) => !l)} style={[e.linterna, linterna && { backgroundColor: c.accion }]}>
          <Ionicons name={linterna ? 'flash' : 'flash-outline'} size={26} color="#FFFFFF" />
        </Pressable>
        {aviso && (
          <View style={[e.aviso, { backgroundColor: colorAviso }]} accessibilityLiveRegion="polite">
            <Text style={e.avisoTexto} numberOfLines={2}>
              {aviso.texto}
            </Text>
          </View>
        )}
      </View>

      <View style={[e.panelLote, lateral && { width: 380 }]}>
        <View style={e.panelCabecera}>
          <View style={{ flex: 1 }}>
            <Text style={e.panelTitulo} numberOfLines={1}>
              {lote.ubicacion}
            </Text>
            <Text style={e.suave}>
              {lote.items.length} escaneado{lote.items.length === 1 ? '' : 's'} · {r.faltantes.length} falta{r.faltantes.length === 1 ? '' : 'n'}
            </Text>
          </View>
          <View style={{ width: 150 }}>
            <Boton texto="Terminar lote" onPress={alTerminar} />
          </View>
        </View>
        <FlatList
          data={lote.items}
          keyExtractor={(i) => i.clave}
          style={{ maxHeight: lateral ? undefined : Math.round(height * 0.32) }}
          ListEmptyComponent={<Text style={e.suave}>Apuntá la cámara a las etiquetas, una tras otra. Se cuentan solas.</Text>}
          renderItem={({ item }) => <FilaItem item={item} alQuitar={() => quitar(item)} />}
        />
      </View>
    </View>
  );
}

function Etiqueta({ item }: { item: ItemLote }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const texto =
    item.estado === 'no_encontrado' ? 'No está en el catálogo' : item.estado === 'sin_verificar' ? 'Sin verificar' : item.enEsperados ? null : 'Otra ubicación';
  if (!texto) return null;
  const fondo = item.estado === 'no_encontrado' ? c.error : item.estado === 'sin_verificar' ? c.suave : c.primario;
  return (
    <View style={[e.etiqueta, { backgroundColor: fondo }]}>
      <Text style={e.etiquetaTexto}>{texto}</Text>
    </View>
  );
}

function FilaItem({ item, alQuitar }: { item: ItemLote; alQuitar?: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const ok = item.estado === 'encontrado' && item.enEsperados;
  return (
    <View style={e.item}>
      <Ionicons name={ok ? 'checkmark-circle' : item.estado === 'encontrado' ? 'swap-horizontal' : 'help-circle'} size={24} color={ok ? c.ok : item.estado === 'no_encontrado' ? c.error : c.suave} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={e.itemNumero}>{item.bien?.numeroInventario ?? item.leido}</Text>
        {item.bien && (
          <Text style={e.suave} numberOfLines={1}>
            {item.bien.descripcion ?? 'Sin descripción'}
          </Text>
        )}
        <View style={e.etiquetasFila}>
          <Etiqueta item={item} />
          {item.veces > 1 && (
            <View style={[e.etiqueta, { backgroundColor: c.accion }]}>
              <Text style={e.etiquetaTexto}>Repetido ×{item.veces}</Text>
            </View>
          )}
        </View>
      </View>
      {alQuitar && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${item.bien?.numeroInventario ?? item.leido}`} onPress={alQuitar} hitSlop={10} style={e.quitar}>
          <Ionicons name="trash-outline" size={22} color={c.suave} />
        </Pressable>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ resumen */

function Resumen({ lote, alCambiar, alSeguir, alCerrar }: { lote: Lote; alCambiar: (l: Lote) => void; alSeguir: () => void; alCerrar: () => void }) {
  const e = useEstilos(fabrica);
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
        const res = await enviarEscaneo(item.simbologia, item.leido);
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
      setResultadoEnvio({ ok: false, texto: err instanceof Error ? err.message : 'No se pudo enviar. Revisá la conexión y reintentá.' });
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
          {r.noEncontrados.length === 0 ? <Text style={e.suave}>Todo lo escaneado está en el catálogo.</Text> : r.noEncontrados.map((i) => <FilaItem key={i.clave} item={i} />)}
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
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const color = tono === 'ok' ? c.ok : tono === 'error' ? c.error : c.titulo;
  return (
    <View style={e.cifra} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      <Text style={[e.cifraValor, { color }]}>{valor}</Text>
      <Text style={e.suave}>{etiqueta}</Text>
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: c.fondo },
  contenedor: { flex: 1, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 720, padding: 20, gap: 12 },
  titulo: { fontSize: 20, fontWeight: '800', color: c.titulo },
  texto: { fontSize: 16, color: c.texto },
  suave: { fontSize: 14, color: c.suave },
  error: { fontSize: 15, color: c.error },
  fila: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  campo: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: radio, borderWidth: 1.5, borderColor: c.borde, backgroundColor: c.superficie },
  entrada: { flex: 1, fontSize: 16, color: c.texto, minHeight: 48 },
  envio: { backgroundColor: c.superficie, borderRadius: radio, padding: 16, gap: 8, borderWidth: 1, borderColor: c.borde },
  exito: { fontSize: 15, color: c.ok },
  enCurso: { backgroundColor: c.superficie, borderRadius: radio, padding: 16, gap: 8, borderWidth: 1.5, borderColor: c.accion },
  enCursoTitulo: { fontSize: 16, fontWeight: '800', color: c.titulo },
  listaExterna: { width: '100%' },
  lista: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  ubicacion: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, padding: 14, backgroundColor: c.superficie, borderRadius: radio, borderWidth: 1, borderColor: c.borde },
  ubicacionNombre: { flex: 1, fontSize: 15, fontWeight: '600', color: c.texto },
  cantidad: { fontSize: 20, fontWeight: '800', color: c.titulo },

  escaneo: { flex: 1, backgroundColor: '#000000' },
  guia: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  marco: { width: '78%', maxWidth: 360, aspectRatio: 1.8, borderRadius: 16, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  contador: { position: 'absolute', top: 16, left: 16, paddingHorizontal: 14, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  contadorTexto: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  linterna: { position: 'absolute', top: 16, right: 16, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  aviso: { position: 'absolute', left: 16, right: 16, bottom: 16, padding: 12, borderRadius: radio },
  avisoTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  panelLote: { backgroundColor: c.superficie, padding: 16, gap: 10 },
  panelCabecera: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  panelTitulo: { fontSize: 16, fontWeight: '800', color: c.titulo },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.borde },
  itemNumero: { fontSize: 16, fontWeight: '800', color: c.titulo },
  etiquetasFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  etiqueta: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, alignSelf: 'flex-start' },
  etiquetaTexto: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  quitar: { padding: 6 },

  resumenContenido: { alignItems: 'center', paddingBottom: 32 },
  tarjetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cifra: { flexGrow: 1, flexBasis: '45%', backgroundColor: c.superficie, borderRadius: radio, padding: 14, borderWidth: 1, borderColor: c.borde, gap: 2 },
  cifraValor: { fontSize: 28, fontWeight: '800' },
  faltante: { gap: 2, paddingVertical: 2 },
});
