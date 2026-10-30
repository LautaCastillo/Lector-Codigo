# Arquitectura

Monorepo con npm workspaces (`shared` y `app`) más la carpeta `supabase/`. No hay backend propio: la app habla directo con Supabase (plan v3, ADR 0001).

- `shared/`: simbologías, normalización de códigos, lectura de archivos del catálogo (CSV y XLSX), validación de relevamientos, tipos de datos (DTO) y constantes. Se compila a `dist/` para que lo consuma Expo.
- `app/`: Expo SDK 58 + Expo Router (Android). Sesión en `expo-secure-store`, bloqueo opcional con PIN o biometría. Su código está en `app/src/` (ver más abajo).
- `supabase/`: migraciones SQL (tablas, RLS, funciones), Edge Function `admin-cuentas` y pruebas SQL por rol. `base-prisma/` conserva el esquema original creado con Prisma.

## Estructura de `app/src/`

| Carpeta | Contenido |
|---|---|
| `app/` | Las pantallas (Expo Router: una ruta por archivo). Arman la pantalla y delegan; `(app)` es la zona con sesión y `(auth)` el inicio de sesión. |
| `datos/` | Todo el acceso a Supabase, un archivo por tema: `supabase.ts` (cliente), `util.ts`, `cuentas.ts`, `catalogo.ts`, `relevamientos.ts`, `hallazgos.ts` (fotos y vínculo), `exportaciones.ts`, `auditoria.ts`, `jornadas.ts` e `importar-catalogo.ts`. |
| `sesion/` | Sesión de Supabase y perfil (`sesion.tsx`), bloqueo con PIN (`bloqueo.tsx`, `pin.tsx`), `almacen-seguro.ts` y `credenciales.tsx`. |
| `compartido/` | Lo que usan todas las funciones: `ui.tsx` (botón, chips y pestañas, barra de avance, estado de carga), `menu.tsx`, `tema.tsx`, `estilos.ts`, `formato.ts`, `navegacion.ts` (mapa de funciones del inicio y del menú), `useCarga.tsx`, `useLector.ts` y `permiso-camara.tsx`. |
| `funciones/` | La lógica y las piezas propias de cada función grande: `lote/` (pasos elegir, escanear y resumen), `jornada/` (datos en vivo y fila de avance), `historiales/` y `hallazgo/`. |

Las pantallas importan de `datos/`, `compartido/`, `sesion/` y `funciones/`; `datos/` no importa de las demás.

## Datos y seguridad

- La app usa la clave publicable de Supabase y la sesión de Supabase Auth. La seguridad la imponen las políticas RLS y las funciones `SECURITY DEFINER` con privilegios mínimos (ADR 0005); no hay otra barrera.
- Las cuentas las crea un administrador mediante la Edge Function `admin-cuentas` (la clave secreta vive solo allí). Roles: `administrador` y `relevador`. Estados: `activa`, `suspendida`, `baja`.
- `evento_auditoria` (eventos de negocio) y `cambio_fila` (cambios de fila, por triggers con `auth.uid()`) son append-only (ADR 0006).

## Catálogo

Un único catálogo compartido en la tabla `bien`. Entra por archivo CSV o XLSX descargado de SIU Diaguita, que un administrador carga desde la app (RPC `importar_catalogo`, con vista previa y actualización solo de las columnas presentes). Cada carga queda en el historial. Detalle en `../siu/README.md` y ADR 0003.

## Resolución de un escaneo

1. La cámara lee el código con las simbologías habilitadas (por defecto, las de `shared`).
2. La app busca por (`simbologia`, `valor`) en `codigo_bien` y, si no hay coincidencia, por `numeroInventario` normalizado (las etiquetas traen menos dígitos que SIU).

## Relevamientos

- Individuales, por lote de ubicación y hallazgos (con foto opcional en Storage, bucket privado `hallazgos`). Se suben de forma idempotente por `idCliente`.
- **Jornadas** por área o ubicación: relevamiento compartido en tiempo real (Supabase Realtime). Lo esperado se calcula del catálogo; si dos personas leen el mismo bien figura la primera según la hora del servidor (ADR 0004).
- Exportación a CSV con constancia (filtros, filas y huella SHA-256). Los historiales de cargas y de exportaciones los ven todas las cuentas activas.

## Comandos

Ver `../00-inicio/puesta-en-marcha.md`. Los habituales son `npm run build`, `npm run lint`, `npm test` y `npm run start -w app -- --clear`.
