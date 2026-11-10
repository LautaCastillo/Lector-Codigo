/** Fechas de las tareas: sin pasar por la zona horaria, como texto `aaaa-mm-dd` (así las guarda y las compara la base). */

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** La fecha de un `Date` (en la hora local del teléfono) como `aaaa-mm-dd`. */
export const aFechaIso = (d: Date): string => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;

/** La fecha de hoy más `dias` días, como `aaaa-mm-dd`. */
export function fechaEnDias(dias: number, hoy = new Date()): string {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias);
  return aFechaIso(d);
}

/**
 * Lo que escribe la persona (`dd/mm/aaaa`, con `/`, `-` o `.`; el año puede ir con dos cifras) a `aaaa-mm-dd`.
 * Devuelve `null` si no es una fecha real (por ejemplo, 31/02/2026).
 */
export function parsearFecha(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(anio, mes - 1, dia);
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
}

/** Una fecha `aaaa-mm-dd` ya pasó respecto de `hoy` (la de hoy todavía no). */
export const estaVencida = (fecha: string, hoy = aFechaIso(new Date())): boolean => fecha < hoy;
