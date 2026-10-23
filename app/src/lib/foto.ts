import { MAX_BYTES_FOTO } from '@patrimonio/shared';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** Anchos y calidades que se prueban, de mayor a menor, hasta que la foto entre en el máximo del servidor. */
const INTENTOS: { ancho: number; calidad: number }[] = [
  { ancho: 1280, calidad: 0.6 },
  { ancho: 1280, calidad: 0.4 },
  { ancho: 960, calidad: 0.4 },
  { ancho: 720, calidad: 0.35 },
];

export interface FotoLista {
  uri: string;
  bytes: number;
}

/** Reduce una foto a un JPEG que entre en el máximo permitido. Devuelve null si no se logra. */
export async function reducirFoto(uri: string): Promise<FotoLista | null> {
  for (const { ancho, calidad } of INTENTOS) {
    const reducida = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: ancho } }], {
      compress: calidad,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const bytes = new File(reducida.uri).size;
    // Margen del 10 % por si el servidor cuenta distinto.
    if (bytes > 0 && bytes <= MAX_BYTES_FOTO * 0.9) return { uri: reducida.uri, bytes };
  }
  return null;
}

export type ResultadoFoto = { tipo: 'foto'; foto: FotoLista } | { tipo: 'cancelada' } | { tipo: 'sin_permiso' } | { tipo: 'muy_grande' };

/** Abre la cámara, pide el permiso si hace falta y devuelve la foto ya reducida. */
export async function sacarFoto(): Promise<ResultadoFoto> {
  const permiso = await ImagePicker.requestCameraPermissionsAsync();
  if (!permiso.granted) return { tipo: 'sin_permiso' };
  const resultado = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (resultado.canceled || !resultado.assets[0]) return { tipo: 'cancelada' };
  const foto = await reducirFoto(resultado.assets[0].uri);
  return foto ? { tipo: 'foto', foto } : { tipo: 'muy_grande' };
}
