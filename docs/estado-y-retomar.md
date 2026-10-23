# Estado del proyecto y guía para retomar en otra computadora

Fecha de redacción: 22/10/2026.

## 1. Estado actual

### Implementado y verificado

- Monorepo con npm workspaces: `shared` y `backend`.
- `shared`: simbologías y normalización de códigos (7 pruebas unitarias).
- Backend NestJS 12 con Prisma 7 y PostgreSQL 16. Endpoints disponibles:
  - `GET /health`
  - `GET /configuracion/simbologias`
  - `POST /bienes/escaneo`
  - `GET /bienes/:numeroInventario`
- Esquema de datos con las tablas `usuario`, `bien`, `codigo_bien`, `relevamiento`, `historial_cambio` y `exportacion`. La migración `init` está versionada en `backend/prisma/migrations/`.
- Autenticación provisoria mediante un guard global (cabecera `x-relevador` y `API_KEY` opcional).
- Compilación (`npm run build`), lint, pruebas unitarias (3) y pruebas e2e (2) correctas con Node 24.
- Repositorio en GitHub: `https://github.com/LautaCastillo/Lector-Codigo.git`, rama `main`.

### No implementado

- Aplicación móvil (`app/`, Expo): no existe.
- Sincronización y relevamientos desde el dispositivo (`backend/src/sync/` vacío).
- Integración con SIU Diaguita (`backend/src/siu/` vacío).
- Alta y edición de bienes con historial, exportación a PDF o CSV, roles y login institucional.
- Carga inicial de bienes desde los listados de Patrimonio.

### No verificado

- El flujo de escaneo con datos reales: la base local está vacía (0 bienes, 0 códigos, 0 relevamientos).
- El workflow de CI (`.github/workflows/ci.yml`) está escrito, pero no se confirmó su ejecución en GitHub.

## 2. Cambios hechos en esta etapa

- `docker-compose.yml`: el puerto del host es configurable con `DB_PORT` (por defecto 5432).
- `backend/src/main.ts`: carga `backend/.env` al arrancar con `process.loadEnvFile()`. Antes la aplicación no leía `DATABASE_URL` y devolvía error 500 al consultar la base.

## 2b. Base de datos en Supabase (22/10/2026)

- La base de desarrollo pasó de Docker a Supabase (proyecto `Lector-CodigoBarra`, us-west-2), porque la PC de Patrimonio tiene la virtualización desactivada en el BIOS.
- `DATABASE_URL` en `backend/.env` usa la cadena Session pooler. Migraciones: `cd backend && npx prisma migrate deploy`.
- Migración `habilita_rls`: activa RLS sin políticas en todas las tablas (bloquea la API pública de Supabase; el backend usa `postgres` y no se ve afectado).
- Verificado con un bien de prueba (ya borrado): escaneo por código, por inventario y código inexistente.
- Hallazgo: un escaneo EAN13 `0000000333013` no encuentra el inventario `00333013`, porque `candidatosInventario` solo prueba el valor completo y sin ceros. Depende de la decisión pendiente sobre relleno de ceros.

## 3. Puesta en marcha en la otra computadora (con Docker; en Supabase basta el paso 2 con la cadena de conexión)

### Requisitos

- Node.js 24 (mínimo 24.15; las dependencias de Nest no son compatibles con 22.12).
- Docker Desktop con el motor en ejecución.
- Git.

Si se usa otra versión de Node en otros proyectos, instalar `nvm-windows` y alternar con `nvm use`.

### Pasos

1. Clonar e instalar:
   ```bash
   git clone https://github.com/LautaCastillo/Lector-Codigo.git
   cd Lector-Codigo
   npm install
   ```
2. Crear el archivo de entorno del backend a partir del ejemplo:
   ```bash
   cp .env.example backend/.env
   ```
3. Levantar la base de datos:
   ```bash
   docker compose up -d
   ```
   Si el puerto 5432 está ocupado por otro PostgreSQL, crear un archivo `.env` en la raíz con `DB_PORT=5433` y cambiar `localhost:5432` por `localhost:5433` en `DATABASE_URL` de `backend/.env`.
4. Compilar `shared`, generar el cliente de Prisma y aplicar las migraciones:
   ```bash
   npm run build -w shared
   npm run prisma:generate -w backend
   npm run prisma:migrate -w backend
   ```
   Con la base nueva aplica la migración `init` ya versionada. No se verificó `prisma migrate deploy` desde la raíz.
5. Iniciar el backend:
   ```bash
   npm run start:dev -w backend
   ```
   El arranque puede demorar unos segundos. Verificar en `http://localhost:3000/health`.
6. Ejecutar las pruebas:
   ```bash
   npm test
   npm run test:e2e -w backend
   ```

### Advertencias

- Los archivos `.env` no se versionan y deben recrearse en cada computadora.
- La base de datos local no se sincroniza entre computadoras: cada una tiene su propio volumen de Docker.
- Las credenciales de SIU (`SIU_USUARIO`, `SIU_CLAVE`) deben cargarse solo en el `.env` local del backend. No subirlas al repositorio ni compartirlas en chats.
- El backend no arranca sin `SUPABASE_URL`. `AUTH_PROVISORIA=true` habilita la identidad por cabecera `x-relevador` (acepta cualquier valor): usarlo solo en desarrollo o pruebas; con `NODE_ENV=production` se rechaza.

## 4. Pendientes

### Seguridad

- Rotar la cuenta `consulta.patrimonio` de SIU Diaguita, cuyas credenciales se expusieron en un chat.

### Decisiones que bloquean el desarrollo

- Simbologías que usa realmente Patrimonio además de Code 39, y si el contenido del código coincide con el número de inventario (relleno de ceros en EAN/ITF).
- Método de autenticación de la UNSa (LDAP/Active Directory, SSO, CAS, OAuth u otro).
- Código o captura HAR de las consultas a SIU Diaguita, para cubrir más filtros.
- Significado del campo "Cantidad de bienes" en SIU.
- Listas cerradas de estados del bien y ubicaciones físicas.
- Imágenes: cantidad por bien, tamaño máximo y almacenamiento.
- Formato y volumen de la carga inicial de bienes.
- Quién cubre el costo único de publicación en Google Play.

## 5. Próximos pasos sugeridos

1. Cargar bienes de prueba y verificar el flujo `POST /bienes/escaneo` y `GET /bienes/:numeroInventario`, incluyendo un código inexistente.
2. Confirmar que el CI de GitHub Actions se ejecuta correctamente.
3. Crear la aplicación Expo (`app/`) con la pantalla de escaneo.
4. Implementar la sincronización y el modelo de relevamientos offline.
5. Implementar el módulo de SIU Diaguita con pruebas sobre fixtures HTML.

## 6. Convenciones

- Commits en español, en imperativo y breves (por ejemplo: `Agrega pantalla de escaneo`).
- Nunca subir credenciales; usar variables de entorno y `.env.example` sin valores reales.
- Detalle completo de decisiones: `CLAUDE.md`, `README.md` y `docs/arquitectura.md`.

## 7. App móvil (Expo SDK 57, `app/`)

- Fijada en SDK 57 porque es el que soporta el Expo Go instalado en el celular. Creada la app con Expo Router (`app/src/app/`) y la pantalla de escaneo (`index.tsx`): lee códigos con `expo-camera`, usa las simbologías de `GET /configuracion/simbologias` (con respaldo local) y consulta `POST /bienes/escaneo`.
- Verificado: chequeo de tipos y empaquetado Android (`npx expo export`). No probada en un dispositivo.
- Para probar: copiar `app/.env.example` a `app/.env` con la IP de la PC, iniciar el backend (escuchando en la red) y correr `npm run start -w app`; abrir con Expo Go.

## 8. Sesión y cuentas (22/10/2026)

- Autenticación con Supabase Auth (correo y contraseña). La app inicia sesión con `@supabase/supabase-js`; el backend valida el token con las claves públicas del proyecto (`SUPABASE_URL` en `backend/.env`). Sin `SUPABASE_URL` el backend no arranca, salvo `AUTH_PROVISORIA=true` (cabecera `x-relevador`, solo desarrollo y pruebas).
- Las cuentas nuevas nacen inactivas (`usuario.activo = false`) y un administrador debe habilitarlas. `GET /me` informa el estado a la app.
- Para aprobar una cuenta: poner `activo = true` (y `rol` si corresponde) en la tabla `usuario`. Todavía no hay pantalla de administración.
- Cuenta de prueba: usuario `adminlauta` (administrador). Es provisoria: cambiar la contraseña o eliminarla antes de cargar datos reales.
- Provisorio: la app acepta un nombre de usuario sin arroba y le agrega `@patrimonio.local`. Pendiente: login real con correo o nombre de usuario resuelto en el backend, y recuperación de contraseña por correo.
- La sesión se guarda en AsyncStorage (sin cifrar). Evaluar `expo-secure-store` antes de producción.
- Pantallas: login, registro, cuenta pendiente, inicio (con funciones próximas deshabilitadas), escanear y mi cuenta.

## 9. Interfaz (22/10/2026)

- Modo claro, oscuro o automático (Ajustes), con la preferencia guardada en el dispositivo.
- Menú lateral con inicio, escanear, mi perfil, ajustes y cerrar sesión: deslizable en el celular y fijo a la izquierda desde 900 px de ancho. Las tarjetas del inicio y las pantallas se adaptan al ancho disponible.
- Los campos de contraseña tienen botón para mostrarla u ocultarla.
- Mi perfil: edita el nombre (`PATCH /me`) y cambia la contraseña (Supabase Auth). Cuenta y rol solo los cambia un administrador.
- Probado: tipos, pruebas del backend y empaquetado Android. Sin probar en dispositivo.

## 10. Catálogo de bienes (22/10/2026)

- Importador del listado "Bienes de uso" de SIU Diaguita (Exportar Excel; viene con extensión `.xls` pero es `.xlsx`): `cd backend && npm run importar -- ruta/al/listado.xls`. Es idempotente: crea los nuevos y actualiza los existentes por número de inventario.
- El número patrimonial de SIU viene como `NUI:00006349`; se guarda `00006349` (8 dígitos). El escaneo prueba el valor leído, sin ceros y completado a 8 dígitos, por lo que resuelve EAN13 con otro relleno.
- Se cargaron 55 bienes de prueba. Campos nuevos en `bien`: catálogo, motivo de alta, número anterior y expediente.
- El listado exportado no incluye "responsable de uso" (SIU lo ofrece como columna opcional).
- Pendiente: descarga automática del catálogo al dispositivo (SQLite) para el uso sin conexión; importación desde la app por un administrador; normalizar áreas, ubicaciones y catálogo en tablas propias.

## 11. Estados de cuenta, aprobación y roles (23/10/2026)

Puntos 3 y 4 de la sección 3.5 de `plan-de-mejoras-y-decisiones.md`.

- **Estados:** `pendiente` (al registrarse), `activa`, `rechazada`, `suspendida` y `baja` (definitiva). Reemplazan al booleano `activo`. Campos nuevos en `usuario`: `estado`, `aprobadoPor`, `aprobadoEn`, `motivoEstado`, `ultimoAccesoEn`. Migración `estados_de_cuenta`: las cuentas activas siguen activas y las inactivas quedan suspendidas.
- **Transiciones** (`backend/src/usuarios/usuarios.service.ts`): aprobar (desde pendiente o rechazada), rechazar (pendiente), suspender (activa), reactivar (suspendida) y baja. Rechazar, suspender y dar de baja exigen un motivo de 3 a 200 caracteres.
- **Endpoints de administración** (solo rol administrador): `GET /admin/usuarios?estado=`, `POST /admin/usuarios/:id/{aprobar|rechazar|suspender|reactivar|baja}` y `PATCH /admin/usuarios/:id/rol` (con motivo). Un administrador no puede cambiar su propia cuenta ni su rol, lo que impide quedarse sin administradores activos.
- **Autorización por rol con denegación por defecto** (`RolesGuard`): cada endpoint debe declarar `@Publico()`, `@PermitirInactivo()` (solo `GET /me`) o `@Roles(...)`. Un endpoint nuevo sin decorador responde 403. Una cuenta que no está activa recibe 403 salvo en `GET /me`.
- **App:** pantalla "Cuentas" (solo administradores, desde el menú) para aprobar, rechazar, suspender y reactivar; la pantalla de cuenta no activa muestra el mensaje de cada estado.
- **Primer administrador:** nadie puede aprobarlo. Se designa en la base: `UPDATE usuario SET estado = 'activa', rol = 'administrador' WHERE cuenta = '<correo>';`. Registrar el procedimiento en el runbook.
- **Pendiente:** la tabla `evento_auditoria` (sección 4 del plan). Hoy el motivo del último cambio queda en `motivoEstado` y no hay historial de cambios anteriores. Tampoco se revocan sesiones al suspender: el efecto llega cuando vence el token (hasta 1 hora con la configuración actual de Supabase).
- **Dato suelto:** existe una cuenta `relevador-app` creada por la autenticación provisoria anterior; conviene darla de baja.

## 12. SecureStore y bloqueo de la app (23/10/2026)

Punto 5 de la sección 3.5 del plan de mejoras.

- **Sesión en almacén seguro:** la sesión de Supabase (access y refresh token) ya no se guarda en AsyncStorage sino en `expo-secure-store` (`app/src/lib/almacen-seguro.ts`), partida en trozos de 1000 caracteres por el límite de tamaño de cada valor. Las sesiones guardadas por la versión anterior se migran solas en el primer arranque. Accesible tras el primer desbloqueo del equipo y sin migrar a otro dispositivo.
- **Bloqueo con PIN** (`app/src/lib/bloqueo.tsx`): al primer ingreso de cada sesión se crea un PIN de 6 dígitos (se rechazan repetidos y secuencias) y, si el teléfono lo permite, se puede activar huella o rostro. La app se bloquea en cada arranque y tras 5 minutos en segundo plano. El PIN se guarda con sal y SHA-256 en el almacén seguro. Con 5 intentos fallidos se cierra la sesión. Al cerrar sesión se borra el bloqueo. La biometría se usa sin `requireAuthentication` sobre el token, para no impedir el trabajo sin conexión, como indica el plan.
- **Respaldo de Android:** el plugin de `expo-secure-store` quedó con `configureAndroidBackup: true` en `app.json`. Falta excluir la base SQLite cuando exista.
- **Limitaciones:** el PIN de 6 dígitos protege contra el uso casual del teléfono, no contra alguien que extraiga el hash del almacén. No se verificó en un teléfono ni en una development build; la huella y el rostro y el efecto de `configureAndroidBackup` quedan sin probar. En Expo Go el rostro (Face ID) no está disponible en iOS.
- **Pendiente:** cambiar o desactivar el PIN desde Ajustes, y recuperar el acceso sin cerrar sesión si se olvida.
