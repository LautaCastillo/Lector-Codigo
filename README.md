# App de inventario por código de barras para Patrimonio

## Descripción

Aplicación para Android que permite a la Dirección de Patrimonio de la Universidad Nacional de Salta (UNSa) leer los códigos de barras de los bienes institucionales, consultar su información, registrar relevamientos en campo, cargar bienes nuevos y exportar los datos.

La app funciona sin conexión durante un máximo de 2 días: los datos se guardan en el dispositivo y se sincronizan con el servidor cuando hay red.

## Objetivos

- Identificar un bien en el momento, escaneando su código de barras. Se leen distintas simbologías (Code 39, Code 128, EAN, QR, entre otras), con la lista habilitada configurable.
- Consultar su información: descripción, ubicación, responsable, estado, titularidad y valor.
- Registrar relevamientos de presencia y estado, incluso sin conexión.
- Registrar bienes sin código, con código dañado o no identificados, para que no queden fuera del inventario.
- Conservar la trazabilidad: quién hizo cada cambio, cuándo, y qué cambió.
- Exportar la información en PDF o CSV, con constancia de cada exportación.

## Alcance

Incluido en la primera versión (solo Android):

- Lectura de códigos de barras de múltiples simbologías con la cámara.
- Búsqueda y visualización de bienes.
- Alta y edición de bienes, con historial de cambios.
- Registro de bienes sin código, con código dañado o desconocido.
- Relevamientos en campo, con funcionamiento sin conexión (hasta 2 días) y sincronización posterior.
- Exportación a PDF o CSV con registro de quién y cuándo exportó.

Fuera de alcance por ahora:

- Login institucional de la UNSa (por ahora hay cuentas propias de la app con Supabase Auth; el diseño deja el reemplazo en un único punto).
- Versión para iOS (se evaluará después, con el mismo código base).
- Roles con permisos diferenciados (se diseñará el modelo, pero se implementará más adelante).
- Impresión de etiquetas.
- Gestión de compras, altas contables o bajas patrimoniales.

## Integración con SIU Diaguita

Solo lectura. La app nunca escribe en SIU. El backend consulta SIU Diaguita mediante scraping de su interfaz web y expone los datos a la app. Detalles y fragilidad en `CLAUDE.md` y `docs/siu/`.

## Usuarios

Unas 30 personas del área de Patrimonio. Cada una inicia sesión con una cuenta propia de la app (independiente de la cuenta de SIU Diaguita), lo que permite dejar constancia de quién hizo cada acción. Las cuentas nuevas quedan pendientes hasta que un administrador las habilita. El login institucional de la UNSa se define más adelante y reemplazará un único punto del backend (`backend/src/auth/relevador.guard.ts`).

## Datos de un bien

Según el formulario de alta de SIU Diaguita: fecha de incorporación, descripción, cantidad, estado, valor unitario, proveedor, imagen, fecha y número de factura, responsable de uso, ubicación física, área responsable, titularidad (propio o de terceros) y número de serie. Además, número de inventario y uno o más códigos de barras (con su simbología). Cada unidad tiene su propio número de inventario.

## Stack

| Capa | Tecnología |
|---|---|
| Móvil | React Native + Expo (TypeScript) + Expo Router, Android |
| Lectura de códigos | expo-camera (13 simbologías soportadas, configurable) |
| Datos sin conexión | SQLite (expo-sqlite) |
| Backend | NestJS 12 (TypeScript, Vitest, oxlint) |
| ORM | Prisma 7 |
| Base de datos | PostgreSQL en Supabase (plan gratuito). Docker local queda como alternativa |
| Autenticación | Supabase Auth (correo y contraseña), provisoria; el método institucional se define con el Centro de Cómputos |
| Repositorio | GitHub + GitHub Actions |

## Estructura del repositorio

```
.
├── CLAUDE.md          Instrucciones y decisiones para el asistente de IA
├── README.md          Este documento
├── app/               Aplicación móvil (Expo)
├── backend/           API (NestJS + Prisma)
├── shared/            Tipos, enums y normalización de códigos compartidos
└── docs/              Documentación, diagramas y decisiones
```

## Estado

Etapa de implementación. Última actualización: 22/10/2026.

### Qué funciona

- **Backend (NestJS + Prisma + Supabase):** `GET /health`, `GET /configuracion/simbologias`, `POST /bienes/escaneo`, `GET /bienes/:numeroInventario`, `GET /me` y `PATCH /me`. Autenticación con el token de Supabase; las cuentas nuevas nacen inactivas.
- **App (Expo SDK 57):** inicio de sesión, registro, cuenta pendiente de aprobación, inicio con funciones, escáner con cámara, mi perfil (editar nombre y cambiar contraseña), ajustes (modo claro, oscuro o automático) y menú lateral. Se adapta a distintos anchos de pantalla.
- **Catálogo:** 55 bienes de prueba importados desde un listado de SIU. El escaneo resuelve el número de inventario aunque el código traiga otro relleno de ceros.
- **Pruebas:** unitarias y e2e del backend y de `shared`, correctas. La app pasa el chequeo de tipos y el empaquetado Android; se probó en un celular con Expo Go.

### No implementado todavía

- Descarga automática del catálogo al dispositivo y uso sin conexión (SQLite) con sincronización.
- Integración con SIU Diaguita desde el backend (`backend/src/siu/` vacío).
- Pantallas de relevamientos, búsqueda, alta y edición de bienes, pendientes y exportación (el inicio las muestra como "Próximamente").
- Administración de usuarios (hoy se aprueba una cuenta cambiando `activo` en la tabla `usuario`).
- Login con nombre de usuario o correo resuelto en el servidor y recuperación de contraseña.
- Tablas propias para áreas, ubicaciones, catálogo, empleados y responsables de uso.

## Cambios recientes

| Fecha | Cambio |
|---|---|
| 22/10/2026 | La base de desarrollo pasa de Docker a Supabase. Migraciones: `init`, `habilita_rls` (RLS sin políticas, bloquea la API pública de Supabase) y `campos_siu` (catálogo, motivo de alta, número anterior y expediente). |
| 22/10/2026 | Se crea la app Expo con la pantalla de escaneo; se fija en SDK 57 por compatibilidad con Expo Go. |
| 22/10/2026 | Autenticación con Supabase Auth. El backend valida el token (`SUPABASE_URL`); sin esa variable rige la cabecera provisoria `x-relevador`, solo para desarrollo y pruebas. |
| 22/10/2026 | Interfaz con la paleta de la UNSa: login, registro, inicio con tarjetas, menú lateral, perfil editable, ajustes, modo oscuro, botón para ver la contraseña y diseño adaptable. |
| 22/10/2026 | Importador del listado "Bienes de uso" de SIU (`npm run importar -w backend -- archivo.xls`) y búsqueda por inventario completada a 8 dígitos. |

## Puesta en marcha en otra computadora

Requisitos: Node.js 24 o superior y Git. No hace falta Docker, porque la base está en Supabase.

1. Clonar e instalar:
   ```bash
   git clone https://github.com/LautaCastillo/Lector-Codigo.git
   cd Lector-Codigo
   npm install
   ```
2. Crear `backend/.env` a partir de `.env.example`: completar `DATABASE_URL` (cadena **Session pooler** de Supabase, con la contraseña real y sin corchetes) y `SUPABASE_URL`.
3. Crear `app/.env` a partir de `app/.env.example`: `EXPO_PUBLIC_API_URL` con la IP de la computadora en la red local (el celular no puede usar `localhost`), y `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_KEY` con la clave **publicable** del proyecto (nunca la secreta).
4. Compilar y preparar la base:
   ```bash
   npm run build -w shared
   npm run prisma:generate -w backend
   cd backend && npx prisma migrate deploy && cd ..
   ```
5. Iniciar el backend y la app, en dos terminales:
   ```bash
   npm run start:dev -w backend
   npm run start -w @patrimonio/app
   ```
   Escanear el código QR con Expo Go (versión compatible con SDK 57). El celular debe estar en la misma red que la computadora.
6. Cargar el catálogo de prueba (opcional): exportar "Bienes de uso" desde SIU Diaguita y correr `npm run importar -w backend -- ruta/al/archivo.xls`.

Advertencias:

- Los archivos `.env` no se versionan y deben crearse en cada computadora. Nunca subir credenciales.
- Para entrar a la app hace falta una cuenta activa. La cuenta de prueba de administrador se pasa por fuera del repositorio y hay que cambiar su contraseña antes de cargar datos reales.
- Con "Confirm email" activado en Supabase Auth, quien se registra debe confirmar el correo antes de entrar.

## Próximos pasos

1. Descarga automática del catálogo al celular (SQLite) y escaneo sin conexión.
2. Normalizar áreas, ubicaciones y catálogo en tablas propias; dejar preparados empleados y responsables de uso.
3. Pantallas de búsqueda, relevamientos históricos, alta de bienes y exportación.
4. Módulo de SIU Diaguita en el backend (requiere definir ambiente y cuenta de servicio, y rotar la cuenta `consulta.patrimonio`).
5. Confirmar con Patrimonio las simbologías reales de las etiquetas y que el código equivale al número de inventario.

El detalle de la puesta en marcha, las decisiones y los pendientes está en `docs/estado-y-retomar.md` y `CLAUDE.md`.

## Mantenimiento

El proyecto será mantenido por otra persona después de la entrega. Por eso, cada decisión técnica relevante debe quedar documentada en `docs/`.
