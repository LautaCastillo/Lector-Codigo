# CLAUDE.md: Instrucciones para el asistente

Este archivo define el contexto y las reglas de trabajo para cualquier asistente de IA que colabore en este proyecto. Leelo completo antes de generar código o archivos.

## Proyecto

Aplicación móvil para **Android** (iOS queda para una etapa posterior, con el mismo código base) que permite a la **Dirección de Patrimonio de la UNSa** leer códigos de barras de los bienes institucionales, consultar y registrar su información, y exportarla. Debe funcionar **sin conexión** durante un máximo de 2 días y sincronizar cuando haya red.

Contexto completo: ver `README.md`.

## Reglas de trabajo

- Responder en **español rioplatense (voseo)**. Usar registro formal solo en entregables (documentación, informes).
- Sin emojis. Sin introducciones ni cierres de relleno.
- Antes de generar código, verificar que el stack y las decisiones estén confirmados en este archivo. Si hay pendientes que afectan lo que se va a escribir, preguntar primero.
- Generar **código limpio y mínimo**. Explicar en pocas líneas solo lo necesario.
- Para cada archivo nuevo: indicar la **ruta exacta**, su propósito y cómo encaja con el resto.
- Si se pide un entregable sin formato de archivo indicado (doc, Word, PDF, Excel), **preguntar** cuál se quiere antes de generarlo.
- No inventar datos sobre los bienes, las reglas de negocio ni la infraestructura de la UNSa. Si falta un dato, dejarlo como pendiente.
- Antes de afirmar algo sobre bibliotecas, versiones o APIs (incluido SIU Diaguita), verificarlo en la documentación oficial o en la web.

## Decisiones confirmadas

- **Plataforma:** Android en la primera etapa. iOS se evalúa después, con el mismo código base.
- **Simbologías de códigos:** la app debe leer **distintos tipos de códigos de barras** (no solo Code 39). La lista de simbologías habilitadas es **configurable**. Soportadas por `expo-camera` (SDK 57): `code39`, `code93`, `code128`, `ean13`, `ean8`, `upc_a`, `upc_e`, `itf14`, `codabar`, `qr`, `datamatrix`, `pdf417`, `aztec`. Habilitar demasiados tipos puede aumentar falsos positivos y consumo de CPU, por eso se parte de un conjunto por defecto y se ajusta según lo que use Patrimonio. Code 39 está confirmado como uno de los usados. Cada bien tiene su propio número de inventario (una unidad, un número) y puede tener varios códigos asociados. Los bienes sin código o con código dañado se registran con un estado especial.
- **Funcionamiento offline:** la app guarda los datos localmente y los sincroniza cuando hay conexión. El período máximo sin conexión es de **2 días**. Los datos de ambos lados (dispositivo y servidor) deben conservarse; en caso de conflicto, no se descarta ninguna versión y el cambio queda en el historial. La subida de relevamientos es idempotente (UUID generado en el cliente).
- **Autenticación:** **suspendida por ahora**, pero el diseño la deja enchufable. El backend resuelve el usuario actual en un único guard global (hoy: cabecera `x-relevador` y `API_KEY` opcional); se reemplazará por el login institucional de la UNSa cuando se defina. Las tablas `usuario` y rol existen desde el inicio.
- **Integración con SIU Diaguita:** **solo lectura**. La app nunca escribe en SIU. El acceso se hace desde el **backend**, mediante scraping de la interfaz web (framework Toba: login por formulario, evento `filtrar`, tabla HTML de resultados), aislado en `backend/src/siu/` con pruebas sobre fixtures HTML. Es frágil si SIU cambia identificadores. Las credenciales viven solo en variables de entorno del backend.
- **Roles:** existirán en el futuro, con menos funcionalidades para los roles que no sean administrador. Diseñar el modelo para soportarlos, sin implementarlos todavía.
- **Trazabilidad:** registrar quién y cuándo (fecha y hora del dispositivo, y también la del servidor al sincronizar) en cada alta, modificación, relevamiento y exportación.
- **Exportación:** PDF o CSV, usable por todos los usuarios. Debe quedar constancia de cada exportación.
- **Usuarios estimados:** unas 30 personas.
- **Presupuesto:** no hay presupuesto para servicios pagos por ahora.
- **Mantenimiento:** lo mantendrá otra persona después de la entrega. La documentación debe ser completa y autocontenida.

## Stack

- **Monorepo** con npm workspaces: `app/`, `backend/`, `shared/`, `docs/`.
- **App:** React Native con Expo (TypeScript), Expo Router.
- **Lectura de códigos:** `expo-camera`, con `barcodeScannerSettings.barcodeTypes` configurable (lista verificada arriba). Limitaciones conocidas: en iOS no hay `cornerPoints` para code39/pdf417.
- **Almacenamiento local:** SQLite (`expo-sqlite`).
- **Backend:** NestJS 12 (ESM, Vitest, oxlint, TypeScript 6), API REST con OpenAPI.
- **ORM:** Prisma 7 (CLI 7.10.1 fijado; `prisma@latest` apunta a un RC), generador `prisma-client`, adaptador `@prisma/adapter-pg`.
- **Base de datos:** PostgreSQL (Supabase, si el plan gratuito alcanza; en desarrollo, Docker).
- **Autenticación:** a definir (ver decisión de arriba).
- **Repositorio:** GitHub, con GitHub Actions para pruebas.

## Modelo de datos (borrador)

Campos del formulario de alta de bien, según relevamiento de pantalla de SIU Diaguita:

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
- `relevamiento`: registro de una lectura en campo (bien o código no identificado, usuario, fecha y hora del dispositivo, fecha de sincronización, observaciones, estado detectado, `id_cliente` UUID).
- `historial_cambio`: un registro por cada modificación, con campo, valor anterior, valor nuevo, usuario, fecha y hora.
- `exportacion`: formato, filtros aplicados, usuario, fecha y hora.
- `usuario`: cuenta institucional, rol (por ahora solo administrador y relevador), estado activo.

Resolución de un escaneo: buscar por (`simbologia`, `valor`) en `codigo_bien`; si no hay coincidencia, buscar por `numero_inventario` con el valor normalizado.

## Requisitos

Funcionales:

1. Escanear un código de barras (varias simbologías) con la cámara y buscar el bien asociado.
2. Mostrar la información del bien.
3. Crear un bien cuando no tiene código o el código está dañado, con estado `sin_codigo` o `codigo_danado`, y completar el resto de los datos.
4. Registrar relevamientos en campo, incluso sin conexión.
5. Editar bienes según permisos, con historial de cambios.
6. Exportar a PDF o CSV, con filtros, dejando constancia de quién y cuándo.
7. Sincronizar datos pendientes al recuperar conexión, sin perder ninguna versión.

No funcionales:

- Funcionar sin conexión durante hasta 2 días desde la última sincronización.
- Trazabilidad completa de altas, cambios, relevamientos y exportaciones.
- Autenticación con cuentas institucionales (diferida).

## Pendientes

Bloquean decisiones técnicas:

- **Simbologías reales:** qué tipos de código usa Patrimonio además de Code 39, y si el contenido del código coincide con el número de inventario. Definir si hay relleno de ceros (EAN/ITF).
- **Método de autenticación:** las cuentas se crean en el Centro de Cómputos y se usan en la web. Confirmar el protocolo (LDAP/Active Directory, SSO, CAS, OAuth u otro). Define el login y cuánto puede usarse la app sin reautenticar dentro de la ventana de 2 días.
- **Consultas a SIU Diaguita:** obtener el código de las consultas (HAR o PHP) para cubrir más filtros; evaluar la fragilidad del scraping. **Rotar la cuenta `consulta.patrimonio`**, cuyas credenciales se expusieron en un chat.
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
- Pruebas: unitarias (Vitest) para la lógica de búsqueda, sincronización, normalización y parser de SIU; prueba manual en dispositivos Android reales para la cámara y el modo sin conexión.
