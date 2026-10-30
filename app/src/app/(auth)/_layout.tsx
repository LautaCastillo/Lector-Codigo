import { Stack } from 'expo-router';
import { useTema } from '../../compartido/tema';

/** Pila de pantallas sin sesión (solo el inicio de sesión). */
export default function LayoutAuth() {
  const { c } = useTema();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.fondo } }} />;
}
