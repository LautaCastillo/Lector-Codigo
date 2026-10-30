import type { BienSiu } from '@patrimonio/shared';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Boton } from '../../compartido/ui';
import { useRouter } from 'expo-router';
import { elegirArchivo, historialImportaciones, procesar, registrarCarga, type ArchivoLeido, type Importacion, type Totales } from '../../datos/importar-catalogo';
import { fechaHora, mensajeDeError } from '../../compartido/formato';
import { radio, useEstilos, type Paleta } from '../../compartido/tema';
import { comunes } from '../../compartido/estilos';

type Paso =
  | { tipo: 'inicio' }
  | { tipo: 'leyendo' }
  | { tipo: 'previa'; archivo: ArchivoLeido; totales: Totales; yaImportado: Importacion | null }
  | { tipo: 'importando'; archivo: ArchivoLeido; hechos: number }
  | { tipo: 'listo'; archivo: ArchivoLeido; totales: Totales };

const NOMBRE_COLUMNA: Record<keyof BienSiu, string> = {
  numeroInventario: 'número patrimonial',
  descripcion: 'descripción',
  catalogo: 'catálogo',
  ubicacionFisica: 'ubicación',
  areaResponsable: 'área',
  motivoAlta: 'motivo de alta',
  estadoBien: 'estado',
  valorUnitario: 'valor',
  fechaIncorporacion: 'fecha de incorporación',
  numeroSerie: 'número de serie',
  numeroAnterior: 'número anterior',
  expediente: 'expediente',
  responsableUso: 'responsable de uso',
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Solo administradores. Elegir el archivo del listado de SIU, ver qué cambiaría y confirmar. */
export default function ImportarCatalogo() {
  const router = useRouter();
  const e = useEstilos(fabrica);
  const [paso, setPaso] = useState<Paso>({ tipo: 'inicio' });
  const [error, setError] = useState<string | null>(null);

  const elegir = async () => {
    setError(null);
    setPaso({ tipo: 'leyendo' });
    try {
      const archivo = await elegirArchivo();
      if (!archivo) return setPaso({ tipo: 'inicio' });
      const totales = await procesar(archivo.bienes, archivo.columnas, 'previsualizar');
      // ¿Este mismo archivo (por su huella) ya se cargó antes? Si el historial no se puede leer, no frena la importación.
      const yaImportado = await historialImportaciones(500).then((h) => h.find((i) => i.hashSha256 === archivo.hash) ?? null).catch(() => null);
      setPaso({ tipo: 'previa', archivo, totales, yaImportado });
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo leer el archivo.'));
      setPaso({ tipo: 'inicio' });
    }
  };

  const importar = async (archivo: ArchivoLeido) => {
    setError(null);
    setPaso({ tipo: 'importando', archivo, hechos: 0 });
    try {
      const totales = await procesar(archivo.bienes, archivo.columnas, 'aplicar', (hechos) => setPaso({ tipo: 'importando', archivo, hechos }));
      await registrarCarga(archivo, totales);
      setPaso({ tipo: 'listo', archivo, totales });
    } catch (err) {
      setError(
        `${mensajeDeError(err, 'No se pudo importar.')} Lo que ya se cargó queda guardado: podés repetir la importación, no duplica nada.`,
      );
      setPaso({ tipo: 'inicio' });
    }
  };

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.columna}>
        <Text style={e.suave}>
          Cargá el listado "Bienes de uso" que se descarga de SIU Diaguita (Excel o CSV). Los bienes nuevos se agregan y los que ya existen se
          actualizan por su número patrimonial. Nunca se borra un bien.
        </Text>

        {(paso.tipo === 'inicio' || paso.tipo === 'leyendo') && (
          <>
            <Boton texto="Elegir archivo" onPress={elegir} cargando={paso.tipo === 'leyendo'} />
            <Boton texto="Ver historial de cargas" variante="secundario" onPress={() => router.push('/historiales')} />
          </>
        )}
        {error && <Text style={e.error}>{error}</Text>}

        {paso.tipo === 'previa' && (
          <View style={e.tarjeta}>
            <Text style={e.titulo}>{paso.archivo.nombre}</Text>
            <Text style={e.suave}>
              {plural(paso.archivo.bienes.length, 'bien leído', 'bienes leídos')}
              {paso.archivo.omitidas ? ` · ${plural(paso.archivo.omitidas, 'fila omitida', 'filas omitidas')} (sin número patrimonial)` : ''}
              {paso.archivo.repetidos ? ` · ${plural(paso.archivo.repetidos, 'repetido', 'repetidos')} (se toma el último)` : ''}
            </Text>
            {paso.archivo.reporte.filtros && <Text style={e.suave}>{paso.archivo.reporte.filtros.replace(/^Filtros aplicados:\s*/i, 'Filtros: ')}</Text>}
            {paso.archivo.reporte.totalDeclarado !== null &&
              paso.archivo.reporte.totalDeclarado !== paso.archivo.bienes.length + paso.archivo.repetidos && (
                <Text style={e.error}>
                  El reporte declara {paso.archivo.reporte.totalDeclarado} registros y se leyeron {paso.archivo.bienes.length + paso.archivo.repetidos}: revisá el archivo.
                </Text>
              )}
            {paso.yaImportado && (
              <Text style={e.aviso}>
                Este mismo archivo ya se importó el {fechaHora(paso.yaImportado.creadoEn)} ({paso.yaImportado.usuario}). Si lo importás de nuevo no cambia nada.
              </Text>
            )}
            <Text style={e.suave}>Columnas que trae: {paso.archivo.columnas.map((c) => NOMBRE_COLUMNA[c]).join(', ')}. Las demás no se modifican.</Text>
            <Resumen totales={paso.totales} />
            <Boton texto="Importar" onPress={() => importar(paso.archivo)} />
            <Boton texto="Elegir otro archivo" variante="secundario" onPress={() => setPaso({ tipo: 'inicio' })} />
          </View>
        )}

        {paso.tipo === 'importando' && (
          <View style={e.tarjeta}>
            <Text style={e.titulo}>Importando…</Text>
            <Text style={e.suave}>
              {paso.hechos} de {paso.archivo.bienes.length} bienes. No cierres la app.
            </Text>
          </View>
        )}

        {paso.tipo === 'listo' && (
          <View style={e.tarjeta}>
            <Text style={e.titulo}>Catálogo actualizado</Text>
            <Text style={e.suave}>
              {paso.archivo.nombre} · {plural(paso.archivo.bienes.length, 'bien', 'bienes')}. Queda la constancia con la huella del archivo en el
              registro de actividad.
            </Text>
            <Resumen totales={paso.totales} />
            <Boton texto="Importar otro archivo" variante="secundario" onPress={() => setPaso({ tipo: 'inicio' })} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Resumen({ totales }: { totales: Totales }) {
  const e = useEstilos(fabrica);
  return (
    <View style={e.fila}>
      <Dato valor={totales.nuevos} titulo="nuevos" />
      <Dato valor={totales.modificados} titulo="modificados" />
      <Dato valor={totales.sinCambios} titulo="sin cambios" />
    </View>
  );
}

function Dato({ valor, titulo }: { valor: number; titulo: string }) {
  const e = useEstilos(fabrica);
  return (
    <View style={e.dato}>
      <Text style={e.numero}>{valor}</Text>
      <Text style={e.suave}>{titulo}</Text>
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 560, gap: 16 },
  suave: { fontSize: 14, color: c.suave },
  aviso: { fontSize: 14, color: c.accion, fontWeight: '600' },
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, padding: 18, gap: 14, borderWidth: 1, borderColor: c.borde },
  titulo: { fontSize: 17, fontWeight: '700', color: c.titulo },
  fila: { flexDirection: 'row', gap: 10 },
  dato: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 10, borderRadius: 10, backgroundColor: c.fondo, borderWidth: 1, borderColor: c.borde },
  numero: { fontSize: 24, fontWeight: '800', color: c.titulo },
});
