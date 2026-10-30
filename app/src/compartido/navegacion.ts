// Mapa de la app: las funciones agrupadas por lo que se está haciendo. Lo comparten el inicio y el menú lateral,
// así un cambio de nombre, de grupo o de ícono se hace en un solo lugar.
import type { Ionicons } from '@expo/vector-icons';

export type Ruta =
  | '/'
  | '/escanear'
  | '/lote'
  | '/relevamientos'
  | '/jornadas'
  | '/exportar'
  | '/hallazgo/nuevo'
  | '/buscar'
  | '/explorar'
  | '/historiales'
  | '/cuentas'
  | '/importar-catalogo'
  | '/actividad'
  | '/perfil'
  | '/ajustes';

export interface Funcion {
  titulo: string;
  /** Línea corta que se muestra en la tarjeta del inicio. */
  detalle: string;
  icono: keyof typeof Ionicons.glyphMap;
  ruta: Ruta;
}

export interface Seccion {
  titulo: string;
  /** Solo la ven los administradores. */
  soloAdministrador?: boolean;
  funciones: Funcion[];
}

export const INICIO: Funcion = { titulo: 'Inicio', detalle: '', icono: 'home-outline', ruta: '/' };
export const ESCANEAR: Funcion = { titulo: 'Escanear', detalle: 'Leer el código de un bien', icono: 'scan-outline', ruta: '/escanear' };

export const SECCIONES: Seccion[] = [
  {
    titulo: 'Relevar',
    funciones: [
      ESCANEAR,
      { titulo: 'Jornadas por área', detalle: 'Relevar en equipo, en vivo', icono: 'people-circle-outline', ruta: '/jornadas' },
      { titulo: 'Lote por ubicación', detalle: 'Escanear en ráfaga', icono: 'albums-outline', ruta: '/lote' },
      { titulo: 'Registrar hallazgo', detalle: 'Sin código o fuera del catálogo', icono: 'add-circle-outline', ruta: '/hallazgo/nuevo' },
      { titulo: 'Mis relevamientos', detalle: 'Lo mío y lo del equipo', icono: 'time-outline', ruta: '/relevamientos' },
    ],
  },
  {
    titulo: 'Consultar',
    funciones: [
      { titulo: 'Buscar bienes', detalle: 'Por número o descripción', icono: 'search-outline', ruta: '/buscar' },
      { titulo: 'Explorar bienes', detalle: 'Por área, responsable o ubicación', icono: 'file-tray-stacked-outline', ruta: '/explorar' },
    ],
  },
  {
    titulo: 'Informes',
    funciones: [
      { titulo: 'Exportar', detalle: 'CSV de relevamientos', icono: 'download-outline', ruta: '/exportar' },
      { titulo: 'Historiales', detalle: 'Cargas y exportaciones', icono: 'archive-outline', ruta: '/historiales' },
    ],
  },
  {
    titulo: 'Administración',
    soloAdministrador: true,
    funciones: [
      { titulo: 'Cuentas', detalle: 'Altas, bajas y roles', icono: 'people-outline', ruta: '/cuentas' },
      { titulo: 'Importar catálogo', detalle: 'Cargar un listado de SIU', icono: 'cloud-upload-outline', ruta: '/importar-catalogo' },
      { titulo: 'Actividad', detalle: 'Registro de auditoría', icono: 'list-outline', ruta: '/actividad' },
    ],
  },
];

/** Fijas al pie del menú, junto a cerrar sesión. */
export const CUENTA: Funcion[] = [
  { titulo: 'Mi perfil', detalle: '', icono: 'person-outline', ruta: '/perfil' },
  { titulo: 'Ajustes', detalle: '', icono: 'settings-outline', ruta: '/ajustes' },
];
