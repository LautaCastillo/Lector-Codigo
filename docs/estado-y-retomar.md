# Estado del proyecto y cómo retomar

Actualizado el 23/10/2026. Rama `lautaPC`. Hoja de ruta vigente: [`plan-de-mejora-login-auditoria-siu.md`](plan-de-mejora-login-auditoria-siu.md). Para levantar el proyecto en otra computadora: [`00-inicio/puesta-en-marcha.md`](00-inicio/puesta-en-marcha.md). Historia detallada: [`06-bitacora/`](06-bitacora/).

## 1. Dónde estamos en el roadmap

Fases de la sección 4.4 del plan.

| Fase | Contenido | Estado |
|---|---|---|
| 0. Cimientos | Estructura de `docs/`, ADR 0001 a 0006, consultas enviadas, CI con lint y pruebas | **En curso.** Hecho: estructura de `docs/` y lista de consultas. Falta: ADR, enviar las consultas, confirmar que el CI corre en GitHub |
| 1. Seguridad | Autenticación propia, invitaciones, estados, roles, sesiones, `evento_auditoria` append-only, sin `x-relevador` ni `API_KEY` | **Parcial.** Ver la sección 2: la auditoría ya está; se decidió mantener Supabase Auth por ahora, aunque el plan recomienda reemplazarla |
| 2. Núcleo sin conexión | `expo-sqlite`, catálogo local, cola de salida, `/sync` idempotente, conflictos, relojes | No iniciada |
| 3. UX de campo | Escaneo mejorado, ficha, búsqueda, lotes, indicador de conexión, accesibilidad | No iniciada |
| 4. Gestión | Alta y edición con historial, resolución de conflictos, exportaciones, pantalla de actividad | No iniciada |
| 5. Integración SIU | Puerto `FuentePatrimonio`, adaptadores de archivo y REST, caché | Parcial: existe el importador de Excel |
| 6. Entrega | Runbook, traspaso, release Android, caso de estudio | No iniciada |

Figma corre en paralelo desde la fase 0 y debe estar listo antes de la fase 3. Todavía no se empezó.

## 2. Fase 1 contra lo que pide el plan

El plan (secciones 1.2 a 1.6) recomienda autenticación propia en NestJS, cuentas por invitación del administrador y quitar `supabase-js` de la app. Lo construido hasta ahora usa Supabase Auth con autorregistro y aprobación.

| Requisito del plan | Estado |
|---|---|
| Quitar la confianza en `x-relevador` | **Hecho en producción.** Sin `SUPABASE_URL` el backend no arranca; `AUTH_PROVISORIA=true` solo existe en desarrollo |
| Quitar la `API_KEY` embebida en la app | **Hecho** |
| Guard global con denegación por defecto y guard de roles | **Hecho** (`@Publico()`, `@PermitirInactivo()`, `@Roles(...)`) |
| Estados de cuenta con máquina de estados | **Parcial.** Hay `pendiente`, `activa`, `rechazada`, `suspendida` y `baja`; el plan propone `invitada`, `activa`, `suspendida` y `baja` |
| Alta de cuentas por invitación del administrador | **No.** Hoy es autorregistro con aprobación, que el plan califica como "aceptable solo si el login es institucional" |
| Autenticación propia: Argon2id, access token de 15 min, refresh rotativo, tabla `sesion`, endpoints `/auth/*` | **No.** Hoy la emite Supabase |
| Puerto `IdentityProvider` intercambiable | **No** |
| Quitar `@supabase/supabase-js` de la app | **No** |
| Política de contraseñas (15 caracteres sin MFA, lista de contraseñas comunes) | **No.** Hoy el mínimo es 8 |
| Límite de intentos con `@nestjs/throttler` | **No** |
| Recuperación de contraseña por código del administrador | **No** |
| Revocación remota de sesiones | **No.** Suspender no corta la sesión ya emitida |
| Refresh token en `expo-secure-store` y bloqueo con biometría o PIN | **Hecho**, con una diferencia: se guarda la sesión completa y no solo el refresh token |
| Access token solo en memoria | **No** |
| Reautenticación tras 5 PIN fallidos | **Hecho** (cierra la sesión) |
| Operaciones sin conexión de sesiones revocadas en `en_cuarentena` | **No** (depende de la fase 2) |
| Excluir SQLite y SecureStore del backup de Android | **Parcial.** El plugin de SecureStore está configurado; no hay SQLite todavía |
| `evento_auditoria` append-only y triggers | **Parcial.** Hecho: tabla `evento_auditoria`, tabla `cambio_fila` con triggers, `set_config` del actor, bloqueo de UPDATE, DELETE y TRUNCATE, y eventos de cuentas y sesiones. Falta: `LOGIN_FALLIDO` (solo con autenticación propia), relojes del dispositivo, cadena de hashes (opcional) y retirar al rol de la aplicación los permisos de UPDATE y DELETE (depende del ADR del rol de base de datos) |
| Decidir en un ADR cómo conecta el backend a la base (RLS) | **No** |

## 3. Qué funciona hoy

- **Backend** (NestJS, Prisma 7, Supabase): `/health`, `/configuracion/simbologias`, `POST /bienes/escaneo`, `GET /bienes/:numeroInventario`, `GET` y `PATCH /me`, y `/admin/usuarios` para aprobar, rechazar, suspender, reactivar, dar de baja y cambiar el rol.
- **App** (Expo SDK 57): login, registro, cuenta pendiente, inicio, escáner, perfil editable, ajustes con modo claro y oscuro, menú lateral, pantalla de cuentas para administradores y bloqueo con PIN o biometría.
- **Catálogo:** 55 bienes de prueba importados desde un listado de SIU (`npm run importar -w backend`), que es el camino (c) del plan. El escaneo resuelve el número de inventario con distinto relleno de ceros.
- **Bienes:** ficha completa (`GET /bienes/:numero`, acepta el número con o sin ceros), búsqueda manual (`GET /bienes?q=`, por número, número anterior, descripción, catálogo o ubicación) e historial (`GET /bienes/:numero/historial`, tomado de los registros de los triggers). En la app: ficha con secciones plegables e historial en línea de tiempo, búsqueda con espera al escribir, y escáner con resumen del bien, vibración, linterna, recuadro guía y descarte de lecturas repetidas durante 2 segundos.
- **Lote por ubicación:** se elige una ubicación (`GET /ubicaciones`), se escanea en ráfaga contra lo que el catálogo ubica ahí (`GET /bienes?ubicacion=`) y al terminar se ve cuántos se encontraron, cuáles faltan, cuáles figuran en otra ubicación y cuáles no están en el catálogo. Lo esperado se compara en el teléfono (sin red); solo lo desconocido se consulta al servidor. El lote en curso se guarda en el teléfono y se puede continuar tras un bloqueo o reinicio. El resumen se comparte como texto; todavía no se envía al servidor.
- **Auditoría:** cada alta de cuenta, aprobación, rechazo, suspensión, reactivación, baja y cambio de rol, y el inicio de cada sesión, queda en `evento_auditoria`. El administrador consulta el registro en `GET /admin/auditoria` y cada usuario su actividad en `GET /me/actividad`. La app tiene la pantalla "Actividad" para administradores, con filtros por cuentas, sesiones y consultas. Los triggers registran además todo cambio en `usuario`, `bien`, `codigo_bien` y `relevamiento` (`cambio_fila`).
- **Pruebas:** unitarias y e2e del backend y de `shared`, correctas. La app se verificó en un celular con Expo Go.

## 4. Decisiones pendientes (sección 7.1 del plan)

Ninguna está resuelta. Las preguntas concretas están en [`consultas-unsa.md`](consultas-unsa.md).

| N.º | Decisión | Con quién | Bloquea |
|---|---|---|---|
| 1 | Dónde se hospeda el backend y la base (servidor UNSa, Supabase u otro) y si habrá HTTPS con dominio institucional | Centro de Cómputos | Integración SIU, disponibilidad |
| 2 | Habilitar un usuario de la API REST de Diaguita y confirmar versión y endpoints de bienes | Centro de Cómputos o referente de SIU | Opción (a) |
| 3 | Plan B: vistas de solo lectura o exportación programada | Centro de Cómputos y Patrimonio | Frescura de datos |
| 4 | Protocolo de identidad institucional (Araí, LDAP o AD, CAS) y si se permite federar | Centro de Cómputos | Login institucional futuro |
| 5 | Modelo de alta de cuentas (invitación) y quiénes son administradores | Dirección de Patrimonio | Fase 1 |
| 6 | SMTP institucional para invitaciones y recuperación | Centro de Cómputos | Recuperación por correo |
| 7 | Simbologías y formato de las etiquetas | Dirección de Patrimonio | Configuración de la cámara |
| 8 | Retención de la auditoría y normativa aplicable | Patrimonio y área legal | Política de retención |
| 9 | Si se exporta en el formato del Colector de Datos de Diaguita | Dirección de Patrimonio | Exportaciones |
| 10 | Licencia del código y permiso para mostrar el proyecto en el portfolio (sin datos reales) | Patrimonio y cátedra o tutor | Portfolio |

## 5. Diferencias con el plan complementario (v2)

[`plan-de-mejoras-y-decisiones.md`](plan-de-mejoras-y-decisiones.md) parte del plan vigente y agrega decisiones del autor. Donde difieren, manda el plan vigente, salvo que el autor decida otra cosa.

| Tema | Plan vigente | Complemento v2 |
|---|---|---|
| Alta de cuentas | Solo por invitación del administrador | A, B o ambas; recomienda autorregistro con aprobación como vía normal |
| Proveedor de identidad | Autenticación propia ahora; Supabase solo como hosting de PostgreSQL | Depende del hosting; con Supabase como proveedor si no hay servidor de la UNSa |
| Estados de cuenta | `invitada`, `activa`, `suspendida`, `baja` | Suma `pendiente` y `rechazada` |
| Recuperar contraseña | Código de un solo uso entregado por el administrador | Depende de si hay SMTP |
| Alta de bienes | Alta y edición con historial (fase 4) | Hallazgos e informes; SIU nunca se modifica y la app no edita el catálogo |
| App Colector | La analiza y sugiere exportar en su formato | Queda fuera del alcance |
| SIU | Adaptador de scraping como último recurso, moviendo el código existente | Opción API elegida; scraping sin desarrollo activo |

## 6. Riesgos que hoy están abiertos

- **Datos reales fuera de la UNSa:** el catálogo de prueba vive en Supabase. No cargar datos reales hasta resolver la decisión 1.
- **Pausa del proyecto gratuito de Supabase** tras una semana de inactividad, sobre todo en el receso de verano.
- **Cuenta `consulta.patrimonio` de SIU:** sus credenciales se expusieron en un chat y siguen sin rotar.
- **Cuenta de prueba de administrador:** contraseña débil y conocida. Cambiarla o eliminarla antes de cargar datos reales.
- **Cuenta `relevador-app`:** creada por la autenticación provisoria anterior; conviene darla de baja desde la pantalla de Cuentas.
- **Autorregistro público abierto:** hasta cambiar a invitaciones, cualquiera con la APK puede pedir una cuenta (queda pendiente y no accede a datos).

## 7. Próximos pasos

1. Rumbo de la fase 1: se mantiene Supabase Auth por ahora (decisión del 23/10/2026). Reabrir la migración a autenticación propia con invitaciones cuando se conozca el hosting.
2. Del plan, fase 3 (UX de campo): quedan el indicador de conexión y la pantalla de pendientes, que dependen del núcleo sin conexión. Al llegar la sincronización, los lotes deben enviarse al servidor como relevamientos (hoy el resumen solo se comparte).
3. ADR 0001 a 0006 en estado propuesto (criterio de salida de la fase 0), incluido el del rol de base de datos, que también define cómo se retiran UPDATE y DELETE al rol de la aplicación.
4. Actualizar `CLAUDE.md` para que coincida con el plan.
5. Pedir el aval a Patrimonio y enviar las consultas de [`consultas-unsa.md`](consultas-unsa.md).
6. Núcleo sin conexión (fase 2): al llegar, sumar a la auditoría los relojes del dispositivo, la secuencia y las operaciones en cuarentena.
