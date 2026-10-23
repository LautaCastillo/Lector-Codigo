import { Stack } from 'expo-router';
import { useTema } from '../../lib/tema';

export default function LayoutAuth() {
  const { c } = useTema();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.fondo } }} />;
}
