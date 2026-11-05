// Piezas comunes del acceso a datos: tipo de fila genérica, comprobación de respuestas de Supabase y fechas.

export type Fila = Record<string, unknown>;

/** Devuelve `data` de una respuesta de Supabase o lanza un `Error` con el mensaje del servidor. */
export function comprobar<T>(resultado: { data: T; error: { message: string } | null }): T {
  if (resultado.error) throw new Error(resultado.error.message);
  return resultado.data;
}

/** Las columnas `timestamp` sin zona llegan sin la "Z": se las toma como UTC, como las guarda el servidor. */
export const aIso = (valor: unknown): string => {
  const texto = String(valor);
  return new Date(/(Z|[+-]\d{2}(:?\d{2})?)$/i.test(texto) ? texto : `${texto}Z`).toISOString();
};

const FALLO_DE_RED = /network request failed|failed to fetch|fetch failed|network ?error|load failed|timed? ?out|aborted|no hay conexión/i;

/** El fallo es de red (sin señal, servidor inalcanzable o pedido cortado), no una respuesta del servidor: conviene reintentar. */
export function esFalloDeRed(error: unknown): boolean {
  const mensaje = typeof error === 'string' ? error : error instanceof Error ? `${error.name}: ${error.message}` : ((error as { message?: string } | null)?.message ?? '');
  return FALLO_DE_RED.test(mensaje);
}

/** Error con el código de estado que las pantallas usan para distinguir "no existe" (404) de otros fallos. */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}
