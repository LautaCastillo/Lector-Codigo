import { Ionicons } from '@expo/vector-icons';
import type { BienDetalleDto, CambioBienDto, RelevamientoRegistradoDto } from '@patrimonio/shared';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { ChipResultado, Dato, Etiquetas, Seccion } from '../../../compartido/bien';
import { Boton } from '../../../compartido/ui';
import { historialBien, obtenerBien } from '../../../datos/catalogo';
import { relevamientosDeBien } from '../../../datos/relevamientos';
import { ErrorApi } from '../../../datos/util';
import { ETIQUETA_CAMPO, fechaCorta, fechaHora, mensajeDeError, moneda, valorLegible } from '../../../compartido/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../../compartido/tema';

/** Ficha de un bien del catálogo (responsable, ubicación, estado), sus últimos relevamientos y su historial de cambios. */
export default function FichaBien() {
  const { numero } = useLocalSearchParams<{ numero: string }>();
  const router = useRouter();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [bien, setBien] = useState<BienDetalleDto | null>(null);
  const [historial, setHistorial] = useState<CambioBienDto[] | null>(null);
  const [ultimos, setUltimos] = useState<RelevamientoRegistradoDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const ficha = await obtenerBien(numero);
      setBien(ficha);
      // El historial es secundario: si falla, la ficha se muestra igual.
      historialBien(ficha.numeroInventario).then(setHistorial).catch(() => setHistorial(null));
      relevamientosDeBien(ficha.numeroInventario).then(setUltimos).catch(() => setUltimos(null));
    } catch (err) {
      setBien(null);
      setError(err instanceof ErrorApi && err.estado === 404 ? 'Este bien no está en el catálogo.' : mensajeDeError(err, 'No se pudo cargar la ficha.'));
    }
  }, [numero]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const copiar = async () => {
    if (!bien) return;
    await Clipboard.setStringAsync(bien.numeroInventario);
    void Haptics.selectionAsync();
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  };

  if (error) {
    return (
      <View style={e.centro}>
        <Text style={e.error}>{error}</Text>
        <Boton texto="Reintentar" variante="secundario" onPress={cargar} />
      </View>
    );
  }
  if (!bien) {
    return (
      <View style={e.centro}>
        <ActivityIndicator size="large" color={c.accion} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={e.contenido}
      refreshControl={
        <RefreshControl
          refreshing={actualizando}
          onRefresh={async () => {
            setActualizando(true);
            await cargar();
            setActualizando(false);
          }}
          tintColor={c.accion}
        />
      }
    >
      <View style={e.columna}>
        <View style={e.encabezado}>
          <Text style={e.rotulo}>Número patrimonial</Text>
          <View style={e.fila}>
            <Text style={e.numero} selectable accessibilityLabel={`Número patrimonial ${bien.numeroInventario.split('').join(' ')}`}>
              {bien.numeroInventario}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Copiar número patrimonial" onPress={copiar} hitSlop={10} style={e.copiar}>
              <Ionicons name={copiado ? 'checkmark' : 'copy-outline'} size={22} color={copiado ? c.ok : c.accion} />
              <Text style={[e.copiarTexto, copiado && { color: c.ok }]}>{copiado ? 'Copiado' : 'Copiar'}</Text>
            </Pressable>
          </View>
          <Text style={e.descripcion}>{bien.descripcion ?? 'Sin descripción'}</Text>
          {bien.responsableUso && <Text style={e.responsable}>Responsable: {bien.responsableUso}</Text>}
          <Etiquetas bien={bien} />
          <Boton texto="Registrar relevamiento" onPress={() => router.push({ pathname: '/relevamiento/nuevo', params: { numero: bien.numeroInventario } })} />
        </View>

        <Seccion titulo="Ubicación y responsable">
          <Dato etiqueta="Ubicación física" valor={bien.ubicacionFisica} />
          <Dato etiqueta="Área responsable" valor={bien.areaResponsable} />
          <Dato etiqueta="Responsable de uso" valor={bien.responsableUso} />
        </Seccion>

        <Seccion titulo="Datos del catálogo (SIU)" resumen={bien.catalogo ?? undefined}>
          <Dato etiqueta="Catálogo" valor={bien.catalogo} />
          <Dato etiqueta="Motivo de alta" valor={bien.motivoAlta} />
          <Dato etiqueta="Valor" valor={bien.valorUnitario === null ? null : moneda(bien.valorUnitario)} />
          <Dato etiqueta="Fecha de incorporación" valor={bien.fechaIncorporacion ? fechaCorta(bien.fechaIncorporacion) : null} />
          <Dato etiqueta="Número de serie" valor={bien.numeroSerie} />
          <Dato etiqueta="Número anterior" valor={bien.numeroAnterior} />
          <Dato etiqueta="Expediente" valor={bien.expediente} />
          {bien.proveedor && <Dato etiqueta="Proveedor" valor={bien.proveedor} />}
          {bien.numeroFactura && <Dato etiqueta="N.º de factura" valor={`${bien.numeroFactura}${bien.fechaFactura ? ` (${fechaCorta(bien.fechaFactura)})` : ''}`} />}
          <Text style={e.pie}>
            Importado del listado de SIU Diaguita el {fechaCorta(bien.creadoEn)}. Última actualización: {fechaCorta(bien.modificadoEn)}.
          </Text>
        </Seccion>

        <Seccion titulo="Códigos asociados" inicialAbierta={false} resumen={bien.codigos.length ? `${bien.codigos.length} registrado${bien.codigos.length === 1 ? '' : 's'}` : 'Se identifica por su número patrimonial'}>
          {bien.codigos.length === 0 ? (
            <Text style={e.vacio}>No hay códigos de barras registrados: el bien se identifica por su número patrimonial.</Text>
          ) : (
            bien.codigos.map((cod) => <Dato key={`${cod.simbologia}-${cod.valor}`} etiqueta={cod.simbologia.toUpperCase()} valor={cod.valor} />)
          )}
        </Seccion>

        <Seccion
          titulo="Último relevamiento"
          resumen={ultimos?.[0] ? `${fechaHora(ultimos[0].relevadoEnDispositivo)} · ${ultimos[0].relevador ?? ''}` : 'Sin relevamientos'}
        >
          {ultimos === null ? (
            <Text style={e.vacio}>No se pudieron cargar los relevamientos.</Text>
          ) : ultimos.length === 0 ? (
            <Text style={e.vacio}>Todavía no hay relevamientos registrados para este bien.</Text>
          ) : (
            ultimos.map((r) => (
              <Pressable
                key={r.id}
                disabled={!r.propio}
                accessibilityRole={r.propio ? 'button' : undefined}
                onPress={() => router.push({ pathname: '/relevamiento/[id]', params: { id: r.id } })}
                style={({ pressed }) => [e.relevamiento, pressed && { opacity: 0.8 }]}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={e.cambioTitulo}>{fechaHora(r.relevadoEnDispositivo)}</Text>
                  <Text style={e.cambioDetalle}>
                    {r.relevador ?? 'Alguien'}
                    {r.ubicacionObservada ? ` · ${r.ubicacionObservada}` : ''}
                  </Text>
                  {r.estadoDetectado && <Text style={e.cambioDetalle}>Estado declarado: {r.estadoDetectado}</Text>}
                  {r.observaciones && <Text style={e.cambioDetalle}>“{r.observaciones}”</Text>}
                  <ChipResultado resultado={r.resultado} />
                </View>
                {r.propio && <Text style={e.flecha}>›</Text>}
              </Pressable>
            ))
          )}
        </Seccion>

        <Seccion titulo="Historial" resumen={historial ? `${historial.length} cambio${historial.length === 1 ? '' : 's'}` : undefined}>
          {historial === null ? (
            <Text style={e.vacio}>No se pudo cargar el historial.</Text>
          ) : (
            historial.map((cambio, i) => <Cambio key={cambio.id} cambio={cambio} ultimo={i === historial.length - 1} />)
          )}
        </Seccion>
      </View>
    </ScrollView>
  );
}

function Cambio({ cambio, ultimo }: { cambio: CambioBienDto; ultimo: boolean }) {
  const e = useEstilos(fabrica);
  const titulo =
    cambio.operacion === 'INSERT'
      ? 'Alta en el catálogo'
      : cambio.operacion === 'DELETE'
        ? 'Eliminado del catálogo'
        : cambio.cambios.length
          ? 'Datos modificados'
          : 'Actualizado';
  return (
    <View style={e.cambio}>
      <View style={e.linea}>
        <View style={e.punto} />
        {!ultimo && <View style={e.tramo} />}
      </View>
      <View style={{ flex: 1, gap: 4, paddingBottom: ultimo ? 0 : 12 }}>
        <Text style={e.cambioTitulo}>{titulo}</Text>
        <Text style={e.cambioDetalle}>
          {fechaHora(cambio.en)} · {cambio.actor ?? (cambio.operacion === 'INSERT' ? 'Importación de SIU' : 'Fuera de la app')}
        </Text>
        {cambio.cambios.map((x) => (
          <Text key={x.campo} style={e.cambioDetalle}>
            {ETIQUETA_CAMPO[x.campo] ?? x.campo}: {valorLegible(x.campo, x.antes)} → {valorLegible(x.campo, x.despues)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 720, gap: 14 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: c.fondo },
  error: { fontSize: 16, color: c.error, textAlign: 'center' },
  encabezado: { backgroundColor: c.superficie, borderRadius: radio, padding: 16, gap: 10, borderWidth: 1, borderColor: c.borde },
  rotulo: { fontSize: 13, color: c.suave },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  numero: { fontSize: 32, fontWeight: '800', color: c.titulo, letterSpacing: 1 },
  copiar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10 },
  copiarTexto: { fontSize: 14, fontWeight: '600', color: c.accion },
  descripcion: { fontSize: 16, color: c.texto, lineHeight: 22 },
  responsable: { fontSize: 15, fontWeight: '600', color: c.texto },
  pie: { fontSize: 13, color: c.suave },
  vacio: { fontSize: 15, color: c.suave },
  relevamiento: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.borde },
  flecha: { fontSize: 28, color: c.suave },
  cambio: { flexDirection: 'row', gap: 12 },
  linea: { alignItems: 'center', width: 14 },
  punto: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.accion, marginTop: 4 },
  tramo: { flex: 1, width: 2, backgroundColor: c.borde, marginTop: 2 },
  cambioTitulo: { fontSize: 15, fontWeight: '700', color: c.texto },
  cambioDetalle: { fontSize: 13, color: c.suave },
});
