// Un bien de la jornada cuyas lecturas no coinciden: muestra cada lectura y deja elegir cuál vale, con una nota opcional.
import { useCallback, useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { comunes } from '../../compartido/estilos';
import { fechaHora, mensajeDeError } from '../../compartido/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { Boton } from '../../compartido/ui';
import { lecturasDeBienEnJornada, resolverDiscrepancia, type FilaAvance, type LecturaDeBien } from '../../datos/jornadas';

const LARGO_NOTA = 300;

/** `puedeResolver`: quien mira abrió la jornada o es administrador, y la jornada sigue abierta. `alResolver` vuelve a pedir el avance. */
export function TarjetaDiscrepancia({ jornadaId, fila, puedeResolver, alResolver }: { jornadaId: string; fila: FilaAvance; puedeResolver: boolean; alResolver: () => Promise<unknown> }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [lecturas, setLecturas] = useState<LecturaDeBien[] | null>(null);
  const [nota, setNota] = useState(fila.notaResolucion ?? '');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLecturas(await lecturasDeBienEnJornada(jornadaId, fila.bienId!));
      setError(null);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar las lecturas.'));
    }
  }, [jornadaId, fila.bienId]);

  // Se vuelve a pedir cuando cambia el avance: alguien pudo sumar o deshacer una lectura.
  useEffect(() => {
    void cargar();
  }, [cargar, fila.lecturas, fila.resuelta, fila.relevamientoId]);

  const elegir = async (relevamientoId: string) => {
    setEnviando(relevamientoId);
    setError(null);
    try {
      await resolverDiscrepancia(jornadaId, fila.bienId!, relevamientoId, nota);
      await alResolver();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar la elección.'));
    }
    setEnviando(null);
  };

  return (
    <View style={[e.tarjeta, fila.resuelta && { borderColor: c.ok }]}>
      <Text style={e.numero}>{fila.numeroInventario}</Text>
      <Text style={e.descripcion} numberOfLines={2}>
        {fila.descripcion ?? 'Sin descripción'}
      </Text>
      <Text style={e.ayuda}>El catálogo ubica el bien en: {fila.ubicacionFisica ?? 'sin ubicación'}</Text>

      {(lecturas ?? []).map((l, i) => (
        <View key={l.relevamientoId} style={[e.lectura, l.elegida && { borderColor: c.ok, borderWidth: 2 }]}>
          <Text style={e.lecturaTitulo}>
            {l.relevador} · {fechaHora(l.relevadoEn)}
            {l.elegida ? ' · la que vale' : i === 0 && !fila.resuelta ? ' · la que figura' : ''}
          </Text>
          <Text style={e.ayuda}>Lo vio en: {l.ubicacionObservada ?? 'ubicación no indicada'}</Text>
          {l.observaciones && <Text style={e.ayuda}>{l.observaciones}</Text>}
          {puedeResolver && !l.elegida && (
            <Boton texto="Esta es la válida" variante="secundario" cargando={enviando === l.relevamientoId} deshabilitado={enviando !== null} onPress={() => elegir(l.relevamientoId)} />
          )}
        </View>
      ))}
      {!lecturas && !error && <Text style={e.ayuda}>Cargando lecturas…</Text>}

      {puedeResolver ? (
        <TextInput
          value={nota}
          onChangeText={(t) => setNota(t.slice(0, LARGO_NOTA))}
          placeholder="Nota (opcional), por ejemplo: lo trasladaron a otra oficina"
          placeholderTextColor={c.suave}
          style={e.campo}
          accessibilityLabel="Nota de la resolución"
          multiline
        />
      ) : (
        fila.notaResolucion && <Text style={e.ayuda}>Nota: {fila.notaResolucion}</Text>
      )}
      {error && <Text style={e.error}>{error}</Text>}
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 8, borderWidth: 1, borderColor: c.borde },
  numero: { fontSize: 18, fontWeight: '800', color: c.titulo },
  descripcion: { fontSize: 15, color: c.texto },
  lectura: { borderRadius: radio, borderWidth: 1, borderColor: c.borde, padding: 12, gap: 6 },
  lecturaTitulo: { fontSize: 14, fontWeight: '700', color: c.texto },
  campo: { minHeight: 52, borderWidth: 1.5, borderColor: c.borde, borderRadius: radio, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: c.texto, backgroundColor: c.fondo },
});
