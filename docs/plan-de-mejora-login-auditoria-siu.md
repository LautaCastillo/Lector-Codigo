> **Documento histórico.** Desde el 26/10/2026 la hoja de ruta vigente es [`plan-v3-supabase-directo.md`](plan-v3-supabase-directo.md). Este plan se conserva como referencia de investigación (login, auditoría, SIU, UX, Figma, documentación).

# Plan de mejora de la app de relevamiento patrimonial de la UNSa: login, auditoría, integración con SIU-Diaguita, UX, Figma y documentación

La recomendación central es separar la app de los proveedores externos. Conviene construir la autenticación propia en NestJS (JWT de acceso corto, refresh token rotativo y alta de cuentas solo por invitación de un administrador) detrás de una interfaz de proveedor de identidad. Del lado de SIU, el backend debería consumir los datos de Patrimonio a través de una interfaz de fuente de datos y priorizar la API REST oficial de SIU-Diaguita, que existe y está documentada por el SIU. El scraping de Toba debería pasar a ser el último recurso.

## TL;DR

- **Login:** la autenticación debería ser propia en NestJS, con contraseñas en Argon2id, access token de unos 15 minutos y refresh token rotativo y revocable de 14 días. Las cuentas se crean por invitación del administrador, nunca por autorregistro. El refresh token se guarda en expo-secure-store y la app se desbloquea con biometría o PIN, lo que permite trabajar 2 días sin conexión. Hay que eliminar la confianza en `x-relevador` y en una API_KEY embebida en la app. Supabase Auth gratuito no conviene como base: pausa los proyectos inactivos, guarda solo 1 hora de logs de auditoría y no incluye SSO SAML.
- **SIU-Diaguita:** tiene una API REST versionada (`/diaguita/rest/v1/`, API 1.4 en Diaguita 4.3.0) con usuarios definidos en `servidor_usuarios.ini` y autenticación digest o basic. Además, el propio SIU publica una App Colector para relevamientos. El orden de viabilidad recomendado es: (a) API REST oficial, (c) exportaciones CSV/Excel como respaldo permanente, (b) vistas de solo lectura sobre la base y (d) scraping. No está confirmado públicamente qué endpoints de bienes expone la API ni qué versión usa la UNSa, así que hay que preguntarlo al Centro de Cómputos.
- **Orden de trabajo:** primero cimientos (docs/ADR, autenticación y auditoría append-only), después el núcleo offline (expo-sqlite, cola de salida y sincronización idempotente), luego la UX de escaneo, después el alta y edición con historial y la exportación, y recién al final la integración con SIU mediante adaptadores. Figma se trabaja en paralelo con un sistema de tokens propio, porque Code Connect requiere planes pagos.

---

## Cómo leer este informe

- **Verificado:** confirmado en documentación oficial (SIU, Supabase, Expo, NestJS, OWASP, Figma, Material Design) consultada en octubre de 2026.
- **Recomendación:** criterio propio, justificado con las restricciones del proyecto (sin presupuesto, un solo desarrollador, mantenimiento por terceros, Android primero).
- **Pendiente UNSa:** depende de la infraestructura o de decisiones de la UNSa, y no se supone nada sobre ellas.

---

## 1. Login y cuentas

### 1.1 Lo verificado sobre cada opción

**Supabase Auth (plan gratuito):**
- Incluye 50.000 usuarios activos mensuales, de sobra para unos 30 usuarios.
- Según la página de precios de Supabase (consultada en octubre de 2026), «Free projects are paused after 1 week of inactivity. Limit of 2 active projects.»
- Los logs de auditoría de Auth se retienen 1 hora y los logs de API y base de datos, 1 día.\[1\]
- SSO SAML 2.0 no está incluido en el plan gratuito.\[1\]
- La sesión es un access token JWT más un refresh token de un solo uso. La duración del JWT es configurable: por defecto 3600 s y como máximo 604.800 s (una semana).\[2\]\[3\]
- La documentación aclara que no hay forma de revocar un access token antes de que expire, por lo que recomienda expiraciones cortas.\[4\]
- Hay detección de reutilización de refresh tokens, con un intervalo de reuso de 10 s por defecto.\[2\]\[3\]

**NestJS:**
- La documentación oficial mantiene la receta con Passport (`@nestjs/passport`, `passport-jwt`, guards `AuthGuard('jwt')`).
- La página de autorización vigente describe además los paquetes `@nestjs/authentication` y `@nestjs/authorization`, con un guard global que **deniega por defecto** salvo que el handler declare `@Can()`, `@Can.Anyone()` o `@Public()`.\[5\]
- La misma página advierte que los guards de terceros, como las subclases de `AuthGuard()` de Passport, se registran con `APP_GUARD` y no con `app.useGlobalGuards()`, porque estos últimos se ejecutan después.\[5\]

**Identidad institucional SIU (SIU-Araí: Usuarios):**
- Araí-Usuarios es un proveedor y gestor de identidad que implementa SAML 2.0 y OpenID Connect.\[6\]
- Ofrece una API REST de gestión de usuarios (v2 recomendada) y usa OpenLDAP para compatibilidad con sistemas legacy vía LDAP.\[6\]\[7\]
- **Pendiente UNSa:** si la UNSa tiene Araí desplegado y si las cuentas web del Centro de Cómputos viven ahí, en un Active Directory o en otro sistema.

**OWASP y NIST SP 800-63B:**
- NIST SP 800-63B-4 (versión final de julio de 2025, §3.1.1.2) exige un mínimo de 15 caracteres cuando la contraseña es el único factor de autenticación. Con MFA, el umbral es de 8 caracteres.
- El máximo permitido debe ser de al menos 64 caracteres.\[8\]
- Hay que contrastar las contraseñas con listas de contraseñas comunes o filtradas.\[8\]
- No se deben usar preguntas de seguridad.\[8\]

**expo-secure-store (SDK 57):**
- Cifra con Keychain en iOS y Keystore en Android.\[9\]
- La opción `requireAuthentication` no funciona en Expo Go, así que hace falta una development build.\[10\]
- Los datos protegidos con esa opción quedan inaccesibles si cambian los datos biométricos, por ejemplo al agregar una huella.\[10\]
- Tiene un config plugin para el backup automático de Android (`configureAndroidBackup`).\[11\]

### 1.2 Comparativa

| Criterio | Supabase Auth (gratuito) | Auth propia NestJS (local + JWT + refresh) | Federación futura (Araí OIDC/SAML, LDAP/AD, CAS) |
|---|---|---|---|
| Costo | 0 | 0 | 0 en software; requiere acuerdo con el Centro de Cómputos |
| Disponibilidad | Pausa tras 1 semana sin actividad (riesgo en receso de enero) | Depende de dónde se hospede el backend | Depende del IdP institucional |
| Auditoría | 1 hora de logs de Auth en el plan gratuito | Total control: tabla propia | Logs del IdP (Araí tiene auditoría propia) |
| SSO institucional | SAML no incluido en el plan gratuito | Se agrega con estrategias Passport (OIDC, SAML, LDAP) | Nativo |
| Revocación remota | Revoca refresh tokens; el access token vive hasta expirar\[12\] | Revocación por sesión o dispositivo en tabla propia | Depende del protocolo |
| Lock-in | Alto (usuarios en `auth.users`, SDK en la app) | Nulo | Bajo si se aísla tras una interfaz |
| Complejidad para un estudiante | Baja al inicio, alta al migrar | Media (patrón muy documentado) | Media-alta; solo cuando la UNSa lo confirme |
| Riesgos | Pausa, retención de logs insuficiente, dos fuentes de verdad (Supabase y Nest) | Errores propios de implementación (mitigables con OWASP ASVS) | Requisitos de red y certificados; IdP fuera de control |

**Recomendación:** auth propia en NestJS ahora, diseñada para federarse después. Supabase puede seguir como hosting de PostgreSQL si el Centro de Cómputos no ofrece un servidor, pero no como proveedor de identidad. Habría que quitar `@supabase/supabase-js` de la app para que el cliente hable solo con el backend.

### 1.3 Arquitectura para cambiar de proveedor de identidad sin tocar la app

- **La app solo conoce el backend.** Usa endpoints `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` y `POST /auth/invitaciones/aceptar`, y siempre recibe *tokens emitidos por el backend propio*.
- **En el backend hay un puerto `IdentityProvider`** con métodos `verificarCredenciales()`, `iniciarFlujoExterno()` y `resolverIdentidadExterna()`. Los adaptadores serían:
  - `LocalPasswordProvider` (ahora).
  - `OidcProvider` (si la UNSa usa Araí u otro IdP OIDC; en la app se usaría `expo-auth-session` con PKCE contra un endpoint broker del backend).
  - `LdapProvider` (si hay AD/LDAP accesible desde el servidor).
  - `SamlProvider` o `CasProvider` como alternativa.
- **Separar identidad y autorización.** La tabla `usuario` guarda el rol, el estado y el vínculo `identidad_externa (proveedor, sujeto)`. Aunque el IdP institucional autentique, **el rol y el estado se deciden en la app de Patrimonio**. Así el cambio de IdP no toca roles ni historial.
- **Tokens.** El access token JWT dura unos 15 minutos y lleva `sub`, `rol`, `sid` (id de sesión) y `ver` (versión de permisos). El refresh token es opaco, aleatorio, se guarda **hasheado** en la tabla `sesion` y rota en cada uso. Si se reutiliza un refresh ya rotado, se revoca toda la familia, igual que hace Supabase.\[2\]\[12\]

### 1.4 Creación, aprobación y estados de cuenta

| Modelo | Ventajas | Desventajas | Encaje con unas 30 personas en una institución |
|---|---|---|---|
| Autorregistro abierto | Sin fricción | Cualquiera con la APK pide acceso; hay que moderar | Malo |
| Autorregistro con aprobación | Poco trabajo para el admin | Cola de solicitudes de desconocidos; enumeración de usuarios | Aceptable solo si el login es institucional |
| **Alta por administrador con invitación** | Control total y trazable; sin desconocidos | El admin trabaja un poco más (30 altas) | **Recomendado** |

**Recomendación:**
- El administrador crea la cuenta con nombre, legajo o DNI, email y rol, y el sistema genera una invitación de un solo uso con vencimiento de 72 h. La invitación se entrega como enlace o como código de 8 a 10 caracteres para transmitir en persona.
- La pantalla de "registro" actual pasa a ser "activar invitación": el usuario define su contraseña y, opcionalmente, su PIN de app.
- Cuando exista login institucional, la invitación vincula la identidad externa en el primer ingreso.

Estados de cuenta propuestos, como máquina de estados registrada en la auditoría:
- `invitada`: creada, sin activar.
- `activa`.
- `suspendida`: no puede iniciar sesión, sus sesiones se revocan y su historial se conserva.
- `baja`: borrado lógico, nunca físico, para conservar la trazabilidad.

Todo cambio de estado o de rol exige un motivo en texto y genera un evento de auditoría. Hay que impedir que el último administrador se quite su propio rol.

**Recuperación de contraseña:**
- Por defecto: el administrador genera un código de restablecimiento de un solo uso, válido 30 minutos y entregado en persona. Es gratis, no requiere correo y queda auditado.
- Si el Centro de Cómputos ofrece SMTP institucional (pendiente UNSa), se agrega el restablecimiento por email siguiendo el Forgot Password Cheat Sheet de OWASP: respuesta genérica sin revelar si el usuario existe, token de un solo uso con vencimiento corto y revocación de las sesiones al cambiar la clave.

**Política de contraseñas (alineada con OWASP y NIST):**
- Mínimo de 15 caracteres si no hay MFA y de 8 si se activa MFA (por ejemplo, TOTP opcional para administradores).
- Máximo de al menos 64 caracteres.
- Sin reglas de composición ni rotación periódica.
- Contraste con una lista de contraseñas comunes empaquetada en el backend.
- Hash con Argon2id.
- Límite de intentos con `@nestjs/throttler` por IP y por usuario, más demora progresiva o bloqueo temporal tras 5 fallos.

**Cierre de sesión remoto:**
- El administrador ve las sesiones (dispositivo, último uso, versión de la app) y puede revocar una o todas.
- Con access tokens de 15 minutos, la revocación tarda como máximo unos 15 minutos en hacer efecto en un dispositivo en línea.
- En un dispositivo sin conexión, la revocación se aplica en el próximo contacto. El backend responde `401 sesion_revocada` y la app borra los tokens.

### 1.5 Login con hasta 2 días sin conexión

La regla clave es que **trabajar sin conexión no exige un token vigente**. Exige una sesión local desbloqueada y una sesión de servidor que siga siendo válida al reconectar.

| Elemento | Valor propuesto | Motivo |
|---|---|---|
| Access token | 15 min | Limita el daño ante robo; la revocación se vuelve casi inmediata en línea |
| Refresh token | 14 días deslizante, 30 días absoluto | Cubre con holgura 2 días offline más fines de semana y feriados |
| Desbloqueo local | Biometría o PIN con `expo-local-authentication`, tras 5 min en segundo plano y en cada arranque en frío | Protege el dispositivo compartido o extraviado |
| Almacenamiento | Refresh token en `expo-secure-store`; access token solo en memoria | Las mejores prácticas de Expo y Supabase coinciden en no usar AsyncStorage para secretos |
| Reautenticación con contraseña | Al vencer el absoluto, tras 5 PIN fallidos o tras cambio de biometría | Evita sesiones eternas |

- Para la biometría conviene un **bloqueo de app** propio, sin poner `requireAuthentication` sobre el refresh token. Ese token se lee en cada arranque, y si se agrega una huella quedaría ilegible y forzaría un nuevo login sin conexión. El PIN propio se guarda como hash con sal en SecureStore.
- **Operaciones hechas offline por una sesión que luego resultó revocada:** no se descartan, para respetar el requisito de no perder versiones. Entran al servidor en estado `en_cuarentena`, quedan visibles en el historial y un administrador las aprueba o rechaza. Así se cubre el caso de un teléfono robado sin perder trabajo legítimo.
- Hay que excluir la base SQLite y SecureStore del backup automático de Android con `configureAndroidBackup` y revisar las reglas de backup.

### 1.6 Qué cambiar del esquema `x-relevador` / `API_KEY`

| Problema actual | Riesgo | Cambio |
|---|---|---|
| `x-relevador` identifica al usuario por una cabecera que el cliente controla | Suplantación trivial: cualquiera escribe el nombre de otro | Identidad tomada solo del JWT verificado (`sub`) |
| `API_KEY` distribuida dentro de la APK | No es secreta: se extrae del bundle | Eliminarla del cliente; si hace falta, usarla solo para procesos máquina a máquina en el servidor (importador, cron) y por variable de entorno |
| Guard global "abierto" con API key opcional | Endpoints accesibles por omisión | Guard global de autenticación con denegación por defecto, `@Public()` explícito solo en `/auth/login`, `/auth/refresh`, `/health` y la aceptación de invitaciones, y guard de roles (`administrador`, `relevador`) |
| RLS habilitado en una migración, con el backend conectado como superusuario o propietario | Si el backend usa un rol que hace bypass de RLS, la RLS no protege nada | Decidir en un ADR: o RLS real con `SET LOCAL` del usuario en cada transacción, o RLS solo como defensa ante accesos directos con un rol de app sin privilegios de propietario |

---

## 2. Historial y auditoría

### 2.1 Comparativa de mecanismos

| Mecanismo | Qué captura bien | Qué no captura | Veredicto |
|---|---|---|---|
| Tabla de auditoría de aplicación (NestJS) | Intención y contexto: quién, rol, dispositivo, sesión, hora del dispositivo, motivo, login y logout, intentos fallidos, exportaciones | Cambios hechos fuera de la app (psql, migraciones) | **Fuente principal** |
| Triggers de PostgreSQL | Cualquier `INSERT/UPDATE/DELETE`, con valores antes y después, aunque no pase por la app | Eventos sin escritura (login fallido, exportación descargada, lectura); el usuario de la app solo si se pasa con `set_config` | **Red de seguridad** sobre `bien`, `codigo_bien`, `relevamiento`, `usuario` |
| Logs de Auth de Supabase | Eventos de su propio Auth | Retención de 1 hora en el plan gratuito; no sirve si la auth es propia | **Descartado** |

**Recomendación:** ambos mecanismos. La tabla `evento_auditoria` la escribe la app en **la misma transacción** que el cambio de negocio, y los triggers alimentan `cambio_fila`. Para que los triggers sepan quién actuó, el backend ejecuta `SELECT set_config('app.usuario_id', $1, true)` al inicio de cada transacción de Prisma, y el trigger lo lee con `current_setting('app.usuario_id', true)`.

### 2.2 Esquema sugerido

`evento_auditoria` (append-only):
- `id` (UUID v7, ordenable), `tipo` (`CUENTA_CREADA`, `INVITACION_ACEPTADA`, `LOGIN_OK`, `LOGIN_FALLIDO`, `LOGOUT`, `SESION_REVOCADA`, `ROL_CAMBIADO`, `ESTADO_CUENTA_CAMBIADO`, `BIEN_CREADO`, `BIEN_EDITADO`, `RELEVAMIENTO_REGISTRADO`, `EXPORTACION_GENERADA`, `CONFLICTO_DETECTADO`, `OPERACION_CUARENTENA`, etc.)
- `actor_usuario_id` (nullable en un login fallido con usuario inexistente), `actor_rol`, `sesion_id`, `dispositivo_id`
- `entidad_tipo`, `entidad_id`, `operacion_cliente_id` (el UUID idempotente del cliente)
- `hora_dispositivo` (timestamptz declarado por el cliente), `tz_dispositivo` (offset), `hora_servidor_recepcion` (`now()` al recibir), `desfase_estimado_ms`, `secuencia_dispositivo` (contador monotónico local)
- `resultado` (`ok`, `rechazado`, `cuarentena`), `motivo` (texto libre obligatorio en cambios de rol o estado)
- `datos` (JSONB: diff o resumen; **nunca** contraseñas ni tokens), `ip`, `user_agent`, `version_app`
- `hash_previo`, `hash` (opcional: cadena de hashes para detectar manipulación)

`historial_cambio` (ya existe): se mantiene como historial de **versiones** de cada bien, con la versión completa, la versión padre y la marca de conflicto, y se enlaza con `evento_auditoria.id`.

Las **exportaciones** se registran en `exportacion` (filtros usados, cantidad de filas, formato, hash SHA-256 del archivo) y además en un evento `EXPORTACION_GENERADA`.

### 2.3 Inmutabilidad, retención y acceso

- **Inmutable:** `evento_auditoria`, `cambio_fila` e `historial_cambio`.
  - El rol de base de datos de la app recibe solo `INSERT` y `SELECT`, con `REVOKE UPDATE, DELETE`.
  - Un trigger `BEFORE UPDATE OR DELETE` lanza una excepción como segunda barrera.
  - Las correcciones se registran como eventos nuevos que referencian al anterior.
- **Retención (recomendación provisoria, a validar con la Dirección de Patrimonio y con el área legal de la UNSa):**
  - Eventos sobre bienes, relevamientos y exportaciones: sin borrado mientras exista el sistema.
  - Eventos de sesión e intentos fallidos: 2 años y luego archivado en CSV comprimido.
  - Es posible que exista una norma de conservación documental aplicable, pero no se verificó.
- **Quién consulta:**
  - El administrador ve todo.
  - El relevador ve su propia actividad y el historial de los bienes que puede ver.
  - Nadie puede editar.
  - Las consultas al log de auditoría también se auditan, de forma resumida.
- **En la app:**
  - Pestaña "Historial" en la ficha del bien: línea de tiempo con quién, qué cambió (diff legible), hora del dispositivo, hora del servidor, una insignia de "registrado sin conexión" y otra de "conflicto" si corresponde.
  - Pantalla "Actividad" solo para el administrador, con filtros por usuario, tipo, fecha y dispositivo, y exportación a CSV.

### 2.4 Relojes desfasados sin conexión

1. En cada sincronización, el cliente envía `ahora_dispositivo`. El servidor calcula `desfase = hora_servidor - ahora_dispositivo` (corregido por la mitad del tiempo de ida y vuelta) y lo devuelve. La app guarda el último desfase conocido.
2. Cada operación offline guarda su `hora_dispositivo`, la `secuencia_dispositivo` y el `desfase_estimado` del momento.
3. Al recibir, el servidor guarda `hora_servidor_recepcion` y una hora corregida estimada. Si el desfase supera los 5 minutos, marca el evento con `reloj_sospechoso`.
4. **Hora autoritativa para ordenar:** la secuencia del dispositivo, dentro del mismo dispositivo, y la hora del servidor, entre dispositivos. La hora del dispositivo se muestra siempre, pero nunca decide sola un conflicto.
5. Los conflictos (dos versiones del mismo bien con el mismo padre) se guardan ambas en el historial. El bien queda en estado `con_conflicto` hasta que un administrador elige o fusiona versiones, y esa decisión también es un evento.

---

## 3. Acceso en línea a datos de Patrimonio / SIU-Diaguita

### 3.1 Lo verificado en la documentación oficial del SIU

- **Existe una API REST de SIU-Diaguita, versionada.**
  - La página oficial de SIU-Diaguita relaciona Diaguita 4.3.0 con la API 1.4, 4.2.0 con 1.3, 4.1.0 con 1.2, 4.0.0 con 1.1 y 3.6.0 con 1.0. La página fue editada el 11 de agosto de 2026.\[13\]
  - En el Foro Comunidad SIU («Versionado explicito de API rest obligatorio a partir de SIU-Diaguita 3.2.0»), el SIU indicó que los clientes que usaban `universidad.edu.ar/diaguita/rest` «deberían cambiar a universidad.edu.ar/diaguita/rest/v1».
- **Habilitación y autenticación.**
  - Para que otros sistemas consuman servicios de Diaguita se configura `instalacion/i__produccion/p__diaguita/rest/servidor.ini` (por ejemplo, `autenticacion = digest`, `formato_respuesta = json`) y los usuarios en `servidor_usuarios.ini`.\[14\]
  - El framework SIU-Toba admite digest o basic, y también SSL con fingerprint.\[15\]
  - Hay integraciones oficiales (Expedientes y Huarpe) que consumen la API de Diaguita con basic.\[16\]
  - Todo sistema SIU con REST expone una consola de prueba en `http://direccion-web-sistema-siu/rest`. \[17\]
- **Hay datos de bienes en la API, aunque las rutas no son públicas.**
  - El bundle "Bienes patrimoniales" de SIU-Huarpe requiere "Acceso a la API de SIU-Diaguita" y ofrece "Listado con todos los bienes a cargo del usuario logeado" y "Detalle de bienes".\[18\]
  - La App Colector oficial incorpora desde la versión 1.2 un servicio de verificación que obtiene datos de los bienes al escanear sus etiquetas, autenticado con JWT. El acceso se obtiene escaneando un QR generado en Diaguita y dura 7 días. Se configura con `autenticacion = digest,jwt` y una sección `[jwt]` en `servidor.ini`.\[19\]
  - El boletín InfoSIU n.º 104 (abril de 2018) anunció, junto con Diaguita 2.5.0, un «nuevo servicio REST bienes patrimoniales» para el «acceso a información de los bienes patrimoniales desde la App Colector SIU-Diaguita».
- **No confirmado:** los nombres exactos de los endpoints de bienes (por ejemplo, `/bienes/{numero}`) y si la API admite usuarios de **solo lectura**. En el hilo «Perfil funcional para API REST» del Foro Comunidad SIU, un usuario plantea que `servidor_usuarios.ini` define quién accede, pero que «el tema está en cómo restringir ciertos usuarios (…evitar que pueda hacer cualquier tipo de POST)». Guaraní sí tiene permisos por recurso documentados; para Diaguita no se encontró un equivalente.\[20\]
- **Precedente de lectura directa de la base:** SIU-Wichi documenta un cubo "Bienes Patrimoniales" con dimensiones como número patrimonial, número anterior, ubicación física, área responsable, estado del bien y responsable de uso, además de "Vistas de Información de Patrimonio".\[21\] Según la guía técnica de Wichi 5.5.0, su ETL de Diaguita hace extracción directa sobre la base de Diaguita.\[22\]
- **Existe una app oficial similar:** la App Colector SIU-Diaguita (Google Play, versión 1.3). Relevan por ubicación física, guardan los códigos NUI, exportan archivos de texto plano y esos archivos se cargan en Diaguita en Patrimonio, Colector de Datos.\[19\]
  - Esto importa para el portfolio y para la UNSa: el proyecto debe justificar qué agrega (alta de bienes sin código, historial con conflictos, trazabilidad de usuarios, exportaciones, offline multiusuario).
  - Conviene evaluar la exportación en el formato que acepta el Colector de Datos. El formato exacto no se verificó y queda pendiente.

### 3.2 Alternativas ordenadas por viabilidad a largo plazo

| # | Opción | Infraestructura y permisos a pedir | Seguridad de red | Frescura | Fragilidad | Viabilidad |
|---|---|---|---|---|---|---|
| 1 | **(a) API REST oficial de Diaguita** | Usuario de API en `servidor_usuarios.ini`; habilitar el recurso de bienes; versión de Diaguita y de la API; documentación de endpoints (consola `/rest`) | El backend propio debe alcanzar la URL de Diaguita: misma red, VPN o lista de IP permitidas; siempre HTTPS | Tiempo real o con caché de minutos | Baja: contrato versionado por el SIU | **Alta**, si la UNSa la habilita |
| 2 | **(c) Exportaciones periódicas Excel/CSV** (importador existente) | Que Patrimonio exporte con una frecuencia acordada, o un job programado del Centro de Cómputos que deje el archivo en una carpeta compartida | No requiere conectividad entre sistemas | Horas o días | Media: cambian columnas, pero se detecta con validación de cabeceras | **Alta e inmediata**; queda como respaldo permanente |
| 3 | **(b) Usuario de solo lectura en PostgreSQL de Diaguita con vistas dedicadas** | Rol `GRANT SELECT` solo sobre vistas en un esquema propio; acuerdo de mantenimiento al actualizar Diaguita | El backend debe estar en la red de la UNSa o por VPN; nunca exponer el puerto 5432 a Internet | Tiempo real | Media-alta: el esquema interno puede cambiar entre versiones, aunque las vistas lo amortiguan | **Media**: Wichi lo hace, pero los Centros de Cómputos suelen ser reacios |
| 4 | **(d) Scraping de la interfaz Toba** | Credenciales de un usuario humano de Diaguita en el backend | Igual que (a); además, credenciales con permisos de interfaz completos | Tiempo real | **Alta**: cambian ids, eventos, sesión o CSRF de Toba con cada versión | **Baja**; último recurso, siempre detrás de la interfaz |

**Recomendación:** desarrollar ya contra (c), con el importador existente, mientras se gestiona (a). El adaptador de scraping solo debería mantenerse si la UNSa rechaza (a) y (b), y con pruebas sobre fixtures que fallen ruidosamente.

### 3.3 Preguntas concretas para el Centro de Cómputos / SIU de la UNSa

1. ¿Qué versión de SIU-Diaguita está en producción y qué versión de API expone (1.0 a 1.4)?
2. ¿Está habilitado el REST de Diaguita (`/diaguita/rest/v1/`)? ¿Pueden crear un usuario de API exclusivo para esta app? ¿Con digest o basic? ¿Pueden limitarlo a operaciones GET o a recursos de patrimonio?
3. ¿Qué recursos de bienes expone su instalación (consola `/rest`)? ¿Usan el bundle de Patrimonio de Huarpe o la verificación de la App Colector?
4. ¿Dónde podría alojarse el backend: un servidor o una VM dentro de la red de la UNSa, o en la nube con VPN o lista de IP? ¿Hay un proxy inverso con HTTPS y un dominio institucional disponible?
5. Si la API no fuera posible, ¿aceptarían crear vistas de solo lectura y un rol PostgreSQL dedicado, como hace Wichi?
6. ¿Pueden programar una exportación periódica de bienes (CSV/Excel) a una ubicación accesible por el backend? ¿Con qué frecuencia?
7. ¿Qué sistema gestiona las cuentas web institucionales: SIU-Araí (SAML/OIDC), Active Directory/LDAP, CAS u otro? ¿Permitirían registrar esta app como cliente o service provider?
8. ¿Hay SMTP institucional para correos transaccionales (invitaciones y recuperación de contraseña)?
9. ¿Existe una política de seguridad o de retención de registros que la app deba cumplir?
10. ¿El área de Patrimonio usa hoy la App Colector oficial? ¿Qué formato de archivo acepta Patrimonio, Colector de Datos?

### 3.4 Capa de abstracción en el backend

- **Puerto `FuentePatrimonio`** (en `backend/src/patrimonio/fuente/`), con estos métodos:
  - `buscarPorCodigo(codigo): BienExterno | null`
  - `buscar(filtro): Pagina<BienExterno>`
  - `listarPorUbicacion(id)`
  - `salud(): { disponible, latenciaMs, version }`
  - `ultimaActualizacion(): Date`
- **Adaptadores:** `SiuRestFuente`, `SiuVistasDbFuente`, `ImportacionArchivoFuente` (el `siu-excel.ts` actual) y `TobaScraperFuente` (código existente movido de `backend/src/siu/`). Cada uno mapea a un modelo canónico `BienExterno` definido en `shared/`, con un campo `origen` y `obtenido_en`.
- **Selección por configuración**, sin tocar código: `PATRIMONIO_FUENTE=siu_rest,archivo`, en orden de preferencia. Un `FuenteCompuesta` intenta en orden y usa la siguiente si falla.
- **Caché y caída elegante:**
  - Tabla `bien_externo_cache` con `codigo`, `payload` (JSONB), `origen`, `obtenido_en` y `ttl`.
  - En línea: caché de lectura con TTL de unos 15 minutos para la ficha y *stale-while-revalidate*. Si la fuente falla, se devuelve el dato en caché con `desactualizado: true`.
  - Un circuit breaker evita martillar a SIU: tras N fallos se abre y deja de llamar durante unos minutos.
  - La app nunca habla con SIU. Siempre recibe del backend `{ datos, origen, obtenido_en, desactualizado }` y lo muestra, por ejemplo: "Datos de SIU al 21/10 14:05 (exportación)".
  - En el dispositivo, la réplica local en SQLite del catálogo (o del subconjunto de ubicaciones asignadas) permite consultar sin conexión.
- **Solo lectura garantizada:** el puerto no tiene métodos de escritura y el usuario de API o de base de datos se pide sin permisos de escritura. Las credenciales van solo en variables de entorno del backend.

---

## 4. Mejoras de la app (planificación)

### 4.1 Base técnica verificada

- **Cámara:**
  - `expo-camera` (`CameraView`) acepta `barcodeScannerSettings.barcodeTypes` y la prop `enableTorch`.\[23\]\[24\]
  - Restringir las simbologías a las que realmente usan las etiquetas de la UNSa (pendiente: confirmar con Patrimonio si son Code128, Code39, QR u otras) reduce lecturas falsas y mejora el rendimiento.
  - La tabla de funciones de la comparativa «Choosing a React Native barcode scanner: react-native-vision-camera vs. expo-camera», publicada por Scanbot (proveedor comercial, así que hay que leerla con cautela), marca a expo-camera sin autofocus en Android.
- **Accesibilidad (Material Design y Android):** objetivos táctiles de al menos 48x48 dp con al menos 8 dp de separación, contraste de 4.5:1 para texto y de 3:1 para íconos.\[25\]\[26\]\[27\]

### 4.2 Mejoras propuestas

- **Ficha del bien:**
  - Encabezado con número patrimonial grande y copiable, descripción y un chip de estado (activo, de baja, con conflicto, pendiente de sincronizar, sin código).
  - Secciones colapsables: ubicación y responsable, datos de SIU (con origen y fecha), último relevamiento e historial en línea de tiempo.
  - Acciones primarias: "Registrar relevamiento" y "Editar".
- **Flujo de escaneo:**
  - Visor con recuadro guía, linterna y cambio de modo.
  - Al leer: vibración corta con `expo-haptics` más un sonido opcional, y una tarjeta inferior (bottom sheet) con un resumen del bien y un botón de confirmar, sin navegar fuera de la cámara.
  - Ante lecturas repetidas se aplica un *debounce* por código (2 s).
  - Si el código no existe, se ofrecen "Buscar manualmente" y "Dar de alta".
- **Escaneo continuo por lotes:** se elige una ubicación física y se escanea en ráfaga. La lista acumulada muestra un contador y marca los duplicados, y al cerrar el lote aparece un resumen de encontrados, no encontrados y faltantes respecto del esperado para la ubicación. Es el mismo concepto de inventario por ubicación que el Colector oficial.
- **Modo offline visible:**
  - Indicador persistente en la barra: "En línea", "Sin conexión" o "Sincronizando N".
  - Pantalla "Pendientes" con la cola de salida y el estado de cada operación (pendiente, enviada, confirmada, rechazada, cuarentena), con reintento manual.
  - Pantalla "Conflictos" con comparación lado a lado, solo resoluble por el administrador.
  - Fecha de la última sincronización y antigüedad del catálogo local.
- **Búsqueda manual:** por número patrimonial, número anterior, descripción o ubicación. Usa FTS de SQLite offline y la búsqueda del servidor en línea.
- **Alta de bien sin código o con código dañado:** con foto opcional, número provisorio interno con UUID y un flujo para vincular el código definitivo cuando se reetiquete.
- **Filtros y exportación:** filtros guardados por ubicación, estado, fecha y relevador. La exportación a CSV/PDF se genera en el backend cuando hay conexión y en el dispositivo cuando no, con registro de auditoría en ambos casos.
- **Accesibilidad:**
  - `accessibilityLabel` en todos los botones de ícono y textos escalables (respetar el tamaño de fuente del sistema).
  - Estados comunicados con texto además de color.
  - Anuncio por TalkBack del resultado del escaneo.
  - Probar con TalkBack y con la fuente al 200%.

### 4.3 Matriz impacto/esfuerzo

| Funcionalidad | Impacto | Esfuerzo | Cuadrante |
|---|---|---|---|
| Auth propia, roles y guard con denegación por defecto | Alto | Medio | Hacer ya |
| SQLite local, cola de salida y sync idempotente | Muy alto | Alto | Hacer ya (núcleo) |
| Indicador offline y pantalla de pendientes | Alto | Bajo | Victoria rápida |
| Feedback háptico/sonoro, linterna y debounce | Medio | Bajo | Victoria rápida |
| Ficha del bien con historial | Alto | Medio | Hacer ya |
| Búsqueda manual | Alto | Bajo-medio | Victoria rápida |
| Escaneo por lotes por ubicación | Alto | Medio | Siguiente |
| Resolución de conflictos (admin) | Alto | Medio-alto | Siguiente |
| Exportación CSV/PDF auditada | Alto | Medio | Siguiente |
| Adaptador SIU REST | Muy alto | Medio (depende de la UNSa) | Cuando la UNSa responda |
| Export compatible con el Colector de Datos de Diaguita | Medio-alto | Bajo-medio | Cuando se confirme el formato |
| Modo oscuro | Medio (portfolio) | Bajo si hay tokens | Victoria rápida tras el sistema de diseño |
| Login institucional (OIDC/LDAP) | Medio-alto | Alto | Futuro |
| Fotos de bienes y almacenamiento | Medio | Medio-alto (costos de storage) | Futuro |
| Versión iOS | Medio | Medio | Futuro |
| Dashboard web de administración | Medio | Alto | Futuro |

### 4.4 Roadmap por fases (una persona, a tiempo parcial)

Las duraciones son estimaciones propias para un estudiante a tiempo parcial y conviene revisarlas al cerrar cada fase.

| Fase | Contenido | Duración orientativa | Criterio de salida |
|---|---|---|---|
| 0. Cimientos | Estructura de `docs/`, ADR 0001 a 0006, consultas enviadas a la UNSa, CI con lint y tests | 1-2 semanas | ADR aceptados; preguntas enviadas |
| 1. Seguridad | Auth propia, invitaciones, estados, roles, sesiones, `evento_auditoria` append-only, eliminación de `x-relevador` y `API_KEY` | 3-4 semanas | Pruebas e2e de login, refresh, revocación y roles |
| 2. Núcleo offline | expo-sqlite, catálogo local, outbox con UUID, endpoint `/sync` idempotente, conflictos al historial, manejo de relojes | 4-6 semanas | Prueba de campo de 48 h en modo avión sin pérdida de datos |
| 3. UX de campo | Escaneo mejorado, ficha, búsqueda, lotes, indicador offline, accesibilidad | 3-4 semanas | Prueba de usabilidad con 3-5 relevadores reales |
| 4. Gestión | Alta y edición con historial, resolución de conflictos, exportaciones, pantalla de actividad | 3-4 semanas | Patrimonio valida los reportes |
| 5. Integración SIU | Puerto `FuentePatrimonio`, adaptador de archivo y adaptador REST (si se habilita), caché | 2-4 semanas | Cambio de fuente solo por configuración |
| 6. Entrega | Runbook, guía de traspaso, release Android, caso de estudio | 2 semanas | Otra persona levanta el entorno siguiendo solo la guía |

---

## 5. Diseño en Figma para el portfolio

### 5.1 Lo verificado sobre Figma

- **Code Connect** admite React y React Native, pero según el repositorio figma/code-connect «is available on Organization and Enterprise plans and requires a full Design or Dev Mode seat to use» (la guía de Code Connect UI de Figma menciona también el plan Professional, una discrepancia a verificar). No es viable sin presupuesto.
- **Figma MCP server:**
  - El servidor remoto funciona en todos los planes. En Starter (gratuito) el límite es de 20 llamadas por mes.\[28\]\[29\]
  - Los asientos Full o Dev del plan Professional tienen 200 por día, y el plan Education tiene los mismos límites que Professional.\[28\]\[29\]\[30\]
  - Escribir en el canvas es gratuito durante la beta y luego será pago por uso.\[29\]\[31\]
  - El servidor de escritorio requiere un asiento Dev o Full en un plan pago o Education.\[32\]\[33\]
- **Recomendación:** solicitar el plan Education de Figma si el autor es elegible como estudiante (pendiente: verificar la elegibilidad).

### 5.2 Estructura del archivo

Páginas sugeridas:
1. **Portada:** nombre, versión y estado.
2. **Léeme:** convenciones y enlace al repositorio.
3. **Fundamentos:** colecciones de variables en tres niveles.
   - `primitivos`: paleta, espaciado de 4 dp, radios, tipografía.
   - `semánticos`: `color/superficie`, `color/texto/primario`, `color/estado/conflicto`, `color/estado/offline`, con modos **Claro** y **Oscuro**.
   - `componente`: solo si hace falta.
4. **Componentes:** con variantes y propiedades, por ejemplo:
   - Botón (relleno, tonal, contorno, texto × habilitado, deshabilitado, cargando).
   - Chip de estado del bien.
   - Tarjeta de bien.
   - Fila de lista.
   - Barra de estado de sincronización.
   - Bottom sheet de escaneo.
   - Campo de texto con error.
   - Banner offline.
   - Diálogo de conflicto.
   - Elemento de línea de tiempo.
5. **Patrones:** formularios, listas con filtros, estados vacíos, de error, de carga, offline y sin permisos de cámara.
6. **Pantallas:** por flujo (autenticación, escaneo, ficha, lote, pendientes, conflictos, administración), cada una en claro y oscuro.
7. **Flujos:** diagramas de flujo con conectores (activar invitación, escanear y relevar, sincronizar y resolver conflicto).
8. **Prototipo:** flujo principal navegable para mostrar en el portfolio.
9. **Handoff:** tabla de tokens y su nombre en el código, y especificaciones de accesibilidad.
10. **Archivo:** exploraciones descartadas, útiles para contar el proceso.

Buenas prácticas de Material Design 3 y Android:
- Usar el kit oficial de Material 3 de la comunidad de Figma como base y personalizar los roles de color.
- Objetivos táctiles de 48 dp.\[26\]
- Navegación inferior con 3 a 5 destinos (Escanear, Buscar, Pendientes, Perfil, y Admin si corresponde).
- FAB para la acción principal.
- Respetar la barra de gestos y el área segura.
- Verificar los contrastes de 4.5:1 y 3:1 en ambos modos.\[25\]\[27\]

### 5.3 Coherencia entre Figma y código sin pagar

- **Fuente única de tokens en el repositorio:** `shared/design-tokens/tokens.json`, con la misma nomenclatura que las variables de Figma. A partir de ese archivo se generan `theme.ts` para React Native con un script o con Style Dictionary (software libre).
  - Si se usa React Native Paper (que implementa Material 3), el tema se construye desde esos tokens.
  - Las variables de Figma se actualizan a mano o con un plugin gratuito de importación y exportación de variables. Hay que registrar en un ADR cuál es la fuente de verdad (recomendado: el JSON del repositorio).
- **Paridad de componentes:** cada componente de Figma tiene un componente homónimo en `app/src/ui/` con las mismas propiedades y variantes. Un `docs/diseno/componentes.md` mapea nombre de Figma, archivo de código y propiedades.
- **MCP:** usarlo con moderación (20 llamadas por mes en Starter) para que un agente lea un frame y proponga código.\[29\] No es indispensable.
- **Revisión visual:** capturas de las pantallas reales junto al frame de Figma en cada PR de UI.

### 5.4 Caso de estudio para el portfolio

1. **Contexto y problema:** relevamiento patrimonial en una universidad pública; datos en SIU-Diaguita; trabajo en edificios sin señal.
2. **Usuarios:** relevadores en campo y administradores de Patrimonio, con entrevistas breves y observación de un relevamiento.
3. **Restricciones:** costo cero, offline de 2 días, solo lectura sobre SIU, mantenimiento por terceros.
4. **Proceso:** mapa del flujo actual, comparación con la App Colector oficial y qué aporta este proyecto, iteraciones de baja y alta fidelidad.
5. **Decisiones clave:** enlaces a los ADR (auth propia, outbox con UUID, conflictos que no descartan, puerto de fuente SIU), cada una con alternativas y trade-offs.
6. **Diseño visual y sistema:** tokens, modos claro y oscuro, accesibilidad.
7. **Resultados:** métricas medidas en la prueba de campo (tiempo por bien relevado, errores de lectura, operaciones offline sin pérdida). No inventar métricas: medirlas.
8. **Aprendizajes y próximos pasos:** extractos de la bitácora.

---

## 6. Documentación paso a paso (`docs/`)

```
docs/
  README.md                  # índice y mapa de lectura para el próximo mantenedor
  00-inicio/
    puesta-en-marcha.md      # requisitos, clonar, .env.example, docker compose, migraciones, seed, correr app (dev build)
    glosario.md              # NUI, número patrimonial, relevamiento, ubicación física, etc.
  01-arquitectura/
    c4-contexto.md           # Mermaid C4Context: relevador, admin, app, backend, SIU-Diaguita, IdP
    c4-contenedores.md       # app Expo, API NestJS, PostgreSQL, fuente SIU
    secuencias/              # login+refresh, sync offline, conflicto, consulta SIU con caché
    modelo-datos.md          # Mermaid erDiagram generado/actualizado desde schema.prisma
  02-decisiones/             # ADR en formato MADR
    0000-usar-madr.md
    0001-autenticacion-propia-con-idp-intercambiable.md
    0002-alta-por-invitacion.md
    0003-outbox-uuid-y-conflictos-sin-descarte.md
    0004-auditoria-append-only-app-mas-triggers.md
    0005-fuente-patrimonio-intercambiable.md
    0006-tokens-de-diseno-fuente-de-verdad.md
    plantilla.md
  03-api/
    openapi.json             # generado por @nestjs/swagger en CI
    convenciones.md          # errores, paginación, idempotencia (Idempotency-Key / UUID)
  04-operacion/
    runbook.md               # despliegue, backups, restauración, rotar secretos, revocar sesiones, reimportar catálogo, qué hacer si SIU no responde
    seguridad.md             # modelo de amenazas breve, gestión de secretos
  05-diseno/
    figma.md                 # enlace al archivo, estructura, mapping de componentes
    accesibilidad.md
  06-bitacora/
    2026-10.md               # diario por mes: qué hice, qué aprendí, bloqueos, decisiones abiertas
  07-traspaso/
    guia-de-traspaso.md      # checklist para el próximo mantenedor, contactos institucionales (roles, no datos personales)
  consultas-unsa.md          # preguntas enviadas, respuestas, fecha y quién respondió
```

- **ADR:** usar MADR 4.0.0 (publicado el 17 de septiembre de 2024), que ofrece plantillas completa, mínima y "bare".\[34\]\[35\] Los campos mínimos recomendados son título, estado (propuesto, aceptado, reemplazado por N), fecha, decisores, contexto, impulsores, opciones consideradas, decisión, consecuencias y "Más información" (enlaces a PR y commits).\[36\] Una decisión aceptada nunca se edita; se reemplaza con otro ADR.
- **Bitácora:** una entrada por sesión de trabajo, en 5 líneas: objetivo, qué se hizo, qué se aprendió (con enlace a la fuente), problema o bloqueo, próximo paso. Al cerrar cada fase se agrega una retrospectiva de una página, que es la materia prima del caso de estudio.
- **Diagramas:** Mermaid dentro del Markdown (GitHub lo renderiza) para C4, secuencia y ER. El ER se regenera desde `schema.prisma` con un script o generador y se verifica en CI que esté al día.
- **API:** `@nestjs/swagger` con decoradores en los DTO; el CI exporta `openapi.json` y falla si hay cambios sin commitear. Swagger UI en `/docs` solo en desarrollo.
- **Enlace entre commits, PR y decisiones:**
  - Conventional Commits (`feat(sync): ...`).
  - Plantilla de PR con los campos "ADR relacionado: 0003", "Issue: #12" y "Cómo probar".
  - Cada ADR enlaza los PR que lo implementan.
  - GitHub Projects (gratuito) como tablero del roadmap.
- **Herramientas gratuitas:** Mermaid, MADR, `@nestjs/swagger`, GitHub Projects, Issues y Discussions, Docusaurus o MkDocs (opcional, publicable en GitHub Pages), Style Dictionary, markdownlint.

---

## 7. Cierre

### 7.1 Decisiones a tomar o consultar, en orden

| # | Decisión | Con quién | Bloquea |
|---|---|---|---|
| 1 | Dónde se hospeda el backend y la base (servidor UNSa vs Supabase gratuito vs otro) y si habrá HTTPS con dominio institucional | Centro de Cómputos | Integración SIU, disponibilidad |
| 2 | Habilitar un usuario de la API REST de Diaguita y confirmar versión y endpoints de bienes | Centro de Cómputos / referente técnico SIU de la UNSa | Opción (a) |
| 3 | Plan B: vistas de solo lectura o exportación programada | Centro de Cómputos y Dirección de Patrimonio | Frescura de datos |
| 4 | Protocolo de identidad institucional (Araí, LDAP/AD, CAS) y si se permite federar | Centro de Cómputos | Fase futura de login |
| 5 | Modelo de alta de cuentas (invitación) y quiénes son administradores | Dirección de Patrimonio | Fase 1 |
| 6 | SMTP institucional para invitaciones y recuperación | Centro de Cómputos | Recuperación por email |
| 7 | Simbologías y formato de las etiquetas | Dirección de Patrimonio | Configuración de la cámara |
| 8 | Retención de auditoría y normativa aplicable | Dirección de Patrimonio y área legal | Política de retención |
| 9 | Si se exporta en el formato del Colector de Datos de Diaguita | Dirección de Patrimonio | Exportaciones |
| 10 | Licencia del código y permiso para mostrar el proyecto en el portfolio (capturas sin datos reales) | Dirección de Patrimonio y cátedra o tutor | Portfolio |

### 7.2 Orden recomendado de trabajo

Fase 0 de cimientos y consultas, después la fase 1 de seguridad y auditoría, la fase 2 del núcleo offline, la fase 3 de UX de campo, la fase 4 de gestión y exportación, la fase 5 de integración SIU vía adaptadores y la fase 6 de entrega y caso de estudio. El diseño en Figma (fundamentos y componentes) corre en paralelo desde la fase 0 y debe estar listo antes de la fase 3.

### 7.3 Riesgos principales

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| La UNSa no habilita la API ni la base de SIU | Media | Alto | Exportaciones periódicas como camino garantizado; puerto de fuente intercambiable |
| Pausa del proyecto Supabase gratuito por inactividad (recesos) | Media | Alto | Preferir un servidor de la UNSa; si se usa Supabase, monitoreo y procedimiento de restauración en el runbook (la base no debe depender de un ping artificial)\[37\] |
| Pérdida o duplicación de datos en la sincronización | Media | Muy alto | UUID idempotente, outbox transaccional, conflictos al historial, prueba de campo de 48 h |
| Dispositivo robado con sesión activa | Baja-media | Alto | Bloqueo biométrico o PIN, revocación remota, cuarentena de operaciones |
| Fragilidad del scraping de Toba | Alta (si se usa) | Alto | Solo como último recurso; fixtures y alertas |
| Mantenedor futuro sin contexto | Alta | Alto | ADR, runbook, guía de traspaso, `.env.example`, puesta en marcha probada por un tercero |
| Alcance excesivo para una sola persona | Alta | Medio | Roadmap por fases con criterios de salida; posponer iOS, login institucional y fotos |
| Duplicar la App Colector oficial sin valor diferencial | Media | Medio | Explicitar en el caso de estudio y en el ADR qué agrega el proyecto |
| Versiones muy nuevas (Expo SDK 57, NestJS 12, Prisma 7, TypeScript 6) con documentación de terceros desactualizada | Media | Medio | Priorizar la documentación oficial versionada; fijar versiones exactas en el lockfile |

### 7.4 Caveats

- No se pudo consultar la especificación Swagger pública de la API de Diaguita, así que los endpoints concretos de bienes quedan **pendientes**.
- Todo lo relativo a la infraestructura de la UNSa (versión de Diaguita, IdP, red, SMTP, servidores) es **pendiente de confirmar**.
- Las cifras de planes de Supabase y Figma corresponden a sus páginas oficiales consultadas en octubre de 2026 y pueden cambiar. Hay que revisarlas antes de decidir el hosting.

## Fuentes

1. [Pricing & Fees](https://supabase.com/pricing)
2. [User sessions](https://supabase.com/docs/guides/auth/sessions)
3. [Supabase CLI config](https://supabase.com/docs/guides/local-development/cli/config)
4. [JavaScript: refreshSession](https://supabase.com/docs/reference/javascript/auth-refreshsession)
5. [Authorization](https://docs.nestjs.com/security/authorization)
6. [Introducción · SIU-Araí: Usuarios](https://documentacion.siu.edu.ar/usuarios/docs/intro/)
7. [Uso de la API para interoperabilidad · SIU-Araí: Usuarios](https://documentacion.siu.edu.ar/usuarios/docs/cache/guia-uso-api/)
8. [Authentication - OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
9. [Securely Store Tokens in Expo (expo-secure-store Guide) · DeveloperMill](https://developermill.com/blog/expo-secure-store-guide)
10. [SecureStore - Expo documentation](https://docs.expo.dev/versions/latest/sdk/securestore/)
11. [expo/docs/pages/versions/unversioned/sdk/securestore.mdx at main · expo/expo · GitHub](https://github.com/expo/expo/blob/main/docs/pages/versions/unversioned/sdk/securestore.mdx)
12. [GitHub - supabase/auth: A JWT based API for managing users and issuing JWT tokens · GitHub](https://github.com/supabase/auth)
13. [SIU-Diaguita - SIU](https://documentacion.siu.edu.ar/wiki/SIU-Diaguita)
14. [SIU-Diaguita/version2.6.0/consideraciones tecnicas - SIU](https://documentacion.siu.edu.ar/wiki/SIU-Diaguita/version2.6.0/consideraciones_tecnicas)
15. [API Rest · SIU-Toba](https://documentacion.siu.edu.ar/toba/docs/referencia-rest/)
16. [SIU-Diaguita](https://expedientes.siu.edu.ar/docs/1.2.0/diaguita)
17. [SIU-Diaguita/version3.6.0/post instalacion - SIU](https://documentacion.siu.edu.ar/wiki/SIU-Diaguita/version3.6.0/post_instalacion)
18. [Bienes patrimoniales · SIU-Huarpe](https://documentacion.siu.edu.ar/huarpe/docs/servicios/bundle-patrimonio/)
19. [SIU-Diaguita/appcolector - SIU](https://documentacion.siu.edu.ar/wiki/SIU-Diaguita/appcolector)
20. [Acceso a documentación Apis - SIU-Guaraní - Técnicos - Foro Comunidad SIU](https://foro.comunidad.siu.edu.ar/t/acceso-a-documentacion-apis/24447)
21. [SIU-Wichi/Version6.6.0/Documentacion Diaguita - SIU](https://documentacion.siu.edu.ar/wiki/SIU-Wichi/Version6.6.0/Documentacion_Diaguita)
22. [Guía Técnica SIUWichi 5.5.0 Fecha actualización: 20/05/2016 Contenido](https://documentacion.siu.edu.ar/wiki/images/6/66/WICHI_guia_tecnica_550.pdf)
23. [Camera - Expo documentation](https://docs.expo.dev/versions/latest/sdk/camera/)
24. [expo-camera - Expo](https://mintlify.wiki/expo/expo/sdk/camera)
25. [Date pickers](https://m3.material.io/components/date-pickers/accessibility)
26. [Touch target size - Android Accessibility Help](https://support.google.com/accessibility/android/answer/7101858?hl=en)
27. [Icon buttons](https://m3.material.io/components/icon-buttons/accessibility)
28. [Rate limits & access](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/)
29. [Figma MCP server: setup, tools and limits (2026) · Modeinspect](https://modeinspect.com/blog/figma-mcp)
30. [how many figma MCP server rate limits for K-12 users?](https://forum.figma.com/ask-the-community-7/how-many-figma-mcp-server-rate-limits-for-k-12-users-56654)
31. [Get started with the Figma MCP server](https://help.figma.com/hc/en-us/articles/39216419318551-Get-started-with-the-Figma-MCP-server)
32. [Guide to the Figma MCP server](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
33. [Set up the desktop server](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/)
34. [GitHub - adr/madr: Markdown Architectural Decision Records · GitHub](https://github.com/adr/madr)
35. [MADR - Markdown Architectural Decision Records - calcipy](https://calcipy.kyleking.me/docs/adr-research/madr/)
36. [The Markdown ADR (MADR) Template Explained and Distilled](https://ozimmer.ch/practices/2022/11/22/MADRTemplatePrimer.html)
37. [Why Did Supabase Pause My Project? How to Restore It and Stop It Happening Again - DEV Community](https://dev.to/debtdraft/why-did-supabase-pause-my-project-how-to-restore-it-and-stop-it-happening-again-42jp)
