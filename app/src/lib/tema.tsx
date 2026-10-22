import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

/** Paletas tomadas del logo y del sitio de la UNSa (unsa.edu.ar). */
export const claro = {
  fondo: '#F3F7FC',
  superficie: '#FFFFFF',
  texto: '#12263A',
  suave: '#5B6B7C',
  borde: '#D3DEEC',
  primario: '#0C3B65',
  sobrePrimario: '#FFFFFF',
  titulo: '#0C3B65',
  accion: '#1B89DF',
  celeste: '#E0E9F6',
  ok: '#1E7B45',
  error: '#B3261E',
};

export type Paleta = typeof claro;

export const oscuro: Paleta = {
  fondo: '#0B1622',
  superficie: '#13243A',
  texto: '#E6EEF7',
  suave: '#9FB3C8',
  borde: '#27405C',
  primario: '#1B6FB8',
  sobrePrimario: '#FFFFFF',
  titulo: '#A9D0F5',
  accion: '#5DB0F2',
  celeste: '#1B3350',
  ok: '#55C17E',
  error: '#F2766D',
};

export const radio = 12;

export type Preferencia = 'sistema' | 'claro' | 'oscuro';
const CLAVE = 'preferencia-tema';

interface ContextoTema {
  c: Paleta;
  esOscuro: boolean;
  preferencia: Preferencia;
  setPreferencia: (p: Preferencia) => void;
}

const Contexto = createContext<ContextoTema | null>(null);

export function TemaProvider({ children }: { children: ReactNode }) {
  const sistema = useColorScheme();
  const [preferencia, setPref] = useState<Preferencia>('sistema');

  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((guardada) => {
        if (guardada === 'claro' || guardada === 'oscuro' || guardada === 'sistema') setPref(guardada);
      })
      .catch(() => undefined);
  }, []);

  const valor = useMemo<ContextoTema>(() => {
    const esOscuro = preferencia === 'oscuro' || (preferencia === 'sistema' && sistema === 'dark');
    return {
      c: esOscuro ? oscuro : claro,
      esOscuro,
      preferencia,
      setPreferencia: (p) => {
        setPref(p);
        AsyncStorage.setItem(CLAVE, p).catch(() => undefined);
      },
    };
  }, [preferencia, sistema]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTema() {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useTema debe usarse dentro de TemaProvider');
  return contexto;
}

/** Estilos de un componente. Se tipan como View y Text a la vez para poder usarlos en ambos. */
type Estilo = ViewStyle & TextStyle & ImageStyle;

/** Crea los estilos a partir de la paleta activa. `fabrica` debe ser una función de módulo (estable). */
export function useEstilos<T extends Record<string, object>>(fabrica: (c: Paleta) => T) {
  const { c } = useTema();
  return useMemo(() => StyleSheet.create(fabrica(c) as Record<keyof T, Estilo>), [c, fabrica]);
}
