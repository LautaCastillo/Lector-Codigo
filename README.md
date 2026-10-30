# App de inventario por código de barras para Patrimonio

## Descripción

Aplicación para Android que permite a la Dirección de Patrimonio de la Universidad Nacional de Salta (UNSa) leer los códigos de barras de los bienes institucionales, consultar su información, registrar relevamientos y hallazgos en campo y exportar los datos. El catálogo de bienes viene de SIU Diaguita y la app nunca lo modifica.

Desde el plan v3 (26/10/2026) los relevamientos son compartidos y en tiempo real: varios teléfonos relevan a la vez y ven lo que registra el otro, por lo que la app requiere conexión. Los datos viven en Supabase y la app habla directo con él: no hay backend propio (retirado el 30/10/2026).

## Objetivos

- Identificar un bien en el momento, escaneando su código de barras. Se leen distintas simbologías (Code 39, Code 128, EAN, QR, entre otras), con la lista habilitada configurable.
- Consultar su información: descripción, ubicación, responsable, estado, titularidad y valor.
- Registrar relevamientos de presencia y estado, solos o en jornadas compartidas por área o ubicación, en tiempo real (requiere conexión).
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

Solo lectura. La app nunca escribe en SIU. No hay conexión con SIU (ni API ni scraping): un administrador carga desde la app el listado exportado de SIU en CSV o XLSX. Detalles en `docs/siu/` y en el plan vigente.

## Usuarios

Unas 30 personas del área de Patrimonio. Cada una inicia sesión con una cuenta propia de la app (independiente de la cuenta de SIU Diaguita), lo que permite dejar constancia de quién hizo cada acción. Las cuentas las crea un administrador desde la app. El login institucional de la UNSa se define más adelante.

## Datos de un bien

Según el formulario de SIU Diaguita: fecha de incorporación, descripción, cantidad, estado, valor unitario, proveedor, imagen, fecha y número de factura, responsable de uso, ubicación física, área responsable, titularidad (propio o de terceros) y número de serie. Además, número de inventario y uno o más códigos de barras (con su simbología). Cada unidad tiene su propio número de inventario.

## Stack

| Capa | Tecnología |
|---|---|
| Móvil | React Native + Expo (TypeScript) + Expo Router, Android |
| Lectura de códigos | expo-camera (13 simbologías soportadas, configurable) |
| Datos en tiempo real | Supabase Realtime |
| Base de datos y lógica | PostgreSQL en Supabase (plan gratuito): RLS, funciones SQL y Edge Functions, sin backend propio |
| Almacenamiento | Supabase Storage (fotos de hallazgos) |
| Autenticación | Supabase Auth (correo y contraseña); el método institucional se define con el Centro de Cómputos |
| Repositorio | GitHub + GitHub Actions |

## Estructura del repositorio

```
.
├── CLAUDE.md          Instrucciones y decisiones para el asistente de IA
├── README.md          Este documento
├── app/               Aplicación móvil (Expo)
├── shared/            Tipos, enums y normalización de códigos compartidos
├── supabase/          Migraciones SQL, Edge Function, pruebas por rol y esquema base histórico
└── docs/              Documentación, diagramas y decisiones
```

## Estado

Etapa de implementación. Última actualización: 30/10/2026. El detalle por fases está en `docs/estado-y-retomar.md`.

### Qué funciona

- **App (Expo SDK 58):** inicio de sesión (cuentas creadas por un administrador), cambio obligatorio de la contraseña temporal, PIN de bloqueo opcional, escáner, ficha del bien con responsable, búsqueda, "Explorar bienes" por área, responsable y ubicación, lotes por ubicación, relevamientos individuales, hallazgos con foto, "Mis relevamientos" y "Del equipo", jornadas por área o ubicación en tiempo real, exportación a CSV, historiales de cargas y de exportaciones, cuentas y actividad (administradores), perfil, ajustes y menú lateral.
- **Catálogo:** importación desde la app de listados o informes de SIU (CSV o XLSX), con vista previa, historial y varias áreas; hoy hay 88 bienes de prueba.
- **Base (Supabase):** RLS por rol, privilegios mínimos, auditoría append-only y Realtime; scripts de prueba por rol en `supabase/tests/`.
- **Pruebas:** 29 unitarias en `shared`, 27 en `app` (lógica del lote por ubicación), scripts SQL por rol y prueba manual en teléfonos con Expo Go. `npm test` corre las unitarias.

### No implementado todavía

- Exportación a PDF y vista de administrador por ubicación o relevador.
- Relevamientos individuales y lotes asociados a una jornada.
- Tablas propias para áreas, ubicaciones y empleados.
- Cola de reintentos e indicador de conexión.
- Revocación inmediata de sesiones al suspender una cuenta.

## Cambios recientes

| Fecha | Cambio |
|---|---|
| 30/10/2026 | Se retira el backend NestJS (`backend/`, Prisma, Docker). El esquema base de Prisma queda en `supabase/base-prisma/`. Historial de exportaciones y, en las jornadas, gana la primera lectura de cada bien. |
| 26/10/2026 | Plan v3 (fases 1 a 5): seguridad en la base, cuentas por administrador, app directo a Supabase, importación del catálogo desde la app, explorar bienes y jornadas compartidas en tiempo real. |
| 23/10/2026 | Hallazgos, relevamientos individuales y por lote, exportación a CSV auditada, auditoría append-only y PIN con biometría (con el backend anterior). |
| 22/10/2026 | Se crea la app Expo y la base pasa a Supabase. |

El diario completo está en `docs/06-bitacora/`.

## Puesta en marcha en otra computadora

Requisitos: Node.js 24 o superior, Git y un proyecto de Supabase. La guía completa está en `docs/00-inicio/puesta-en-marcha.md`; en resumen:

```bash
git clone https://github.com/LautaCastillo/Lector-Codigo.git
cd Lector-Codigo
npm_config_legacy_peer_deps=true npm install
npm run build -w shared
npm run start -w app -- --clear
```

Antes hay que crear `app/.env` a partir de `app/.env.example` con la URL y la clave **publicable** de Supabase (nunca la secreta). Los `.env` no se versionan. Para entrar hace falta una cuenta creada por un administrador.

## Próximos pasos

1. Desactivar el registro público en Supabase; rotar `consulta.patrimonio`; dar de baja las cuentas de prueba.
2. Comentar cada archivo y función importante (cierre de la fase 6).
3. Pedir el aval de Patrimonio para cargar datos reales; confirmar las simbologías reales de las etiquetas.

La hoja de ruta vigente es `docs/plan-v3-supabase-directo.md`. El estado y las decisiones pendientes, en `docs/estado-y-retomar.md`; el índice de la documentación, en `docs/README.md`.

## Mantenimiento

El proyecto será mantenido por otra persona después de la entrega. Por eso, cada decisión técnica relevante debe quedar documentada en `docs/`.
