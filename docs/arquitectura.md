# Arquitectura

Monorepo con npm workspaces.

- `shared/`: simbologías, normalización de códigos y contratos (DTO). Se compila a `dist/` para que lo consuman Nest y, más adelante, Expo.
- `backend/`: NestJS 12 + Prisma 7 + PostgreSQL. Resuelve escaneos, recibe relevamientos y consultará SIU Diaguita (solo lectura).
- `app/`: Expo + Expo Router (pendiente). SQLite local y cola de sincronización.

## Resolución de un escaneo

1. La app lee la lista de simbologías habilitadas (`GET /configuracion/simbologias`, variable `SIMBOLOGIAS_HABILITADAS`) y la pasa a `barcodeScannerSettings.barcodeTypes`.
2. Envía `{ simbologia, valor }` a `POST /bienes/escaneo` (o resuelve localmente contra SQLite sin conexión).
3. El servidor normaliza el valor, busca en `codigo_bien` por (simbologia, valor) y, si no hay coincidencia, por `numero_inventario` (con y sin ceros a la izquierda).

## Autenticación provisoria

`RelevadorGuard` (`backend/src/auth/`) valida el token de Supabase Auth (`SUPABASE_URL`). Falla cerrada: sin esa variable el backend no arranca, salvo `AUTH_PROVISORIA=true` (identidad por `x-relevador`, solo desarrollo y pruebas, prohibido en producción). Es el único punto a reemplazar por el login institucional.

## Comandos

- `docker compose up -d` levanta PostgreSQL.
- `cp .env.example backend/.env`.
- `npm install --legacy-peer-deps` (npm 10 falla al resolver peers de Vitest 4 sin esa opción).
- `npm run prisma:migrate -w backend` crea la primera migración.
- `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e -w backend`.
