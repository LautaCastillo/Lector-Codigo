// Mantiene viva la cola de envíos mientras haya sesión: la manda al abrir la app, al volver a ella y cada pocos segundos
// mientras haya algo sin enviar o falte la red. No dibuja nada.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { enviarPendientes, fijarCuenta, useCola } from '../../datos/cola-envio';
import { comprobarRed, estaSinRed } from '../../datos/red';
import { useSesion } from '../../sesion/sesion';

const INTERVALO_MS = 15000;

/** Con la red caída se pregunta primero si volvió, para no esperar el corte de cada pedido. */
async function reintentar() {
  if (estaSinRed() && !(await comprobarRed())) return;
  await enviarPendientes();
}

export function ColaDeEnvio() {
  const { sesion } = useSesion();
  const cuenta = sesion?.user.id ?? null;
  const { pendientes, sinRed } = useCola();
  const hayTrabajo = pendientes.length > 0 || sinRed;

  useEffect(() => {
    void fijarCuenta(cuenta).then(() => {
      if (cuenta) void enviarPendientes();
    });
  }, [cuenta]);

  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (e) => {
      if (e === 'active') void reintentar();
    });
    return () => suscripcion.remove();
  }, []);

  useEffect(() => {
    if (!hayTrabajo) return;
    const t = setInterval(() => void reintentar(), INTERVALO_MS);
    return () => clearInterval(t);
  }, [hayTrabajo]);

  return null;
}
