# Arquitectura

Monorepo con npm workspaces.

- `shared/`: simbologías, normalización de códigos, tipos de datos (DTO) y constantes compartidas. Se compila a `dist/` para que lo consuman Nest y Expo.
- `backend/`: NestJS 12 + Prisma 7 + PostgreSQL (Supabase). Resuelve escaneos, sirve bienes, recibe relevamientos y hallazgos, exporta CSV, administra cuentas y registra la auditoría. Importa el catálogo desde un archivo de SIU.
- `app/`: Expo SDK 58 + Expo Router (Android). Sesión en `expo-secure-store`, bloqueo con PIN o biometría y lote en curso en el teléfono. SQLite local y cola de sincronización: pendientes (fase 2 del plan).

## Resolución de un escaneo

1. La app lee la lista de simbologías habilitadas (`GET /configuracion/simbologias`, variable `SIMBOLOGIAS_HABILITADAS`) y la pasa a `barcodeScannerSettings.barcodeTypes`.
2. Envía `{ simbologia, valor }` a `POST /bienes/escaneo`.
3. El servidor normaliza el valor, busca en `codigo_bien` por (simbologia, valor) y, si no hay coincidencia, por `numero_inventario` completado a 8 dígitos (las etiquetas físicas traen menos dígitos que SIU).

## Autenticación

`RelevadorGuard` (`backend/src/auth/`) valida el token de Supabase Auth (`SUPABASE_URL`, JWKS). Falla cerrada: sin esa variable el backend no arranca, salvo `AUTH_PROVISORIA=true` (identidad por `x-relevador`, solo desarrollo y pruebas, prohibido en producción). Un guard de roles global aplica denegación por defecto (`@Publico()`, `@PermitirInactivo()`, `@Roles(...)`). Las cuentas nuevas quedan `pendiente` hasta que un administrador las aprueba. El guard es el único punto a reemplazar por el login institucional.

## Auditoría

`evento_auditoria` (eventos de negocio) y `cambio_fila` (cambios de fila, por triggers con el actor tomado de `app.usuario_id`) son append-only: triggers bloquean UPDATE, DELETE y TRUNCATE.

## Comandos

Ver `../00-inicio/puesta-en-marcha.md` para levantar el proyecto. Los comandos habituales son `npm run build`, `npm run lint`, `npm test` y `npm run test:e2e -w backend`.
