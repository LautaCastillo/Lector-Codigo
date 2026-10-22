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

- Autenticación (suspendida; el diseño la deja enchufable para el login institucional de la UNSa).
- Versión para iOS (se evaluará después, con el mismo código base).
- Roles con permisos diferenciados (se diseñará el modelo, pero se implementará más adelante).
- Impresión de etiquetas.
- Gestión de compras, altas contables o bajas patrimoniales.

## Integración con SIU Diaguita

Solo lectura. La app nunca escribe en SIU. El backend consulta SIU Diaguita mediante scraping de su interfaz web y expone los datos a la app. Detalles y fragilidad en `CLAUDE.md` y `docs/siu/`.

## Usuarios

Unas 30 personas del área de Patrimonio. En esta primera versión, todos los usuarios tienen las mismas funciones. El acceso se identifica provisoriamente por una cabecera; el login institucional se define más adelante.

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
| Base de datos | PostgreSQL (Supabase si el plan gratuito alcanza; Docker en desarrollo) |
| Autenticación | A definir con el Centro de Cómputos |
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

En etapa de implementación inicial: estructura del monorepo, paquete `shared` y esqueleto del backend. Pendientes principales: simbologías realmente usadas, método de autenticación, consultas a SIU, significado de "Cantidad de bienes", estados y ubicaciones, imágenes, carga inicial y pago de Google Play. Ver `CLAUDE.md`.

## Próximos pasos

1. Confirmar con Patrimonio qué simbologías se usan y si el código equivale al número de inventario.
2. Validar el modelo de datos y las listas de estados y ubicaciones.
3. Obtener un listado de bienes de muestra para pruebas (sin datos sensibles).
4. Completar el backend (SIU, sincronización) y comenzar la app.

## Mantenimiento

El proyecto será mantenido por otra persona después de la entrega. Por eso, cada decisión técnica relevante debe quedar documentada en `docs/`.
