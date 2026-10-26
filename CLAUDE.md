# CLAUDE.md: Instrucciones para el asistente

Este archivo define el contexto y las reglas de trabajo para cualquier asistente de IA que colabore en este proyecto. Leelo completo antes de generar código o archivos.

## Proyecto

Aplicación móvil para **Android** (iOS queda para una etapa posterior, con el mismo código base) que permite a la **Dirección de Patrimonio de la UNSa** leer códigos de barras de los bienes institucionales, consultar su información, registrar relevamientos y hallazgos en campo, y exportarlos. Debe funcionar **sin conexión** durante un máximo de 2 días y sincronizar cuando haya red.

Contexto completo: ver `README.md`. Hoja de ruta vigente: `docs/plan-v3-supabase-directo.md` (26/10/2026). Los planes anteriores (`plan-de-mejora-login-auditoria-siu.md` y `plan-de-mejoras-y-decisiones.md`) son históricos. Estado y decisiones pendientes: `docs/estado-y-retomar.md`. Donde este archivo y el plan vigente difieran, manda el plan vigente. Parte de este archivo describe el estado actual del código (backend NestJS) que el plan v3 retira por fases: ver su sección 10.

## Reglas de trabajo

- Responder en **español rioplatense (voseo)**. Usar registro formal solo en entregables (documentación, informes).
- Sin emojis. Sin introducciones ni cierres de relleno.
- Antes de generar código, verificar que el stack y las decisiones estén confirmados en este archivo. Si hay pendientes que afectan lo que se va a escribir, preguntar primero.
- Generar **código limpio y mínimo**. Explicar en pocas líneas solo lo necesario.
- Para cada archivo nuevo: indicar la **ruta exacta**, su propósito y cómo encaja con el resto.
- Si se pide un entregable sin formato de archivo indicado (doc, Word, PDF, Excel), **preguntar** cuál se quiere antes de generarlo.
- No inventar datos sobre los bienes, las reglas de negocio ni la infraestructura de la UNSa. Si falta un dato, dejarlo como pendiente.
- Antes de afirmar algo sobre bibliotecas, versiones o APIs (incluido SIU Diaguita), verificarlo en la documentación oficial o en la web.
- No desarrollar integraciones con SIU: el catálogo entra solo por archivo.
- La autenticación debe fallar cerrada: sin configuración válida, el backend no arranca ni acepta identidades provisorias.
- No hacer commit ni push salvo que el usuario lo pida. Commits de código y de documentación por separado.

## Decisiones confirmadas

- **Plataforma:** Android en la primera etapa. iOS se evalúa después, con el mismo código base.
- **Simbologías de códigos:** la app debe leer **distintos tipos de códigos de barras** (no solo Code 39). La lista de simbologías habilitadas es **configurable**. Soportadas por `expo-camera` (SDK 58): `code39`, `code93`, `code128`, `ean13`, `ean8`, `upc_a`, `upc_e`, `itf14`, `codabar`, `qr`, `datamatrix`, `pdf417`, `aztec`. Habilitar demasiados tipos puede aumentar falsos positivos y consumo de CPU, por eso se parte de un conjunto por defecto y se ajusta según lo que use Patrimonio. Code 39 está confirmado como uno de los usados. Cada bien tiene su propio número de inventario (una unidad, un número) y puede tener varios códigos asociados. Los bienes sin código o con código dañado se registran con un estado especial.
- **Conexión (plan v3, D7):** los relevamientos son compartidos y en tiempo real (Supabase Realtime), así que la app requiere conexión. Se abandona el requisito de 2 días sin conexión; queda como opcional una cola de reintentos para cortes breves. En conflicto no se descarta ninguna versión. La subida sigue siendo idempotente (UUID generado en el cliente).
- **Arquitectura (plan v3, D1):** no habrá backend propio. La app hablará directo con Supabase (Auth, Postgres con RLS, Realtime, Storage y Edge Functions) y el backend NestJS actual se retira al terminar la migración. Con RLS como única barrera, la seguridad de las políticas no se posterga. La clave secreta de Supabase nunca va en la app ni en el repositorio.
- **Autenticación (plan v3, D2 y D3):** **Supabase Auth**, definitivo. Solo inicio de sesión: las cuentas las crea un administrador desde la app (Edge Function), se desactiva el registro público y la sesión no caduca; PIN y biometría pasan a ser opcionales. Estados objetivo: `activa`, `suspendida`, `baja`. Ya implementado (fase 2): alta por administrador con la Edge Function `admin-cuentas`, contraseña temporal con cambio obligatorio, PIN opcional y sesión sin caducidad; falta desactivar el registro público en el panel de Supabase. Los estados `pendiente` y `rechazada` quedan solo por compatibilidad. El backend actual resuelve el usuario en un único guard global con denegación por defecto (`@Publico()`, `@PermitirInactivo()`, `@Roles(...)`) y falla cerrado: sin `SUPABASE_URL` no arranca. `AUTH_PROVISORIA=true` (identidad por `x-relevador`) solo existe en desarrollo y pruebas, y está prohibida con `NODE_ENV=production`. Estados de cuenta: `pendiente`, `activa`, `rechazada`, `suspendida`, `baja`. La sesión vive en `expo-secure-store`; el PIN de bloqueo es opcional.
- **Integración con SIU Diaguita (plan v3, D5 y D6):** sin conexión a SIU: ni API, ni scraping, ni vistas. La app nunca escribe en SIU. El catálogo entra por un archivo CSV o XLSX descargado de Diaguita, que un administrador carga a un catálogo único en Supabase. Hoy lo hace `npm run importar -w backend` (módulo `backend/src/catalogo/`); pasará a la app.
- **Roles:** `administrador` y `relevador`, con autorización por rol y denegación por defecto.
- **Trazabilidad y auditoría:** `evento_auditoria` y `cambio_fila` son append-only (triggers bloquean UPDATE, DELETE y TRUNCATE). Se registra quién y cuándo (hora del dispositivo y del servidor) en cada relevamiento, hallazgo, exportación y cambio de cuenta.
- **Exportación:** CSV implementado (con constancia de cada exportación: filtros, filas y huella SHA-256); PDF pendiente.
- **Alta de bienes:** no existe la edición del catálogo. Un "alta" es un **hallazgo** (registro externo a SIU de un bien no identificado o nuevo, con código provisorio y foto opcional); Patrimonio lo incorpora a SIU manualmente. SIU nunca se modifica.
- **Distribución y datos:** el proyecto es independiente y sin presupuesto; se distribuye por APK. Los datos viven en Supabase (fuera de la UNSa); antes de cargar datos reales hace falta el aval escrito de Patrimonio.
- **Usuarios estimados:** unas 30 personas.
- **Presupuesto:** no hay presupuesto para servicios pagos por ahora.
- **Mantenimiento:** lo mantendrá otra persona después de la entrega. La documentación debe ser completa y autocontenida.

## Stack

- **Monorepo** con npm workspaces: `app/`, `backend/`, `shared/`, `docs/`. Además `supabase/` (migraciones SQL y pruebas de políticas, no es un workspace). Decisiones en `docs/02-decisiones/`.
- **App:** React Native con Expo (TypeScript), Expo Router.
- **Lectura de códigos:** `expo-camera`, con `barcodeScannerSettings.barcodeTypes` configurable (lista verificada arriba). Limitaciones conocidas: en iOS no hay `cornerPoints` para code39/pdf417.
- **Almacenamiento local:** `expo-secure-store` (sesión) y AsyncStorage (tema y lote en curso). SQLite (`expo-sqlite`) ya no es parte del plan v3.
- **Backend actual:** NestJS 12 (ESM, Vitest, oxlint, TypeScript 6), a retirar según el plan v3. Destino: Supabase (RLS, funciones SQL, Edge Functions, Realtime y Storage), con migraciones SQL en `supabase/migrations/`.
- **ORM:** Prisma 7 (CLI 7.10.1 fijado; `prisma@latest` apunta a un RC), generador `prisma-client`, adaptador `@prisma/adapter-pg`.
- **Base de datos:** PostgreSQL 17 en Supabase (plan gratuito), conexión por Session pooler. RLS con políticas por rol y privilegios mínimos (migración `supabase/migrations/20261026131335_fase1_seguridad_rls.sql`; ADR 0005). Ya no se usa Docker.
- **Autenticación:** Supabase Auth (ver decisión de arriba); validación de tokens con `jose` (JWKS).
- **Repositorio:** GitHub, con GitHub Actions para pruebas.

## Modelo de datos (resumen)

El esquema real está en `backend/prisma/schema.prisma` y manda sobre esta lista. `bien` es un espejo del catálogo de SIU (se carga por importación); los campos siguen el formulario de SIU Diaguita:

- `bien`
  - `numero_inventario` (ej. 00333013), clave de búsqueda principal y único por bien
  - `estado_codigo`: `legible`, `sin_codigo`, `codigo_danado`, `desconocido`. Los dos últimos se usan cuando el bien no puede identificarse por código.
  - `descripcion` (texto libre)
  - `cantidad` (campo "Cantidad de bienes" del formulario; como cada unidad tiene su número, verificar qué representa en SIU)
  - `estado_bien` (lista cerrada, a definir con Patrimonio)
  - `valor_unitario`
  - `fecha_incorporacion`
  - `proveedor`, `numero_factura`, `fecha_factura`
  - `responsable_uso`
  - `ubicacion_fisica` (lista cerrada)
  - `area_responsable`
  - `titularidad`: `propio` o `terceros`
  - `numero_serie`
  - `imagen` (archivo; definir almacenamiento y tamaño máximo)
  - `creado_por`, `creado_en`, `modificado_por`, `modificado_en`
- `codigo_bien`: códigos asociados a un bien (`bien_id`, `simbologia`, `valor` normalizado). Único por (`simbologia`, `valor`). Un bien puede tener varios. Reemplaza al antiguo campo `codigo_barras`.
- `relevamiento`: registro de una lectura en campo (usuario, fecha y hora del dispositivo y del servidor, observaciones, estado físico, `id_cliente` UUID). Resultado: `encontrado`, `no_encontrado`, `sin_verificar` o `hallazgo`. Los hallazgos llevan clase (`no_identificado` o `nuevo`), descripción, número de serie y código provisorio `H-XXXXXXXX`; la foto (un JPEG de hasta 1 MB) vive en `foto_relevamiento`.
- `evento_auditoria` y `cambio_fila`: auditoría append-only (eventos de negocio y cambios de fila por triggers). Reemplazan al antiguo `historial_cambio`.
- `exportacion`: formato, filtros aplicados, cantidad de filas, huella SHA-256, usuario, fecha y hora.
- `usuario`: cuenta (vinculada a Supabase Auth), rol (`administrador` o `relevador`) y estado de cuenta.

Resolución de un escaneo: buscar por (`simbologia`, `valor`) en `codigo_bien`; si no hay coincidencia, buscar por `numero_inventario` con el valor normalizado.

## Requisitos

Funcionales:

1. Escanear un código de barras (varias simbologías) con la cámara y buscar el bien asociado.
2. Mostrar la información del bien.
3. Registrar hallazgos (bien no identificado o nuevo, sin código o con código dañado) sin modificar SIU, con código provisorio y foto opcional. Un administrador puede vincularlos al catálogo.
4. Registrar relevamientos en campo, incluso sin conexión (la subida sin conexión depende del núcleo offline, aún no hecho).
5. Consultar el historial de cada bien (el catálogo no se edita desde la app; ver decisión sobre alta de bienes).
6. Exportar a CSV (hecho) y PDF (pendiente), con filtros, dejando constancia de quién y cuándo.
7. Sincronizar datos pendientes al recuperar conexión, sin perder ninguna versión.

No funcionales:

- Relevamientos compartidos en tiempo real entre varios teléfonos (requiere conexión).
- Trazabilidad completa de altas, cambios, relevamientos y exportaciones.
- Cuentas nominales creadas por un administrador, con acceso inmediato cortado al suspenderlas.

## Pendientes

Bloquean decisiones técnicas:

- **Simbologías reales:** qué tipos de código usa Patrimonio además de Code 39, y si el contenido del código coincide con el número de inventario. Definir si hay relleno de ceros (EAN/ITF).
- **Imágenes y datos de empleados:** qué datos personales de empleados hacen falta y cuántas fotos por bien (hoy una por hallazgo, hasta 1 MB, en Supabase).
- **Aval de Patrimonio:** para cargar datos reales (inventario y empleados) en Supabase. Las consultas al Centro de Cómputos de `docs/consultas-unsa.md` ya no bloquean el desarrollo.
- **Datos del plan v3:** logo de la UNSa, estructura de áreas, ubicaciones y empleados, y detalle de los tipos de relevamiento.
- **Cuentas expuestas o de prueba:** **rotar `consulta.patrimonio`** de SIU (sus credenciales se expusieron en un chat) y cambiar o dar de baja `adminlauta` y `relevador-app` antes de cargar datos reales.
- **Campo "Cantidad de bienes":** confirmar su significado en SIU, dado que cada unidad tiene su número.
- **Lista de estados del bien y de ubicaciones:** valores válidos, a validar con Patrimonio.
- **Imágenes:** cuántas por bien, tamaño máximo y dónde deben guardarse.
- **Carga inicial:** existen listados de bienes. Confirmar formato y volumen.
- **Publicación en Google Play:** pago único. Confirmar quién lo cubre.

Pueden resolverse durante el desarrollo:

- Formato exacto del PDF y del CSV.
- Política de conflictos para ediciones simultáneas de campos distintos del mismo bien.
- Compatibilidad de `shared/` entre Nest (nodenext) y Metro (Expo): compilar a `dist`.
- Metadatos de decoradores bajo Vitest (puede requerir `@Inject()` explícito o un plugin SWC).

## Convenciones

- Estructura del repositorio:
  - `app/`: aplicación móvil
  - `backend/`: API
  - `shared/`: tipos, enums y normalización de códigos compartidos
  - `docs/`: documentación, diagramas y decisiones
- Commits en español, en imperativo y breves: `Agrega pantalla de escaneo`.
- Nunca subir credenciales. Usar variables de entorno y un archivo `.env.example` sin valores reales.
- Cada cambio de privilegios, políticas o funciones SQL se prueba con `supabase/tests/politicas.sql` (debe dar todo verdadero) y se revisa con el asesor de seguridad de Supabase.
- Pruebas: unitarias (Vitest) para la lógica de búsqueda, sincronización, normalización y parser de SIU; prueba manual en dispositivos Android reales para la cámara y el modo sin conexión.
