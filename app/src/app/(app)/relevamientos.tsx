import type { RelevamientoRegistradoDto } from '@patrimonio/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { ChipResultado, Seccion } from '../../components/bien';
import { Boton } from '../../components/ui';
import { misRelevamientos } from '../../lib/api';
import { fechaHora } from '../../lib/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../lib/tema';

interface Grupo {
  clave: string;
  titulo: string;
  cuando: string;
  items: RelevamientoRegistradoDto[];
}

/** Agrupa por lote; los relevamientos sin lote van agrupados por día. */
function agrupar(lista: RelevamientoRegistradoDto[]): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const r of lista) {
    const clave = r.loteId ?? `suelto-${r.relevadoEnDispositivo.slice(0, 10)}`;
    const existente = grupos.get(clave);
    if (existente) existente.items.push(r);
    else
      grupos.set(clave, {
        clave,
        titulo: r.loteId ? `Lote en ${r.ubicacionObservada ?? 'ubicación sin nombre'}` : 'Relevamientos sueltos',
        cuando: r.relevadoEnDispositivo,
        items: [r],
      });
  }
  return [...grupos.values()].sort((a, b) => b.cuando.localeCompare(a.cuando));
}

export default function MisRelevamientos() {
  const router = useRouter();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [lista, setLista] = useState<RelevamientoRegistradoDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setLista(await misRelevamientos());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los relevamientos.');
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const grupos = useMemo(() => agrupar(lista ?? []), [lista]);
  const abrir = (id: string) => router.push({ pathname: '/relevamiento/[id]', params: { id } });

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
        {error && (
          <View style={{ gap: 12 }}>
            <Text style={e.error}>{error}</Text>
            <Boton texto="Reintentar" variante="secundario" onPress={cargar} />
          </View>
        )}
        {!error && !lista && <ActivityIndicator size="large" color={c.accion} />}
        {lista && lista.length === 0 && (
          <View style={e.vacio}>
            <Text style={e.vacioTitulo}>Todavía no registraste relevamientos</Text>
            <Text style={e.suave}>Escaneá un lote por ubicación y enviá el resultado desde el resumen: queda registrado acá.</Text>
            <Boton texto="Hacer un lote" onPress={() => router.push('/lote')} />
          </View>
        )}
        {lista && lista.length > 0 && <Text style={e.suave}>{lista.length} relevamiento{lista.length === 1 ? '' : 's'} registrado{lista.length === 1 ? '' : 's'} con tu cuenta.</Text>}

        {grupos.map((g, i) => {
          const encontrados = g.items.filter((x) => x.resultado === 'encontrado').length;
          const fuera = g.items.filter((x) => x.resultado === 'no_encontrado').length;
          const sin = g.items.filter((x) => x.resultado === 'sin_verificar').length;
          const hallazgos = g.items.filter((x) => x.resultado === 'hallazgo').length;
          return (
            <Seccion
              key={g.clave}
              titulo={g.titulo}
              inicialAbierta={i === 0}
              resumen={`${fechaHora(g.cuando)} · ${g.items.length} escaneado${g.items.length === 1 ? '' : 's'}`}
            >
              <Text style={e.suave}>
                {fechaHora(g.cuando)} · {encontrados} encontrado{encontrados === 1 ? '' : 's'}
                {fuera ? ` · ${fuera} fuera del catálogo` : ''}
                {sin ? ` · ${sin} sin verificar` : ''}
                {hallazgos ? ` · ${hallazgos} hallazgo${hallazgos === 1 ? '' : 's'}` : ''}
              </Text>
              {g.items.map((r) => (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Relevamiento de ${r.bien?.numeroInventario ?? r.valorLeido ?? 'código'}. ${r.resultado}`}
                  onPress={() => abrir(r.id)}
                  style={({ pressed }) => [e.fila, pressed && { opacity: 0.8 }]}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={e.numero}>{r.resultado === 'hallazgo' ? (r.codigoProvisorio ?? 'Hallazgo') : (r.bien?.numeroInventario ?? r.valorLeido ?? 'Sin código')}</Text>
                    {(r.bien || r.descripcion) && (
                      <Text style={e.suave} numberOfLines={1}>
                        {r.resultado === 'hallazgo' ? r.descripcion : (r.bien?.descripcion ?? 'Sin descripción')}
                      </Text>
                    )}
                    <ChipResultado resultado={r.resultado} />
                  </View>
                  <Text style={e.flecha}>›</Text>
                </Pressable>
              ))}
            </Seccion>
          );
        })}
      </View>
    </ScrollView>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 720, gap: 12 },
  suave: { fontSize: 14, color: c.suave },
  error: { fontSize: 15, color: c.error },
  vacio: { gap: 12, padding: 20, backgroundColor: c.superficie, borderRadius: radio, borderWidth: 1, borderColor: c.borde },
  vacioTitulo: { fontSize: 17, fontWeight: '800', color: c.titulo },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.borde },
  numero: { fontSize: 17, fontWeight: '800', color: c.titulo },
  flecha: { fontSize: 28, color: c.suave },
});
