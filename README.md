# App de inventario por código de barras para Patrimonio

## Descripción

Aplicación para Android que permite a la Dirección de Patrimonio de la Universidad Nacional de Salta (UNSa) leer los códigos de barras de los bienes institucionales, consultar su información, registrar relevamientos y hallazgos en campo y exportar los datos. El catálogo de bienes viene de SIU Diaguita y la app nunca lo modifica.

Desde el plan v3 (26/10/2026) los relevamientos son compartidos y en tiempo real: varios teléfonos relevan a la vez y ven lo que registra el otro, por lo que la app requiere conexión. Los datos viven en Supabase y no habrá backend propio.

## Objetivos

- Identificar un bien en el momento, escaneando su código de barras. Se leen distintas simbologías (Code 39, Code 128, EAN, QR, entre otras), con la lista habilitada configurable.
- Consultar su información: descripción, ubicación, responsable, estado, titularidad y valor.
- Registrar relevamientos de presencia y estado, incluso sin conexión.
- Registrar hallazgos (bienes sin código, con código dañado, no identificados o nuevos) para que no queden fuera del inventario, sin modificar SIU.
- Conservar la trazabilidad: quién hizo cada acción y cuándo, en un registro de auditoría que no se puede modificar.
- Exportar la información en CSV (PDF pendiente), con constancia de cada exportación.

## Alcance

Incluido en la primera versión (solo Android):

- Lectura de códigos de barras de múltiples simbologías con la cámara.
- Búsqueda y visualización de bienes, con su historial.
- Relevamientos en campo, individuales y por lote de ubicación (plan v3: también por área, compartidos en tiempo real).
- Hallazgos con código provisorio y foto opcional, que un administrador puede vincular después al catálogo.
- Exportación a CSV (PDF pendiente) con registro de quién y cuándo exportó.
- Cuentas creadas por un administrador, roles (administrador y relevador) y registro de auditoría.

Fuera de alcance por ahora:

- Login institucional de la UNSa (por ahora hay cuentas propias de la app con Supabase Auth; el diseño deja el reemplazo en un único punto).
- Versión para iOS (se evaluará después, con el mismo código base).
- Alta y edición de bienes del catálogo: la app no modifica el catálogo; un alta es un hallazgo que Patrimonio incorpora a SIU por su cuenta.
- Impresión de etiquetas.
- Gestión de compras, altas contables o bajas patrimoniales.

## Integración con SIU Diaguita

Solo lectura. La app nunca escribe en SIU. Hoy el catálogo se carga importando el listado "Bienes de uso" exportado de SIU. Desde el plan v3 no habrá conexión con SIU (ni API ni scraping): el catálogo se carga siempre desde un archivo CSV o XLSX. Detalles en `docs/siu/` y en el plan vigente.

## Usuarios

Unas 30 personas del área de Patrimonio. Cada una inicia sesión con una cuenta propia de la app (independiente de la cuenta de SIU Diaguita), lo que permite dejar constancia de quién hizo cada acción. Las cuentas nuevas quedan pendientes hasta que un administrador las habilita. El login institucional de la UNSa se define más adelante y reemplazará un único punto del backend (`backend/src/auth/relevador.guard.ts`).

## Datos de un bien

Según el formulario de SIU Diaguita: fecha de incorporación, descripción, cantidad, estado, valor unitario, proveedor, imagen, fecha y número de factura, responsable de uso, ubicación física, área responsable, titularidad (propio o de terceros) y número de serie. Además, número de inventario y uno o más códigos de barras (con su simbología). Cada unidad tiene su propio número de inventario.

## Stack

| Capa | Tecnología |
|---|---|
| Móvil | React Native + Expo (TypeScript) + Expo Router, Android |
| Lectura de códigos | expo-camera (13 simbologías soportadas, configurable) |
| Datos en tiempo real | Supabase Realtime (plan v3); SQLite ya no es parte del plan |
| Backend | NestJS 12 (TypeScript, Vitest, oxlint) |
| ORM | Prisma 7 |
| Base de datos | PostgreSQL en Supabase (plan gratuito). Ya no se usa Docker |
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
├── supabase/          Migraciones SQL, políticas RLS y sus pruebas (plan v3)
└── docs/              Documentación, diagramas y decisiones
```

## Estado

Etapa de implementación. Última actualización: 26/10/2026. El detalle por fases del plan vigente está en `docs/estado-y-retomar.md`.

### Qué funciona

- **Backend (NestJS + Prisma + Supabase), sin uso desde la fase 3 del plan v3 y pendiente de retirar:** escaneo, ficha, búsqueda e historial de bienes, ubicaciones, relevamientos idempotentes, hallazgos con foto, exportación CSV auditada, cuentas con aprobación y roles, y registro de auditoría append-only (`/admin/auditoria`, `/me/actividad`).
- **App (Expo SDK 58):** inicio de sesión (las cuentas las crea un administrador), cambio obligatorio de la contraseña temporal, escáner, ficha del bien, búsqueda, lotes por ubicación, registro de relevamientos individuales, hallazgos, "Mis relevamientos", exportación, cuentas y actividad (administradores), perfil, ajustes (modo claro y oscuro), PIN de bloqueo opcional (con huella o rostro) y menú lateral.
- **Catálogo:** 55 bienes de prueba importados desde un listado de SIU. El escaneo resuelve el número de inventario aunque el código traiga otro relleno de ceros.
- **Seguridad en la base (fase 1 del plan v3):** políticas RLS por rol, privilegios mínimos y auditoría con la identidad de Supabase, con 55 pruebas por rol en `supabase/tests/`. El backend actual no se ve afectado.
- **Pruebas:** unitarias y e2e del backend y de `shared`, correctas. La app se probó en un celular con Expo Go.

### No implementado todavía

- Plan v3: migración a Supabase directo (sin backend propio), cuentas creadas por administrador, catálogo cargado desde la app y relevamientos compartidos en tiempo real.
- Conexión con SIU Diaguita: descartada; el catálogo entra siempre por archivo CSV o XLSX.
- Exportación a PDF y vista de administrador por ubicación o relevador.
- Revocación de sesiones al suspender una cuenta.
- Login con nombre de usuario o correo resuelto en el servidor y recuperación de contraseña.
- Tablas propias para áreas, ubicaciones, catálogo, empleados y responsables de uso.

## Cambios recientes

| Fecha | Cambio |
|---|---|
| 22/10/2026 | La base de desarrollo pasa de Docker a Supabase. Migraciones: `init`, `habilita_rls` (RLS sin políticas, bloquea la API pública de Supabase) y `campos_siu` (catálogo, motivo de alta, número anterior y expediente). |
| 22/10/2026 | Se crea la app Expo con la pantalla de escaneo; se fija en SDK 57 por compatibilidad con Expo Go. |
| 26/10/2026 | Fase 2 del plan v3: las cuentas las crea un administrador desde la app (función `admin-cuentas` de Supabase), sin registro público; el primer ingreso exige elegir contraseña; el PIN es opcional; la sesión no caduca. |
| 26/10/2026 | Fase 1 del plan v3: seguridad en la base (RLS, privilegios mínimos, auditoría con la identidad de Supabase). |
| 22/10/2026 | Autenticación con Supabase Auth. El backend valida el token (`SUPABASE_URL`); sin esa variable el backend no arranca (salvo `AUTH_PROVISORIA=true`, solo para desarrollo y pruebas). |
| 22/10/2026 | Interfaz con la paleta de la UNSa: login, registro, inicio con tarjetas, menú lateral, perfil editable, ajustes, modo oscuro, botón para ver la contraseña y diseño adaptable. |
| 23/10/2026 | La sesión pasa a `expo-secure-store` y la app se bloquea con PIN (y huella o rostro opcionales) al abrirla y tras 5 minutos en segundo plano (punto 5 del plan de mejoras). |
| 23/10/2026 | Hallazgos: registro de bienes sin código o fuera del catálogo, con código provisorio, foto opcional y vínculo posterior con el catálogo. |
| 23/10/2026 | Registro de relevamiento individual con estado físico y observaciones, últimos relevamientos en la ficha y exportación a CSV auditada (filas y huella SHA-256). |
| 23/10/2026 | Relevamientos registrados en el servidor: envío idempotente del lote, "Mis relevamientos" y detalle de cada relevamiento. |
| 23/10/2026 | Escaneo por lotes por ubicación: escaneo en ráfaga con detección de repetidos, faltantes y bienes de otra ubicación, lote guardado en el teléfono y resumen para compartir. |
| 23/10/2026 | Ficha del bien con historial, búsqueda manual y escáner con resumen, vibración, linterna y descarte de lecturas repetidas. |
| 23/10/2026 | Auditoría append-only: `evento_auditoria` y `cambio_fila` con triggers, bloqueo de modificaciones, eventos de cuentas y sesiones, endpoints `GET /admin/auditoria` y `GET /me/actividad`, y pantalla "Actividad" para administradores. |
| 23/10/2026 | Estados de cuenta (pendiente, activa, rechazada, suspendida, baja), endpoints de aprobación para administradores, autorización por rol con denegación por defecto y pantalla "Cuentas" en la app (puntos 3 y 4 del plan de mejoras). |
| 23/10/2026 | Seguridad: la autenticación falla cerrada y se elimina la API key del cliente y del backend (puntos 1 y 2 de la sección 3.5 del plan de mejoras). |
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
   Escanear el código QR con Expo Go (versión compatible con SDK 58). El celular debe estar en la misma red que la computadora.
6. Cargar el catálogo de prueba (opcional): exportar "Bienes de uso" desde SIU Diaguita y correr `npm run importar -w backend -- ruta/al/archivo.xls`.

Advertencias:

- Los archivos `.env` no se versionan y deben crearse en cada computadora. Nunca subir credenciales.
- Para entrar a la app hace falta una cuenta activa. La cuenta de prueba de administrador se pasa por fuera del repositorio y hay que cambiar su contraseña antes de cargar datos reales.
- Con "Confirm email" activado en Supabase Auth, quien se registra debe confirmar el correo antes de entrar.

## Próximos pasos (plan v3)

1. Probar en el teléfono la creación de cuentas, desactivar el registro público y agregar la pantalla de bienvenida cuando haya logo (cierre de la fase 2).
2. Pasar el resto de la app a Supabase y retirar el backend (fase 3).
3. Catálogo por archivo CSV o XLSX y relevamientos compartidos en tiempo real (fases 4 y 5).
4. Pedir el aval de Patrimonio; rotar la cuenta `consulta.patrimonio`; confirmar las simbologías reales de las etiquetas.

La hoja de ruta vigente es `docs/plan-v3-supabase-directo.md` (los planes anteriores son históricos). El estado por fases y las decisiones pendientes están en `docs/estado-y-retomar.md`; la guía para levantar el proyecto, en `docs/00-inicio/puesta-en-marcha.md`; el índice de toda la documentación, en `docs/README.md`.

## Mantenimiento

El proyecto será mantenido por otra persona después de la entrega. Por eso, cada decisión técnica relevante debe quedar documentada en `docs/`.
