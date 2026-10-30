import type { RelevamientoRegistradoDto } from '@patrimonio/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ChipResultado, Seccion } from '../../compartido/bien';
import { Boton, EstadoCarga, Opciones } from '../../compartido/ui';
import { misRelevamientos, relevamientosDelEquipo } from '../../datos/relevamientos';
import { fechaHora } from '../../compartido/formato';
import { radio, useEstilos, type Paleta } from '../../compartido/tema';
import { comunes } from '../../compartido/estilos';
import { useCarga } from '../../compartido/useCarga';

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

type Alcance = 'mios' | 'equipo';

export default function MisRelevamientos() {
  const router = useRouter();
  const e = useEstilos(fabrica);
  const [alcance, setAlcance] = useState<Alcance>('mios');

  const { datos: lista, error, cargar, controlRecarga } = useCarga(
    () => (alcance === 'mios' ? misRelevamientos() : relevamientosDelEquipo()),
    [alcance],
    'No se pudieron cargar los relevamientos.',
  );

  const grupos = useMemo(() => agrupar(lista ?? []), [lista]);
  const abrir = (id: string) => router.push({ pathname: '/relevamiento/[id]', params: { id } });

  return (
    <ScrollView
      contentContainerStyle={e.contenido}
      refreshControl={controlRecarga}
    >
      <View style={e.columna}>
        <Opciones<Alcance>
          opciones={[
            { clave: 'mios', titulo: 'Míos' },
            { clave: 'equipo', titulo: 'Del equipo' },
          ]}
          actual={alcance}
          alElegir={setAlcance}
        />
        <EstadoCarga error={error} cargando={!lista} alReintentar={cargar} grande />
        {lista && lista.length === 0 && (
          <View style={e.vacio}>
            <Text style={e.vacioTitulo}>{alcance === 'mios' ? 'Todavía no registraste relevamientos' : 'Todavía no hay relevamientos'}</Text>
            <Text style={e.suave}>{alcance === 'equipo' ? 'Nadie registró relevamientos todavía. ' : ''}Escaneá un lote por ubicación y enviá el resultado desde el resumen: queda registrado acá.</Text>
            <Boton texto="Hacer un lote" onPress={() => router.push('/lote')} />
          </View>
        )}
        {lista && lista.length > 0 && <Text style={e.suave}>{lista.length} relevamiento{lista.length === 1 ? '' : 's'} registrado{lista.length === 1 ? '' : 's'} {alcance === 'mios' ? 'con tu cuenta' : 'por el equipo'}.</Text>}

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
                    {alcance === 'equipo' && <Text style={e.suave}>{r.propio ? 'Vos' : r.relevador}</Text>}
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
  ...comunes(c),
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 720, gap: 12 },
  suave: { fontSize: 14, color: c.suave },
  vacio: { gap: 12, padding: 20, backgroundColor: c.superficie, borderRadius: radio, borderWidth: 1, borderColor: c.borde },
  vacioTitulo: { fontSize: 17, fontWeight: '800', color: c.titulo },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.borde },
  numero: { fontSize: 17, fontWeight: '800', color: c.titulo },
  flecha: { fontSize: 28, color: c.suave },
});
