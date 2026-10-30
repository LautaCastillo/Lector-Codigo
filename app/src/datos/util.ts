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

/** Error con el código de estado que las pantallas usan para distinguir "no existe" (404) de otros fallos. */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}
