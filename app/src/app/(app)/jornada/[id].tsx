import { Ionicons } from '@expo/vector-icons';
import { esSimbologia, SIMBOLOGIAS_POR_DEFECTO } from '@patrimonio/shared';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { comunes } from '../../../compartido/estilos';
import { fechaHora, mensajeDeError } from '../../../compartido/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../../compartido/tema';
import { Barra, Boton, Chip, EstadoCarga, Opciones } from '../../../compartido/ui';
import { useLector } from '../../../compartido/useLector';
import { resolverEscaneo } from '../../../datos/catalogo';
import { descartar, encolar, enviarPendientes, estadoDe, useCola } from '../../../datos/cola-envio';
import { contarComentariosDeJornada } from '../../../datos/comentarios';
import { cerrarJornada, soltarSector, tomarSector, type FilaAvance } from '../../../datos/jornadas';
import { conLimite, estaSinRed, marcarRed } from '../../../datos/red';
import { anularRelevamiento } from '../../../datos/relevamientos';
import { esFalloDeRed } from '../../../datos/util';
import { buscarEnFilas } from '../../../funciones/cola/cola';
import { FilaDeAvance } from '../../../funciones/jornada/fila-avance';
import { useJornada } from '../../../funciones/jornada/useJornada';
import { useSesion } from '../../../sesion/sesion';

type Pestana = 'pendientes' | 'encontrados' | 'apartados' | 'otros';
type Aviso = { tipo: 'ok' | 'alerta' | 'error'; texto: string };

/** Mientras la misma etiqueta siga a la vista no se vuelve a contar; recién cuenta de nuevo si se aleja y vuelve. */
const MS_MISMA_ETIQUETA = 3000;
/** Pausa entre una lectura y la siguiente: da tiempo a ver el aviso y evita leer por error la etiqueta vecina. */
const PAUSA_ENTRE_LECTURAS_MS = 700;
/** Cuánto se espera al servidor antes de seguir leyendo; lo que no llegó queda en la cola y se envía solo. */
const ESPERA_ENVIO_MS = 8000;
const ESPERA_CATALOGO_MS = 8000;
const SUFIJO = { enviada: '', guardada: ' Guardado en el teléfono: se envía cuando haya conexión.' } as const;

/** Lo que hace falta saber de un bien para avisar al leerlo: sale de lo esperado de la jornada o del catálogo. */
interface BienLeido {
  id: string;
  numeroInventario: string;
  descripcion: string | null;
  ubicacionFisica: string | null;
  areaResponsable: string | null;
}

/** Una jornada compartida: lo esperado del área o la ubicación, el avance de todo el equipo y el escaneo. Se actualiza en vivo. */
export default function PantallaJornada() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { perfil } = useSesion();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const { jornada, filas, filasRef, sectores, error, cargar, controlRecarga, esperadas, contables, pendientes, apartadas, encontradas, otros, ubicaciones, porcentaje } = useJornada(id);
  const { pendientes: enCola } = useCola();
  const [comentarios, setComentarios] = useState(0);

  // La cantidad se vuelve a pedir al volver de la pantalla de comentarios; sin conexión queda la última conocida.
  useFocusEffect(
    useCallback(() => {
      contarComentariosDeJornada(id)
        .then(setComentarios)
        .catch(() => undefined);
    }, [id]),
  );
  const [pestana, setPestana] = useState<Pestana>('pendientes');
  const [camara, setCamara] = useState(false);
  const [ubicacionActual, setUbicacionActual] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  // Escaneo continuo: la misma etiqueta cuenta una sola vez mientras siga a la vista, y entre una lectura y la siguiente hay una pausa corta.
  const { tomar, liberar } = useLector({ ventanaMs: MS_MISMA_ETIQUETA, extender: true });
  const [linterna, setLinterna] = useState(false);

  // La linterna se apaga con la cámara.
  useEffect(() => {
    if (!camara) setLinterna(false);
  }, [camara]);

  const yo = perfil?.nombre ?? perfil?.cuenta ?? '';
  const abierta = jornada?.estado === 'abierta';
  const puedeCerrar = abierta && (jornada?.propia || perfil?.rol === 'administrador');

  // En una jornada de ubicación, se está siempre en esa ubicación.
  useEffect(() => {
    if (jornada?.tipo === 'ubicacion') setUbicacionActual(jornada.alcance);
  }, [jornada]);

  /**
   * Registra un relevamiento de esta jornada. Se anota primero en el teléfono y se manda enseguida; sin conexión queda
   * guardado y se envía solo. Devuelve `guardada` cuando todavía no llegó al servidor. Lanza si el servidor la rechaza.
   */
  const registrar = useCallback(
    async (datos: { resultado: 'encontrado' | 'no_encontrado'; numeroInventario?: string; simbologia?: string; valorLeido?: string }, titulo: string, porResolver = false) => {
      const idCliente = Crypto.randomUUID();
      await encolar(
        {
          idCliente,
          resultado: datos.resultado,
          relevadoEnDispositivo: new Date().toISOString(),
          jornadaId: id,
          ...(datos.numeroInventario ? { numeroInventario: datos.numeroInventario } : {}),
          ...(datos.simbologia && esSimbologia(datos.simbologia) ? { simbologia: datos.simbologia } : {}),
          ...(datos.valorLeido ? { valorLeido: datos.valorLeido } : {}),
          ...(ubicacionActual ? { ubicacionObservada: ubicacionActual } : {}),
        },
        titulo,
        porResolver,
      );
      // Con la red caída no se espera. Con red, se espera un rato corto: si el envío tarda, la cámara no se frena.
      if (!estaSinRed()) await conLimite(enviarPendientes(), ESPERA_ENVIO_MS).catch(() => undefined);
      const resultado = estadoDe(idCliente);
      if (resultado.estado === 'rechazada') {
        descartar([idCliente]);
        throw new Error(resultado.motivo);
      }
      return resultado.estado === 'enviada' ? 'enviada' : 'guardada';
    },
    [id, ubicacionActual],
  );

  const alLeer = useCallback(
    async ({ type: tipo, data }: BarcodeScanningResult) => {
      if (!abierta) return;
      const type = tomar(tipo, data);
      if (!type) return;
      // Bien que esta lectura acaba de registrar y estaba pendiente a nuestros ojos: si al recargar resulta que otra persona
      // llegó primero (lecturas casi simultáneas, antes de que llegara el cambio en vivo), se avisa igual.
      let registrado: { id: string; titulo: string } | null = null;
      try {
        // Primero contra lo esperado de la jornada, sin red; solo lo desconocido se consulta al catálogo.
        const local = buscarEnFilas(filasRef.current ?? [], type, data);
        let bien: BienLeido | null = local
          ? { id: local.bienId!, numeroInventario: local.numeroInventario!, descripcion: local.descripcion, ubicacionFisica: local.ubicacionFisica, areaResponsable: local.areaResponsable }
          : null;
        let sinCatalogo = false;
        if (!bien) {
          if (estaSinRed()) sinCatalogo = true;
          else {
            try {
              const r = await conLimite(resolverEscaneo(type, data), ESPERA_CATALOGO_MS);
              bien = r.encontrado && r.bien ? r.bien : null;
            } catch (err) {
              if (!esFalloDeRed(err)) throw err;
              marcarRed(false);
              sinCatalogo = true;
            }
          }
        }

        if (sinCatalogo) {
          await registrar({ resultado: 'no_encontrado', simbologia: type, valorLeido: data }, `Código ${data}`, true);
          setAviso({ tipo: 'alerta', texto: `Sin conexión: el código ${data} quedó guardado en el teléfono y se comprobará al enviarlo.` });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else if (!bien) {
          const estado = await registrar({ resultado: 'no_encontrado', simbologia: type, valorLeido: data }, `Código ${data}`);
          setAviso({ tipo: 'alerta', texto: `El código ${data} no está en el catálogo. Quedó anotado.${SUFIJO[estado]}` });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          const bienLeido = bien;
          const fila = filasRef.current?.find((f) => f.tipo === 'esperado' && f.bienId === bienLeido.id);
          const titulo = bienLeido.descripcion ?? bienLeido.numeroInventario;
          if (fila?.encontrado && fila.relevador === yo) {
            setAviso({ tipo: 'alerta', texto: `Ya lo relevaste: ${titulo}` });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } else {
            const estado = await registrar({ resultado: 'encontrado', numeroInventario: bienLeido.numeroInventario, simbologia: type, valorLeido: data }, `${bienLeido.numeroInventario} · ${titulo}`);
            if (fila && !fila.encontrado && estado === 'enviada') registrado = { id: bienLeido.id, titulo };
            const sufijo = SUFIJO[estado];
            if (!fila) {
              setAviso({ tipo: 'alerta', texto: `${titulo} es de otra área: ${bienLeido.areaResponsable ?? 'sin área'}. Quedó anotado.${sufijo}` });
            } else if (fila.encontrado) {
              setAviso({ tipo: 'alerta', texto: `${titulo}: ya lo había relevado ${fila.relevador}. Figura él; tu lectura quedó anotada.${sufijo}` });
            } else if (ubicacionActual && bienLeido.ubicacionFisica && ubicacionActual !== bienLeido.ubicacionFisica) {
              setAviso({ tipo: 'alerta', texto: `Encontrado: ${titulo}. Ojo: según el catálogo figura en ${bienLeido.ubicacionFisica}.${sufijo}` });
            } else {
              setAviso({ tipo: estado === 'enviada' ? 'ok' : 'alerta', texto: `Encontrado: ${titulo}${sufijo}` });
            }
            void Haptics.notificationAsync(fila && !fila.encontrado ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
          }
        }
        // Sin red no se vuelve a pedir el avance: la pantalla ya muestra la lectura con lo guardado en el teléfono.
        const nuevas = estaSinRed() ? null : await cargar();
        const propio = registrado ? nuevas?.find((f) => f.tipo === 'esperado' && f.bienId === registrado!.id) : undefined;
        if (registrado && propio && propio.relevador !== yo) {
          setAviso({ tipo: 'alerta', texto: `${registrado.titulo}: lo relevó primero ${propio.relevador}. Se anotó también tu lectura.` });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      } catch (err) {
        setAviso({ tipo: 'error', texto: mensajeDeError(err, 'No se pudo registrar la lectura.') });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setTimeout(liberar, PAUSA_ENTRE_LECTURAS_MS);
      }
    },
    [abierta, cargar, filasRef, liberar, registrar, tomar, ubicacionActual, yo],
  );

  /** Para cuando el código está dañado: se marca a mano un bien pendiente. */
  const marcarAMano = (fila: FilaAvance) => {
    if (!abierta || !fila.numeroInventario) return;
    Alert.alert(fila.descripcion ?? fila.numeroInventario, `${fila.numeroInventario}\n¿Qué querés hacer?`, [
      { text: 'Ver ficha', onPress: () => router.push({ pathname: '/bien/[numero]', params: { numero: fila.numeroInventario! } }) },
      {
        text: 'Relevar con detalle',
        onPress: () =>
          router.push({
            pathname: '/relevamiento/nuevo',
            params: { numero: fila.numeroInventario!, jornadaId: id, ...(ubicacionActual ? { ubicacion: ubicacionActual } : {}) },
          }),
      },
      {
        text: 'Marcar como encontrado',
        onPress: async () => {
          try {
            const estado = await registrar({ resultado: 'encontrado', numeroInventario: fila.numeroInventario! }, `${fila.numeroInventario} · ${fila.descripcion ?? 'Sin descripción'}`);
            setAviso({ tipo: estado === 'enviada' ? 'ok' : 'alerta', texto: `Marcado a mano: ${fila.descripcion ?? fila.numeroInventario}${SUFIJO[estado]}` });
            if (!estaSinRed()) await cargar();
          } catch (err) {
            setAviso({ tipo: 'error', texto: mensajeDeError(err, 'No se pudo registrar.') });
          }
        },
      },
    ], { cancelable: true }); // Android admite tres botones: se cancela tocando fuera del cuadro.
  };

  const sinEnviarAca = enCola.filter((p) => p.relevamiento.jornadaId === id).length;

  const confirmarCierre = () =>
    sinEnviarAca > 0
      ? Alert.alert('Hay lecturas sin enviar', `${sinEnviarAca} lectura${sinEnviarAca === 1 ? '' : 's'} de este teléfono no llegó${sinEnviarAca === 1 ? '' : 'ron'} al servidor. Esperá a que se envíen${estaSinRed() ? ' (hace falta conexión)' : ''} antes de cerrar la jornada: una jornada cerrada ya no admite lecturas.`)
      : Alert.alert('¿Cerrar la jornada?', `Quedan ${pendientes.length} bienes sin relevar. Una jornada cerrada ya no admite lecturas.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar',
        style: 'destructive',
        onPress: async () => {
          try {
            await cerrarJornada(id);
            setCamara(false);
            await cargar();
          } catch (err) {
            setAviso({ tipo: 'error', texto: mensajeDeError(err, 'No se pudo cerrar.') });
          }
        },
      },
    ]);

  /** Deshace una lectura equivocada: queda anulada (no cuenta) y, si había otra lectura del mismo bien, pasa a figurar esa. */
  const deshacer = (item: FilaAvance) => {
    const titulo = item.descripcion ?? item.numeroInventario ?? 'esta lectura';
    Alert.alert(titulo, `${item.numeroInventario ?? item.codigoProvisorio ?? ''}\nSe deshace la lectura de ${item.relevador === yo ? 'tu cuenta' : item.relevador}.`.trim(), [
      {
        text: 'Deshacer lectura',
        style: 'destructive',
        onPress: async () => {
          try {
            await anularRelevamiento(item.relevamientoId!);
            setAviso({ tipo: 'ok', texto: `Lectura deshecha: ${titulo}` });
            await cargar();
          } catch (err) {
            setAviso({ tipo: 'error', texto: mensajeDeError(err, 'No se pudo deshacer la lectura.') });
          }
        },
      },
      ...(item.numeroInventario
        ? [{ text: 'Ver ficha', onPress: () => router.push({ pathname: '/bien/[numero]', params: { numero: item.numeroInventario! } }) }]
        : []),
    ], { cancelable: true });
  };

  /** Tocar una fila: marcarla a mano si está pendiente; deshacer la lectura propia (o cualquiera, si es administrador); si no, abrir la ficha. */
  const puedeDeshacer = (item: FilaAvance) =>
    !!abierta && !!item.relevamientoId && (item.relevador === yo || perfil?.rol === 'administrador') && (item.encontrado || item.tipo === 'extra');

  const alTocarFila = (item: FilaAvance) => {
    if (item.tipo === 'esperado' && !item.encontrado && abierta) marcarAMano(item);
    else if (puedeDeshacer(item)) deshacer(item);
    else if (item.numeroInventario) router.push({ pathname: '/bien/[numero]', params: { numero: item.numeroInventario } });
  };

  // Sectores: quién tiene cada ubicación del área. Solo organizan; la fila de un sector ajeno se atenúa pero se puede leer igual.
  const dueno = (ubicacion: string | null) => (ubicacion ? sectores.find((s) => s.ubicacion === ubicacion) : undefined);
  const sectorAjeno = (item: FilaAvance) => {
    const s = item.tipo === 'esperado' ? dueno(item.ubicacionFisica) : undefined;
    return s && !s.propio ? s.usuario : undefined;
  };
  const misSectores = sectores.filter((s) => s.propio).length;

  const tocarSector = async (ubicacion: string) => {
    const s = dueno(ubicacion);
    const accion = async (hacer: () => Promise<void>, aviso: string) => {
      try {
        await hacer();
        setAviso({ tipo: 'ok', texto: aviso });
        await cargar();
      } catch (err) {
        setAviso({ tipo: 'error', texto: mensajeDeError(err, 'No se pudo cambiar el sector.') });
        await cargar();
      }
    };
    if (!s) {
      await accion(async () => {
        await tomarSector(id, ubicacion);
        // Tomar un sector también indica dónde se está, para avisar si algo no está en su lugar.
        setUbicacionActual(ubicacion);
      }, `Tomaste ${ubicacion}`);
    } else if (s.propio) {
      Alert.alert(`Soltar ${ubicacion}`, 'Otra persona podrá tomarlo. Lo ya relevado no cambia.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Soltar', style: 'destructive', onPress: () => void accion(() => soltarSector(id, ubicacion), `Soltaste ${ubicacion}`) },
      ]);
    } else if (puedeCerrar) {
      Alert.alert(ubicacion, `Lo tiene ${s.usuario}.`, [
        { text: 'Dejarlo', style: 'cancel' },
        { text: 'Quitárselo', style: 'destructive', onPress: () => void accion(() => soltarSector(id, ubicacion), `${ubicacion} quedó libre`) },
      ]);
    } else {
      Alert.alert(ubicacion, `Lo tiene ${s.usuario}. Si querés recorrerlo, pedile que lo suelte.`);
    }
  };

  const repetidos = pendientes.filter((f) => (f.vecesSinEncontrar ?? 0) > 0).length;
  const porRevisar = esperadas.filter((f) => f.discrepancia).length;
  const resueltas = esperadas.filter((f) => f.resuelta).length;

  const lista = pestana === 'pendientes' ? pendientes : pestana === 'encontrados' ? encontradas : pestana === 'apartados' ? apartadas : otros;

  const cabecera = (
    <View style={{ gap: 12 }}>
      <View style={e.tarjetaColumna}>
        <Text style={e.rotulo}>
          {jornada?.tipo === 'area' ? 'Área' : 'Ubicación'} · {abierta ? 'Abierta' : 'Cerrada'}
        </Text>
        <Text style={e.titulo}>{jornada?.alcance}</Text>
        <Barra porcentaje={porcentaje} alto={10} />
        <Text style={e.ayuda}>
          {encontradas.length} de {contables} encontrados ({porcentaje} %) · {pendientes.length} pendientes
          {apartadas.length ? ` · ${apartadas.length} apartados` : ''}
          {otros.length ? ` · ${otros.length} fuera de lo esperado` : ''}
        </Text>
        {repetidos > 0 && (
          <Text style={e.ayuda}>
            {repetidos} pendiente{repetidos === 1 ? ' ya faltó' : 's ya faltaron'} en jornadas anteriores; {repetidos === 1 ? 'va' : 'van'} primero en la lista.
          </Text>
        )}
        {jornada && (
          <Text style={e.ayuda}>
            La abrió {jornada.propia ? 'vos' : jornada.creadaPor} · {fechaHora(jornada.creadoEn)}
          </Text>
        )}
      </View>

      <Boton texto={comentarios > 0 ? `Comentarios (${comentarios})` : 'Comentarios'} variante="secundario" onPress={() => router.push({ pathname: '/jornada/comentarios', params: { id } })} />

      <Boton texto="Comparar con otra jornada" variante="secundario" onPress={() => router.push({ pathname: '/jornada/comparar', params: { id } })} />

      {(porRevisar > 0 || resueltas > 0) && (
        <Boton
          texto={porRevisar > 0 ? `Revisar ${porRevisar} discrepancia${porRevisar === 1 ? '' : 's'}` : `Ver ${resueltas} discrepancia${resueltas === 1 ? '' : 's'} resuelta${resueltas === 1 ? '' : 's'}`}
          variante={porRevisar > 0 ? 'primario' : 'secundario'}
          onPress={() => router.push({ pathname: '/jornada/discrepancias', params: { id } })}
        />
      )}

      {abierta && (
        <View style={{ gap: 10 }}>
          {jornada?.tipo === 'area' && ubicaciones.length > 1 && (
            <View style={{ gap: 6 }}>
              <Text style={e.ayuda}>
                Sectores: tomá una ubicación para recorrerla y que nadie más la repita{misSectores ? ` (tenés ${misSectores})` : ''}. Solo organiza: se puede leer en cualquier lugar.
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {ubicaciones.map((u) => {
                  const s = dueno(u);
                  return <Chip key={u} texto={`${u} · ${s ? (s.propio ? 'vos' : s.usuario) : 'libre'}`} activo={!!s?.propio} alTocar={() => void tocarSector(u)} />;
                })}
              </ScrollView>
            </View>
          )}
          {jornada?.tipo === 'area' && ubicaciones.length > 1 && (
            <View style={{ gap: 6 }}>
              <Text style={e.ayuda}>¿En qué ubicación estás ahora? (para avisar si algo no está en su lugar)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Chip texto="Sin indicar" activo={ubicacionActual === null} alTocar={() => setUbicacionActual(null)} />
                {ubicaciones.map((u) => (
                  <Chip key={u} texto={u} activo={ubicacionActual === u} alTocar={() => setUbicacionActual(ubicacionActual === u ? null : u)} />
                ))}
              </ScrollView>
            </View>
          )}
          {!camara ? (
            <Boton texto="Escanear" onPress={() => (permiso?.granted ? setCamara(true) : void pedirPermiso().then((p) => p.granted && setCamara(true)))} />
          ) : (
            <View style={e.camara}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                enableTorch={linterna}
                barcodeScannerSettings={{ barcodeTypes: [...SIMBOLOGIAS_POR_DEFECTO] }}
                onBarcodeScanned={alLeer}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={linterna ? 'Apagar linterna' : 'Encender linterna'}
                accessibilityState={{ selected: linterna }}
                onPress={() => setLinterna((l) => !l)}
                style={[e.linterna, linterna && { backgroundColor: c.accion }]}
                hitSlop={10}
              >
                <Ionicons name={linterna ? 'flash' : 'flash-outline'} size={22} color="#FFFFFF" />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Apagar la cámara" onPress={() => setCamara(false)} style={e.cerrarCamara} hitSlop={10}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
          )}
          <Boton
            texto="Registrar hallazgo"
            variante="secundario"
            onPress={() => router.push({ pathname: '/hallazgo/nuevo', params: { jornadaId: id, ...(ubicacionActual ? { ubicacion: ubicacionActual } : {}) } })}
          />
          {permiso && !permiso.granted && !permiso.canAskAgain && <Text style={e.error}>Sin permiso de cámara. Activalo en los ajustes del teléfono.</Text>}
        </View>
      )}

      {aviso && (
        <Pressable onPress={() => setAviso(null)} style={[e.aviso, aviso.tipo === 'ok' && { borderColor: c.ok }, aviso.tipo === 'error' && { borderColor: c.error }]}>
          <Text style={[e.avisoTexto, aviso.tipo === 'error' && { color: c.error }]}>{aviso.texto}</Text>
        </Pressable>
      )}

      <Opciones
        tamano="chico"
        opciones={[
          { clave: 'pendientes', titulo: `Pendientes ${pendientes.length}` },
          { clave: 'encontrados', titulo: `Encontrados ${encontradas.length}` },
          ...(apartadas.length > 0 || pestana === 'apartados' ? [{ clave: 'apartados' as const, titulo: `Apartados ${apartadas.length}` }] : []),
          { clave: 'otros', titulo: `Otros ${otros.length}` },
        ]}
        actual={pestana}
        alElegir={setPestana}
      />
      {pestana === 'apartados' && <Text style={e.ayuda}>Bienes en reparación, para baja o prestados que todavía no se encontraron: no cuentan como pendientes. Si aparecen, se pueden relevar igual.</Text>}
      {pestana === 'otros' && <Text style={e.ayuda}>Bienes de otra área y códigos que no están en el catálogo, leídos durante esta jornada.</Text>}
      <EstadoCarga error={error} cargando={!filas} alReintentar={cargar} />
    </View>
  );

  return (
    <FlatList
      data={lista}
      keyExtractor={(f, i) => `${f.tipo}-${f.relevamientoId ?? f.bienId ?? i}`}
      style={{ width: '100%' }}
      contentContainerStyle={e.contenido}
      ListHeaderComponent={cabecera}
      ListFooterComponent={
        <View style={{ gap: 10, marginTop: 12 }}>
          {puedeCerrar && <Boton texto="Cerrar jornada" variante="peligro" onPress={confirmarCierre} />}
        </View>
      }
      ListEmptyComponent={<Text style={e.ayuda}>{!filas ? '' : pestana === 'pendientes' ? 'No queda nada pendiente.' : 'Todavía no hay nada acá.'}</Text>}
      refreshControl={controlRecarga}
      renderItem={({ item }) => (
        <FilaDeAvance item={item} yo={yo} marcable={item.tipo === 'esperado' && !item.encontrado && !!abierta} deshacible={puedeDeshacer(item)} sectorDe={sectorAjeno(item)} alTocar={() => alTocarFila(item)} />
      )}
    />
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  contenido: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 10 },
  tarjetaColumna: { backgroundColor: c.superficie, borderRadius: radio, padding: 16, gap: 8, borderWidth: 1, borderColor: c.borde },
  rotulo: { fontSize: 12, fontWeight: '700', color: c.suave, textTransform: 'uppercase' },
  titulo: { fontSize: 18, fontWeight: '800', color: c.titulo },
  camara: { height: 260, borderRadius: radio, overflow: 'hidden', backgroundColor: '#000000' },
  linterna: { position: 'absolute', top: 10, left: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  cerrarCamara: { position: 'absolute', top: 10, right: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  aviso: { borderRadius: radio, borderWidth: 1.5, borderColor: c.accion, backgroundColor: c.superficie, padding: 12 },
  avisoTexto: { fontSize: 15, fontWeight: '600', color: c.texto },
});
