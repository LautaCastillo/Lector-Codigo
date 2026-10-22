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

## 3. Puesta en marcha en la otra computadora

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
- La API provisoria acepta cualquier valor en `x-relevador`. No exponerla a internet sin definir `API_KEY` o el login institucional.

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
