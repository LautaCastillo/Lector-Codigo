import type { RelevamientoRegistradoDto } from '@patrimonio/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { ChipResultado, Dato, Etiquetas, Seccion } from '../../../components/bien';
import { Boton } from '../../../components/ui';
import { ErrorApi, obtenerRelevamiento } from '../../../lib/api';
import { EXPLICACION_RESULTADO, fechaHora } from '../../../lib/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../../lib/tema';

export default function DetalleRelevamiento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [r, setR] = useState<RelevamientoRegistradoDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setR(await obtenerRelevamiento(id));
    } catch (err) {
      setR(null);
      setError(
        err instanceof ErrorApi && err.estado === 404
          ? 'No existe este relevamiento.'
          : err instanceof ErrorApi && err.estado === 403
            ? 'Este relevamiento es de otra cuenta.'
            : err instanceof Error
              ? err.message
              : 'No se pudo cargar.',
      );
    }
  }, [id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (error) {
    return (
      <View style={e.centro}>
        <Text style={e.error}>{error}</Text>
        <Boton texto="Reintentar" variante="secundario" onPress={cargar} />
      </View>
    );
  }
  if (!r) {
    return (
      <View style={e.centro}>
        <ActivityIndicator size="large" color={c.accion} />
      </View>
    );
  }

  const ubicacionDistinta = !!r.bien?.ubicacionFisica && !!r.ubicacionObservada && r.bien.ubicacionFisica !== r.ubicacionObservada;

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
          <ChipResultado resultado={r.resultado} />
          <Text style={e.numero}>{r.bien?.numeroInventario ?? r.valorLeido ?? 'Sin código'}</Text>
          {r.bien && <Text style={e.descripcion}>{r.bien.descripcion ?? 'Sin descripción'}</Text>}
          {r.bien && <Etiquetas bien={r.bien} />}
          <Text style={e.suave}>{EXPLICACION_RESULTADO[r.resultado]}</Text>
          {r.bien && <Boton texto="Ver ficha del bien" variante="secundario" onPress={() => router.push({ pathname: '/bien/[numero]', params: { numero: r.bien!.numeroInventario } })} />}
        </View>

        {ubicacionDistinta && (
          <View style={e.alerta} accessible accessibilityRole="alert">
            <Text style={e.alertaTitulo}>Ubicación distinta del catálogo</Text>
            <Text style={e.texto}>
              El catálogo ubica este bien en “{r.bien!.ubicacionFisica}”. Se encontró en “{r.ubicacionObservada}”.
            </Text>
          </View>
        )}

        <Seccion titulo="Qué se leyó">
          <Dato etiqueta="Código leído" valor={r.valorLeido} />
          <Dato etiqueta="Tipo de código" valor={r.simbologia?.toUpperCase()} />
        </Seccion>

        <Seccion titulo="Dónde y cuándo">
          <Dato etiqueta="Ubicación relevada" valor={r.ubicacionObservada} />
          {r.bien && <Dato etiqueta="Ubicación según el catálogo" valor={r.bien.ubicacionFisica} />}
          <Dato etiqueta="Relevó" valor={r.relevador} />
          <Dato etiqueta="Hora del teléfono" valor={fechaHora(r.relevadoEnDispositivo)} />
          <Dato etiqueta="Registrado en el servidor" valor={fechaHora(r.sincronizadoEn)} />
        </Seccion>

        {(r.observaciones || r.estadoDetectado || r.loteId) && (
          <Seccion titulo="Otros datos">
            <Dato etiqueta="Estado detectado" valor={r.estadoDetectado} />
            <Dato etiqueta="Observaciones" valor={r.observaciones} />
            <Dato etiqueta="Lote" valor={r.loteId ? r.loteId.slice(0, 8) : null} />
          </Seccion>
        )}
      </View>
    </ScrollView>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 720, gap: 14 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: c.fondo },
  error: { fontSize: 16, color: c.error, textAlign: 'center' },
  encabezado: { backgroundColor: c.superficie, borderRadius: radio, padding: 16, gap: 10, borderWidth: 1, borderColor: c.borde },
  numero: { fontSize: 30, fontWeight: '800', color: c.titulo, letterSpacing: 1 },
  descripcion: { fontSize: 16, color: c.texto, lineHeight: 22 },
  suave: { fontSize: 14, color: c.suave },
  texto: { fontSize: 15, color: c.texto },
  alerta: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 4, borderWidth: 2, borderColor: c.accion },
  alertaTitulo: { fontSize: 15, fontWeight: '800', color: c.titulo },
});
