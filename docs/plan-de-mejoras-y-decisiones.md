# Plan de mejoras y decisiones: Inventario Patrimonio UNSa

Versión 2. Fecha: 23/10/2026.
Alcance: documento de planificación. No implica cambios en el código ni commits.
Rama analizada: `lautaPC`, commit `fbbb1fd`.
Base: informe de investigación del 23/10/2026, actualizado con las decisiones del autor y con la revisión del código de la rama.

## 0. Cómo leer este documento

Cada afirmación lleva una de estas marcas cuando importa su origen:

- **[Autor]**: decisión o dato confirmado por el autor del proyecto.
- **[Código]**: comprobado leyendo la rama `lautaPC`.
- **[Verificado]**: confirmado en documentación oficial durante la investigación del 23/10/2026.
- **[Recomendación]**: criterio propio, justificado en el texto.
- **[Pendiente]**: depende de la UNSa o de una verificación que no se hizo. No se supone nada.

Mientras `CLAUDE.md` no se actualice (sección 13), este documento prevalece sobre él en los puntos de la sección 1.

## 1. Decisiones actualizadas

| N.º | Tema | Decisión o estado | Efecto sobre el proyecto |
|---|---|---|---|
| D1 | Login | **[Autor]** Dos modalidades candidatas: (A) Patrimonio crea las cuentas y las entrega; (B) cada usuario se registra y debe esperar la autorización de Patrimonio para realizar cualquier acción. Sin elegir todavía. | Sección 3. Reemplaza la recomendación del informe previo (solo invitación). |
| D2 | SIU Diaguita | **[Autor]** Se adopta la opción (a), API REST oficial, a la espera de la respuesta del datacenter. | Sección 6. El scraping deja de ser la vía principal. |
| D3 | Definición de "alta" | **[Autor]** Un alta es registrar en la app, de forma externa a SIU, un bien encontrado, no identificado o nuevo. SIU nunca se modifica. Los reportes los recibe Patrimonio, que registra manualmente. | Sección 5. Reemplaza los requisitos funcionales 3 y 5 de `CLAUDE.md`. |
| D4 | Independencia | **[Autor]** Lo más probable es que la app sea totalmente independiente del área de Patrimonio. No hay respaldo económico de la UNSa. | Costo cero, mantenibilidad por terceros y necesidad de un aval formal de Patrimonio para pedir accesos. |
| D5 | Centro de Cómputos | **[Autor]** No conoce la app. | Hace falta un primer contacto formal (sección 6.5). |
| D6 | Consulta al datacenter | **[Autor]** Se preguntará si pueden crear un usuario exclusivo para la app. | Sección 6.5, pregunta 1. |
| D7 | Consulta al datacenter | **[Autor]** Se preguntará si conviene alojar la app en una máquina virtual de la UNSa o con IP exclusivas. | Sección 7.1, escenarios E1 y E2. |
| D8 | App Colector | **[Autor]** Patrimonio no la usa, el autor no la encontró en Google Play y la considera antigua para lo que se busca. Queda fuera del alcance. | Se retiran del plan la exportación compatible con el Colector y el riesgo de duplicarla. El informe previo la daba por publicada según la wiki del SIU; no se pudo confirmar su disponibilidad actual. |

## 2. Estado verificado del código (rama `lautaPC`)

- **[Código]** La app usa Supabase Auth mediante `supabase-js` (`app/src/lib/supabase.ts`), con la sesión guardada en AsyncStorage. El login acepta usuario o correo; si no hay arroba completa con el dominio provisorio `patrimonio.local`. El registro pide nombre, correo y contraseña. Existe la pantalla `estado-cuenta` para cuentas pendientes.
- **[Código]** El backend resuelve la identidad en un único guard global (`backend/src/auth/relevador.guard.ts`). Con `SUPABASE_URL` definido valida el JWT contra el JWKS de Supabase y crea la fila `usuario` en el primer acceso con `activo = false`. Las cuentas inactivas reciben 403, salvo en los endpoints marcados con `@PermitirPendiente()` (hoy solo `GET /me`).
- **[Código]** La modalidad B ya está implementada en parte. Falta lo central: en los archivos revisados no hay ningún endpoint para que un administrador apruebe, rechace o suspenda cuentas (`usuarios.controller.ts` solo tiene `GET /me` y `PATCH /me`).
- **[Código]** `usuario` solo tiene un booleano `activo`. No registra quién aprobó, cuándo ni por qué. No hay verificación de rol en ningún endpoint; el rol se carga en la solicitud pero nada lo usa.
- **[Código]** Sin `SUPABASE_URL`, el guard acepta la cabecera `x-relevador` como identidad. Si en producción se olvida esa variable, la API queda abierta a cualquiera que escriba un nombre.
- **[Código]** La app envía `EXPO_PUBLIC_API_KEY` en cada pedido. Las variables `EXPO_PUBLIC_*` quedan dentro del paquete de la app, así que no es un secreto.
- **[Código]** `.env.example` apunta a SIU con `http://` (sin cifrado) y la base de datos es Supabase (cadena del Session pooler). `backend/src/siu/` está vacío; no hay adaptador de scraping implementado.
- **[Código]** Existen el importador de catálogo desde Excel de SIU (`backend/src/catalogo/siu-excel.ts`, con pruebas) y las migraciones `habilita_rls` y `campos_siu`.
- **[Código]** Sin implementar: `expo-sqlite`, sincronización (`backend/src/sync/` existe vacío), exportación, aprobación de cuentas, roles aplicados, auditoría de sesiones, hallazgos e informes.

## 3. Login y cuentas

### 3.1 Las dos modalidades candidatas

| Criterio | A: Patrimonio crea las cuentas | B: autorregistro con aprobación | Híbrida (A y B) |
|---|---|---|---|
| Quién inicia | El administrador crea la cuenta y entrega la credencial o una invitación | El usuario se registra y queda `pendiente` | Ambas, con la misma máquina de estados |
| Exposición | Sin registro público | Registro público en internet; las cuentas pendientes no acceden a datos | Registro público habilitado |
| Carga para Patrimonio | Un alta por persona y entrega segura de la credencial | Solo aprobar o rechazar, pero debe verificar la identidad de cada solicitante | Intermedia |
| Riesgos | Credenciales iniciales compartidas por canales inseguros | Solicitudes de desconocidos, spam, aprobar a quien no corresponde | Suma los de ambas |
| Estado en el código | No existe el alta por administrador | Parcial: registro y estado pendiente; falta la aprobación | |
| Mitigaciones | Contraseña temporal de un solo uso con cambio obligatorio al primer ingreso, o invitación con vencimiento | Pedir en el registro nombre completo y área o dependencia; límite de intentos; CAPTCHA si el proveedor lo ofrece **[Pendiente verificar]**; las pendientes no ven datos; vencimiento de solicitudes sin resolver | |

**[Recomendación]** Soportar ambas con una sola máquina de estados. B como vía normal, porque ya está iniciada y exige poco a Patrimonio. A para dar de alta a los administradores y a quien no pueda autorregistrarse. Si Patrimonio prefiere control total, usar solo A y deshabilitar el registro público en el proveedor. La elección final la define Patrimonio.

### 3.2 Estados de cuenta y trazabilidad

- Estados: `pendiente`, `activa`, `rechazada`, `suspendida`, `baja`.
- Transiciones: registro a `pendiente`; aprobación a `activa` (asigna rol); rechazo a `rechazada` (con motivo); suspensión y reactivación entre `suspendida` y `activa`; `baja` es lógica, nunca un borrado físico.
- Campos nuevos en `usuario`, en reemplazo de `activo`: `estado`, `aprobadoPor`, `aprobadoEn`, `motivoEstado`, `ultimoAccesoEn`.
- Todo cambio de estado o de rol exige un motivo y genera un evento de auditoría.
- Primer administrador: nadie puede aprobarlo. Se designa manualmente en la base (o con un script de arranque) y el procedimiento queda en el runbook. Se impide que el último administrador se quite el rol o se suspenda.
- Roles iniciales: `administrador` y `relevador`. Los administradores son personal de Patrimonio. Otros roles (por ejemplo, solo lectura) quedan para el futuro.
- Recuperación de contraseña: depende del proveedor y de contar con correo saliente. Sin SMTP institucional queda **[Pendiente]**.

### 3.3 Proveedor de identidad: decisión condicionada al hosting

| Criterio | Supabase Auth (plan gratuito) | Autenticación propia en NestJS |
|---|---|---|
| Costo | 0 | 0 |
| Esfuerzo | Ya integrado en la rama | Medio; patrón muy documentado |
| Disponibilidad | **[Verificado]** Los proyectos gratuitos se pausan tras 1 semana de inactividad | Depende de dónde corra el backend |
| Registro de inicios de sesión | Parcial (ver abajo) | Completo: se registran éxitos y fallos |
| Logs del proveedor | **[Verificado]** 1 hora de retención en Auth | No aplica |
| SSO institucional futuro | **[Verificado]** SAML no incluido en el plan gratuito | Se agrega con estrategias de Passport (OIDC, SAML, LDAP) |
| Dependencia externa | Alta (usuarios en `auth.users`, SDK en la app) | Ninguna |

Las cifras corresponden a páginas oficiales consultadas en octubre de 2026 y pueden cambiar.

**Criterio decisivo.** Con Supabase, el login ocurre contra Supabase y no contra el backend. El backend solo ve tokens ya emitidos: puede registrar el primer uso de cada sesión, pero los intentos fallidos solo quedan en los logs de Supabase, que duran 1 hora. **[Recomendación derivada de la lectura del guard]** Si se exige historial completo de inicios de sesión y fallos (pedido del autor), hace falta autenticación propia.

**Árbol de decisión [Recomendación]:**

- Si el datacenter ofrece una VM con PostgreSQL (E1, sección 7.1): autenticación propia, sin depender de una nube externa para el login y con auditoría completa.
- Si el hosting es externo y gratuito (E2 o E3): mantener Supabase Auth, aceptar auditoría parcial de sesiones y vigilar la pausa por inactividad (por ejemplo, en el receso de verano).
- Hasta que haya respuesta: no ampliar el acoplamiento con Supabase. Los únicos consumidores de `supabase.auth` en la app son `app/src/lib/sesion.tsx` y `app/src/lib/api.ts`, y el único punto del backend es el guard. Con eso la migración queda acotada.

**Si se migra a autenticación propia:** contraseñas con Argon2id; access token de unos 15 minutos con `sub`, `rol` y `sid`; refresh token opaco, rotativo y guardado con hash en una tabla `sesion`; reutilización de un refresh ya rotado revoca la familia; límite de intentos con `@nestjs/throttler`. Política de contraseñas según NIST SP 800-63B-4 **[Verificado]**: mínimo de 15 caracteres sin MFA y de 8 con MFA, máximo de al menos 64, sin reglas de composición ni rotación periódica, y contraste contra listas de contraseñas comunes. Los endpoints serían `POST /auth/login`, `/auth/refresh`, `/auth/logout` y `GET /auth/me`. La identidad se separa de la autorización: el rol y el estado se deciden siempre en la tabla `usuario`, aunque en el futuro autentique un proveedor institucional.

### 3.4 Sesión y trabajo sin conexión (hasta 2 días)

- Trabajar sin conexión no exige un token vigente. Exige una sesión local desbloqueada; la validez de la sesión en el servidor se comprueba al reconectar.
- El token de refresh se guarda en `expo-secure-store`, no en AsyncStorage. **[Verificado]** La opción `requireAuthentication` no funciona en Expo Go (exige una development build) y los datos protegidos con ella quedan ilegibles si cambian los datos biométricos.
- Bloqueo de la app con biometría o PIN propio (hash con sal), tras 5 minutos en segundo plano y en cada arranque en frío. No se aplica `requireAuthentication` al refresh token, porque agregar una huella forzaría un nuevo login sin conexión.
- Duraciones: con Supabase, el access token es configurable (por defecto 3600 s, máximo 604 800 s) y no se puede revocar antes de vencer **[Verificado]**; las opciones de vencimiento absoluto o por inactividad pueden no estar en el plan gratuito **[Pendiente verificar]**. Con autenticación propia: access 15 minutos, refresh 14 días deslizante y 30 días absoluto **[Recomendación]**.
- Revocación remota: el administrador suspende la cuenta y se revocan sus sesiones. En línea, el efecto llega como máximo cuando vence el access token; sin conexión, al reconectar.
- Operaciones hechas sin conexión por una cuenta que luego fue suspendida o revocada: no se descartan. Entran al servidor en estado `cuarentena` y un administrador las aprueba o rechaza. Se respeta así el requisito de no perder versiones y se cubre el caso de un teléfono robado.
- Excluir la base SQLite y SecureStore del backup automático de Android (`configureAndroidBackup`).

### 3.5 Cambios necesarios sobre el código actual (en orden)

1. Hacer que la autenticación falle cerrada: si en producción falta `SUPABASE_URL` (o el proveedor propio), el backend no debe arrancar. Hoy, sin esa variable, cualquiera entra con `x-relevador`.
2. Eliminar `EXPO_PUBLIC_API_KEY` y `x-api-key` del cliente. Si se conserva `API_KEY`, solo para procesos servidor a servidor.
3. Implementar el modelo de estados y los endpoints de administración: listar pendientes, aprobar, rechazar, cambiar rol, suspender.
4. Agregar el guard de roles y marcar cada endpoint con el rol requerido, con denegación por defecto.
5. Mover los tokens a SecureStore e implementar el bloqueo de la app.
6. Decidir en un ADR cómo conecta el backend a PostgreSQL. Con un rol propietario o superusuario, RLS no protege nada, así que la migración `habilita_rls` solo sirve si el backend usa un rol sin ese privilegio.
7. Reemplazar el dominio provisorio `patrimonio.local`.

## 4. Historial y auditoría

- **Mecanismo [Recomendación]:** tabla `evento_auditoria` append-only, escrita por la aplicación en la misma transacción que el cambio de negocio, más triggers de PostgreSQL como red de seguridad sobre las tablas de negocio. El backend ejecuta `set_config('app.usuario_id', ..., true)` al inicio de cada transacción para que el trigger conozca al actor. Los logs de Auth de Supabase no sirven como registro (1 hora).
- **Eventos:** `CUENTA_REGISTRADA`, `CUENTA_APROBADA`, `CUENTA_RECHAZADA`, `ESTADO_CUENTA_CAMBIADO`, `ROL_CAMBIADO`, `SESION_INICIADA`, `LOGIN_FALLIDO` (solo con autenticación propia), `SESION_REVOCADA`, `RELEVAMIENTO_REGISTRADO`, `INFORME_GENERADO`, `EXPORTACION_GENERADA`, `CONFLICTO_DETECTADO`, `OPERACION_CUARENTENA`.
- **Campos de `evento_auditoria`:** `id` (UUID v7), `tipo`, `actor_usuario_id` (nulo si el usuario no existe), `actor_rol`, `sesion_id`, `dispositivo_id`, `entidad_tipo`, `entidad_id`, `operacion_cliente_id`, `hora_dispositivo`, `hora_servidor_recepcion`, `desfase_estimado_ms`, `secuencia_dispositivo`, `resultado`, `motivo`, `datos` (JSONB; nunca contraseñas ni tokens), `ip`, `version_app`; opcionalmente `hash_previo` y `hash`.
- **Inmutabilidad:** `REVOKE UPDATE, DELETE` al rol de la aplicación y un trigger `BEFORE UPDATE OR DELETE` que lance excepción. Las correcciones se registran como eventos nuevos que referencian al anterior.
- **Retención (provisoria):** eventos de relevamientos, informes y exportaciones sin borrado mientras exista el sistema; eventos de sesión y fallos, 2 años y luego archivo comprimido. **[Pendiente]** validar con Patrimonio y con el área legal de la UNSa; no se verificó una norma de conservación aplicable.
- **Acceso:** el administrador ve todo; el relevador ve su propia actividad; nadie edita. Las consultas al registro también se auditan.
- **Relojes sin conexión:** en cada sincronización el servidor calcula el desfase entre su hora y la del dispositivo y lo devuelve. La hora del dispositivo se muestra siempre, pero solo ordena dentro del mismo dispositivo (mediante `secuencia_dispositivo`); entre dispositivos manda la hora del servidor. Un desfase mayor a 5 minutos marca el evento como `reloj_sospechoso`. Ante conflictos se conservan ambas versiones y el registro queda `con_conflicto` hasta que un administrador decide.

## 5. Hallazgos e informes (redefinición de "alta")

### 5.1 Principio

SIU es de solo lectura y la app no es un sistema de alta de bienes: es un instrumento de relevamiento. Lo que se registra en la app queda en el ámbito de la app. Patrimonio recibe el informe, decide y registra manualmente en SIU. **[Autor]**

### 5.2 Clasificación de cada bien relevado

Las definiciones son una propuesta y deben validarse con Patrimonio **[Pendiente]**.

| Clase | Definición propuesta | Datos que captura |
|---|---|---|
| Encontrado | El código leído corresponde a un bien del catálogo | Bien vinculado, ubicación observada, estado observado, observaciones |
| No identificado | Bien físico que no pudo asociarse al catálogo: código ilegible, dañado, ausente o sin coincidencia | Descripción, ubicación, número de serie visible, código leído (si hay), foto opcional, observaciones |
| Nuevo | Bien que el relevador considera que no figura en el catálogo | Los mismos que el anterior |

La diferencia exacta entre "no identificado" y "nuevo" es una consulta pendiente con Patrimonio. Ideas para el futuro, fuera del alcance inicial: **Faltante** (esperado en una ubicación según el catálogo y no relevado) y **Discrepancia** (encontrado con ubicación o estado distinto del catálogo).

### 5.3 Informe de relevamiento

- Lo genera un usuario con filtros (fecha, ubicación, relevador).
- Secciones: Encontrados, No identificados, Nuevos (a futuro, Faltantes y Discrepancias).
- Formatos: PDF y CSV.
- Cada generación se registra en `exportacion` y como evento de auditoría, con filtros, cantidad de filas y hash SHA-256 del archivo.
- Destinatario: Patrimonio. El informe nunca modifica SIU.

### 5.4 Cambios de modelo sugeridos (para la Fase 4)

**[Recomendación]**

- `bien` pasa a ser un espejo del catálogo, de solo lectura para la app, con `origen` e `importado_en`. Los campos `estadoCodigo` (`sin_codigo`, `codigo_danado`, `desconocido`) y las ediciones con `historial_cambio` sobre `bien` dejan de corresponder: describen hallazgos, no el catálogo.
- **Opción 1 (recomendada para empezar):** ampliar `relevamiento` con `clase` (`encontrado`, `no_identificado`, `nuevo`), `ubicacionObservada`, `descripcion`, `numeroSerie`, `foto` y `estadoInforme`. Un registro por lectura; los duplicados se consolidan al armar el informe.
- **Opción 2:** tabla `hallazgo` separada, que agrupa los relevamientos de un mismo bien físico no catalogado. Conviene si los duplicados entre relevadores se vuelven un problema.
- Edición de bienes del catálogo: la app no los edita; las correcciones se informan como observación o discrepancia. **[Pendiente]** confirmar con Patrimonio.

### 5.5 Ampliaciones futuras

Seguimiento por parte de Patrimonio (marcar cada ítem informado como procesado, para cerrar el circuito), faltantes por ubicación, panel de avance por ubicación y relevador, y fotos adjuntas.

## 6. Integración con SIU Diaguita

### 6.1 Decisión y orden de viabilidad

| # | Opción | Estado |
|---|---|---|
| 1 | (a) API REST oficial de Diaguita | **Elegida [Autor]**, en espera de la respuesta del datacenter |
| 2 | (c) Importación de exportaciones Excel o CSV | Camino garantizado y respaldo permanente (el importador ya existe) |
| 3 | (b) Usuario de solo lectura en la base, con vistas dedicadas | Alternativa si (a) no es posible |
| 4 | (d) Scraping de la interfaz Toba | Contingencia sin desarrollo activo; frágil |

### 6.2 Qué está verificado y qué no

- **[Verificado]** Existe una API REST versionada de SIU-Diaguita (`/diaguita/rest/v1/`; API 1.4 con Diaguita 4.3.0). Los usuarios de API se definen en `servidor_usuarios.ini`, con autenticación digest o basic, y todo sistema SIU con REST expone una consola de prueba en `/rest`.
- **[Verificado]** El bundle de Patrimonio de SIU-Huarpe y el servicio de verificación de bienes de la App Colector indican que la API tiene datos de bienes.
- **[Pendiente]** Los endpoints concretos de bienes, la versión que usa la UNSa y si la API admite usuarios de solo lectura. No se pudo consultar la especificación pública.

### 6.3 Consecuencia de la independencia del proyecto

Como el datacenter no conoce la app y no hay respaldo institucional, la espera es de duración incierta. **[Recomendación]** La app debe ser completa y útil sin SIU en línea: el catálogo entra por importación de archivo y la consulta en línea es una mejora, no un requisito.

### 6.4 Capa de abstracción en el backend

- Puerto `FuentePatrimonio` (en `backend/src/patrimonio/fuente/`): `buscarPorCodigo`, `buscar`, `listarPorUbicacion`, `salud` y `ultimaActualizacion`. Sin métodos de escritura.
- Adaptadores: `ImportacionArchivoFuente` (el importador actual), `SiuRestFuente` (cuando se habilite), `SiuVistasDbFuente` (opcional) y `TobaScraperFuente` (contingencia; hoy `backend/src/siu/` está vacío).
- Selección por configuración: `PATRIMONIO_FUENTE=siu_rest,archivo`, en orden de preferencia, con caída automática a la siguiente.
- Modelo canónico `BienExterno` en `shared/`, con `origen` y `obtenido_en`.
- Caché: tabla `bien_externo_cache` con TTL de unos 15 minutos, *stale-while-revalidate* y circuit breaker. Si la fuente falla, se devuelve el dato en caché marcado como desactualizado.
- La app nunca habla con SIU: recibe del backend `{ datos, origen, obtenido_en, desactualizado }` y muestra el origen y la fecha. En el dispositivo, una réplica SQLite del catálogo permite consultar sin conexión.
- Credenciales de SIU solo en variables de entorno del backend. La URL de `.env.example` usa `http://`; pedir HTTPS **[Pendiente]**.

### 6.5 Consulta al datacenter

**Requisito previo [Recomendación]:** pedir a la Dirección de Patrimonio una nota o aval que respalde la solicitud. Como la app es independiente y el Centro de Cómputos no la conoce, Patrimonio es quien puede justificar el acceso a sus datos.

**Presentación:** proyecto de un becario, independiente del área, sin costo para la UNSa, para unas 30 personas, que solo necesita lectura.

**Preguntas, en orden:**

1. ¿Pueden crear un usuario exclusivo de API para esta app, de solo lectura, limitado a los recursos de bienes, con autenticación digest o basic? **(D6)**
2. ¿Qué versión de SIU-Diaguita y de API hay en producción? ¿Está habilitado el REST (`/diaguita/rest/v1/`)? ¿Pueden compartir la lista de recursos de la consola `/rest`?
3. ¿Se puede alojar el backend en una máquina virtual de la UNSa? ¿Con qué recursos? **(D7)** Los recursos que se necesitan son una estimación propia a confirmar: 1 vCPU, 1 a 2 GB de RAM y 10 a 20 GB de disco.
4. Si no hay VM: ¿pueden autorizar una o más IP exclusivas de salida de un hosting externo en el firewall hacia SIU, con HTTPS? **(D7)**
5. Si hay VM: ¿se expone a internet con proxy inverso, dominio institucional y HTTPS, o solo a la red del campus o por VPN? ¿Quién administra el sistema operativo y los backups?
6. ¿Qué sistema gestiona las cuentas institucionales (SIU-Araí, Active Directory o LDAP, CAS u otro)? ¿Sería posible federar la app a futuro?
7. ¿Hay SMTP institucional para correos de activación y recuperación?
8. ¿Existe una política de seguridad, de retención o de uso de datos de patrimonio fuera de la UNSa?
9. Si la API no es posible: ¿vistas de solo lectura con un rol dedicado, o una exportación programada a una ubicación accesible por el backend?
10. ¿Quién es el interlocutor técnico responsable de SIU-Diaguita para consultas futuras?

## 7. Despliegue y seguridad

### 7.1 Escenarios de despliegue

| Escenario | Descripción | Requiere | Observaciones |
|---|---|---|---|
| E1 | VM en la UNSa con backend y PostgreSQL | Aprobación del datacenter, administración del sistema operativo y backups | SIU accesible por red interna; los datos quedan en la institución; permite autenticación propia sin nube externa |
| E2 | Hosting externo gratuito, con IP de salida fija autorizada hacia SIU | IP fija de salida (verificar si el proveedor la ofrece sin costo) y apertura en el firewall | Los datos de patrimonio quedan fuera de la UNSa (consultar, sección 7.3) |
| E3 | Hosting externo sin conexión a SIU | Nada del datacenter | Catálogo solo por importación de archivo; los datos quedan fuera de la UNSa |

**[Recomendación]** Desarrollar para E3, que no depende de nadie, y diseñar para pasar a E1 o E2 solo por configuración (sección 6.4).

Opción complementaria **[Recomendación propia, a evaluar]**: que la API sea accesible solo desde la red del campus o por VPN. Reduce casi toda la exposición a internet y es compatible con el trabajo sin conexión de 2 días, pero impide sincronizar fuera del campus.

### 7.2 Principios para que la app no sea una puerta de entrada a SIU

- **Mínimo privilegio:** usuario exclusivo de solo lectura. Nunca credenciales de una persona, y rotar la cuenta `consulta.patrimonio`, cuyas credenciales se expusieron en un chat (pendiente de `CLAUDE.md`).
- **El backend no es un proxy genérico:** solo endpoints fijos hacia SIU; nunca una URL que llegue desde el cliente (riesgo de SSRF).
- **Credenciales solo en el servidor,** en variables de entorno o un gestor de secretos; la app nunca las ve.
- **Si hay IP fija:** lista blanca en el firewall de destino y HTTPS.
- **Daño acotado:** si el backend se vulnerara, el acceso a SIU sería de solo lectura sobre datos de bienes.

### 7.3 Medidas por prioridad

**Antes de cargar datos reales:**

- Autenticación que falle cerrada en producción (sección 3.5, punto 1).
- Sin API key en el cliente.
- HTTPS obligatorio, también hacia SIU.
- Validación de entradas con DTO y lista blanca de campos.
- Límite de intentos (`@nestjs/throttler`), CORS restringido y cabeceras de seguridad (`helmet`).
- Secretos fuera del repositorio; `npm audit` en CI.
- Backups cifrados y restauración probada.
- Logs sin datos sensibles.
- Decisión documentada sobre RLS.

**Antes de la entrega:**

- Roles aplicados, SecureStore y bloqueo de la app.
- Auditoría append-only y revocación de sesiones.
- Modelo de amenazas breve en `docs/04-operacion/seguridad.md`.
- Revisión con los checklists OWASP ASVS (backend) y OWASP MASVS (app); verificar la versión vigente.

**Aclaraciones:**

- Ninguna medida garantiza que la app no pueda vulnerarse. El objetivo es reducir la superficie de ataque y limitar el daño.
- Los datos de bienes son institucionales: consultar con Patrimonio y con el datacenter qué puede alojarse fuera de la UNSa. Las capturas del portfolio no deben incluir datos reales.
- Distribución de la app: si nadie cubre el pago de la cuenta de Google Play, evaluar la distribución interna por APK. **[Pendiente]**

## 8. Mejoras de la app y funcionalidades

**Mejoras de presentación y flujo (a planificar, no implementar todavía):**

- **Ficha del bien:** número patrimonial grande y copiable, chip de estado, secciones colapsables (ubicación y responsable, datos de SIU con origen y fecha, último relevamiento, historial en línea de tiempo).
- **Escaneo:** recuadro guía, linterna, vibración con `expo-haptics`, sonido opcional, tarjeta inferior con el resumen del bien, *debounce* de 2 segundos por código. Si el código no existe, ofrecer búsqueda manual y registro de hallazgo.
- **Escaneo por lotes:** se elige una ubicación y se escanea en ráfaga; contador, duplicados marcados y resumen al cerrar.
- **Modo sin conexión visible:** indicador permanente (en línea, sin conexión, sincronizando N), pantalla de pendientes con reintento, pantalla de conflictos para administradores, fecha de la última sincronización y antigüedad del catálogo local.
- **Búsqueda manual** por número patrimonial, número anterior, descripción o ubicación (FTS de SQLite sin conexión).
- **Registro de hallazgos** con foto opcional, número provisorio con UUID y vínculo posterior si el bien se reetiqueta.
- **Informes** con filtros guardados y exportación a PDF o CSV auditada.
- **Accesibilidad:** objetivos táctiles de al menos 48 dp, contraste de 4,5:1 en texto y 3:1 en íconos, etiquetas para TalkBack, texto escalable y estados que no dependan solo del color.
- **Cámara:** restringir las simbologías a las que usen las etiquetas reales. Una comparativa de un proveedor comercial (Scanbot) indica que `expo-camera` no tiene autofocus en Android; leerla con cautela y verificar en dispositivos reales.

**Matriz impacto y esfuerzo:**

| Funcionalidad | Impacto | Esfuerzo | Cuándo |
|---|---|---|---|
| Aprobación de cuentas, estados y roles | Alto | Medio | Ya |
| SQLite local, cola de salida y sincronización idempotente | Muy alto | Alto | Ya (núcleo) |
| Indicador de conexión y pantalla de pendientes | Alto | Bajo | Victoria rápida |
| Háptico, linterna y *debounce* | Medio | Bajo | Victoria rápida |
| Ficha del bien | Alto | Medio | Ya |
| Búsqueda manual | Alto | Bajo a medio | Victoria rápida |
| Registro de hallazgos | Muy alto | Medio | Siguiente |
| Informe de relevamiento (PDF y CSV) para Patrimonio | Muy alto | Medio | Siguiente |
| Escaneo por lotes por ubicación | Alto | Medio | Siguiente |
| Resolución de conflictos (administrador) | Alto | Medio a alto | Siguiente |
| Adaptador SIU REST | Muy alto | Medio | Cuando responda el datacenter |
| Faltantes y discrepancias por ubicación | Alto | Medio | Futuro |
| Seguimiento de ítems procesados por Patrimonio | Medio a alto | Medio | Futuro |
| Modo oscuro | Medio (portfolio) | Bajo con tokens | Tras el sistema de diseño |
| Login institucional (OIDC o LDAP) | Medio a alto | Alto | Futuro |
| Fotos con almacenamiento | Medio | Medio a alto | Futuro |
| iOS | Medio | Medio | Futuro |
| Panel web de administración | Medio | Alto | Futuro |

## 9. Diseño en Figma para el portfolio

- **Herramientas [Verificado]:** Code Connect requiere planes de pago; el servidor MCP de Figma tiene 20 llamadas mensuales en el plan gratuito y límites mayores en planes pagos y Education. Verificar si el autor es elegible para el plan Education **[Pendiente]**.
- **Fuente única de tokens [Recomendación]:** `shared/design-tokens/tokens.json` en el repositorio, con los mismos nombres que las variables de Figma, y un script o Style Dictionary que genere el tema de React Native. Registrar en un ADR cuál es la fuente de verdad.
- **Estructura del archivo de Figma:** portada; léeme; fundamentos (variables primitivas y semánticas, modos claro y oscuro); componentes con variantes (botón, chip de estado, tarjeta de bien, barra de sincronización, tarjeta de escaneo, banner sin conexión, diálogo de conflicto, elemento de línea de tiempo); patrones (formularios, listas con filtros, estados vacío, error, carga y sin conexión); pantallas por flujo, en claro y oscuro; flujos; prototipo del flujo principal; handoff con la tabla de tokens; archivo de exploraciones descartadas.
- **Flujos nuevos a diseñar por esta versión:** registro y espera de aprobación, aprobación de cuentas por el administrador, registro de hallazgo (encontrado, no identificado, nuevo) y generación del informe para Patrimonio.
- **Base visual:** kit oficial de Material 3 de la comunidad de Figma, navegación inferior de 3 a 5 destinos y respeto de la barra de gestos.
- **Caso de estudio:** contexto y problema; usuarios; restricciones (costo cero, sin conexión de 2 días, SIU de solo lectura, independencia institucional); proceso; decisiones clave con enlaces a los ADR; diseño y accesibilidad; resultados medidos en una prueba de campo (no inventar métricas); aprendizajes.
- **Permiso:** consultar a Patrimonio antes de publicar capturas, y no incluir datos reales.

## 10. Documentación del proyecto (`docs/`)

```
docs/
  README.md                  índice y mapa de lectura para el próximo mantenedor
  00-inicio/                 puesta en marcha, glosario
  01-arquitectura/           diagramas C4, secuencias y modelo de datos (Mermaid)
  02-decisiones/             ADR en formato MADR 4.0.0, con plantilla
  03-api/                    openapi.json generado con @nestjs/swagger; convenciones
  04-operacion/              runbook y seguridad
  05-diseno/                 figma.md y accesibilidad
  06-bitacora/               un archivo por mes
  07-traspaso/               guía de traspaso al próximo mantenedor
  consultas-unsa.md          preguntas enviadas, respuestas, fecha y quién respondió
```

- **ADR sugeridos:** 0001 autenticación y proveedor de identidad (según el hosting); 0002 modalidad de alta de cuentas; 0003 outbox con UUID y conflictos sin descarte; 0004 auditoría append-only; 0005 fuente de datos de patrimonio intercambiable; 0006 hallazgos e informes en lugar de altas en SIU; 0007 tokens de diseño como fuente de verdad; 0008 despliegue (E1, E2 o E3).
- **Bitácora:** una entrada por sesión, en 5 líneas: objetivo, qué se hizo, qué se aprendió (con enlace a la fuente), bloqueo y próximo paso. Al cerrar cada fase, una retrospectiva de una página.
- **Trazabilidad:** Conventional Commits o los commits en español de `CLAUDE.md`; plantilla de PR con "ADR relacionado", "Issue" y "Cómo probar"; cada ADR enlaza los PR que lo implementan; GitHub Projects como tablero.
- **Herramientas gratuitas:** Mermaid, MADR, `@nestjs/swagger`, GitHub Projects, Style Dictionary, markdownlint y, opcionalmente, MkDocs o Docusaurus publicados en GitHub Pages.

## 11. Roadmap por fases

Las duraciones son estimaciones propias para una persona a tiempo parcial y deben revisarse al cerrar cada fase.

| Fase | Contenido | Duración | Criterio de salida |
|---|---|---|---|
| 0. Cimientos y consultas | Aval de Patrimonio y envío de las consultas al datacenter; estructura de `docs/` y ADR; actualizar `CLAUDE.md`; CI con lint y pruebas | 1 a 2 semanas | Consultas enviadas; ADR 0001 y 0002 en estado propuesto |
| 1. Seguridad y cuentas | Autenticación que falla cerrada; estados de cuenta y endpoints de aprobación; guard de roles; sin API key en el cliente; SecureStore y bloqueo; `evento_auditoria` append-only | 3 a 4 semanas | Pruebas e2e de registro, aprobación, suspensión y roles |
| 2. Núcleo sin conexión | `expo-sqlite`, catálogo local por importación de archivo, cola de salida con UUID, endpoint de sincronización idempotente, conflictos al historial, manejo de relojes | 4 a 6 semanas | Prueba de campo de 48 horas en modo avión sin pérdida de datos |
| 3. Experiencia de campo | Escaneo mejorado, ficha, búsqueda, lotes, indicador de conexión, accesibilidad | 3 a 4 semanas | Prueba de uso con 3 a 5 relevadores reales |
| 4. Hallazgos e informes | Clasificación (encontrado, no identificado, nuevo), foto opcional, informe PDF y CSV para Patrimonio, pantalla de actividad | 3 a 4 semanas | Patrimonio valida el informe y las clases |
| 5. Integración SIU | Puerto `FuentePatrimonio`, adaptador de archivo, adaptador REST si se habilita, caché | 2 a 4 semanas | Cambio de fuente solo por configuración |
| 6. Entrega | Runbook, guía de traspaso, release Android, caso de estudio | 2 semanas | Otra persona levanta el entorno siguiendo solo la guía |

Figma (fundamentos y componentes) corre en paralelo desde la Fase 0 y debe estar listo antes de la Fase 3.

## 12. Decisiones pendientes y riesgos

### 12.1 Decisiones, en orden

| N.º | Decisión | Con quién | Bloquea |
|---|---|---|---|
| 1 | Aval formal del proyecto y quién será el responsable institucional tras la entrega | Dirección de Patrimonio | Todo pedido al datacenter |
| 2 | Modalidad de cuentas: A, B o ambas; quiénes serán administradores | Dirección de Patrimonio | Fase 1 |
| 3 | Dónde se aloja el backend (E1, E2 o E3) y si la API es accesible solo desde el campus o por VPN | Centro de Cómputos o datacenter | Proveedor de identidad e integración con SIU |
| 4 | Usuario exclusivo de la API de Diaguita, versión y endpoints de bienes | Centro de Cómputos o referente de SIU | Opción (a) |
| 5 | Definición de las clases de hallazgo y contenido del informe | Dirección de Patrimonio | Fase 4 |
| 6 | Si la app puede editar bienes del catálogo o solo informar discrepancias | Dirección de Patrimonio | Modelo de datos |
| 7 | Simbologías y formato real de las etiquetas | Dirección de Patrimonio | Configuración de la cámara |
| 8 | Qué datos pueden alojarse fuera de la UNSa | Patrimonio y datacenter | E2 y E3 |
| 9 | SMTP institucional y sistema de cuentas institucional | Centro de Cómputos | Recuperación de contraseña y login futuro |
| 10 | Retención de la auditoría y normativa aplicable | Patrimonio y área legal | Política de retención |
| 11 | Quién cubre la publicación en Google Play, o distribución por APK | A definir | Entrega |
| 12 | Permiso para mostrar el proyecto en el portfolio (sin datos reales) | Patrimonio y cátedra o tutor | Portfolio |

### 12.2 Riesgos principales

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| El datacenter no responde o no habilita la API | Alta | Alto | La app funciona completa con importación de archivo; puerto de fuente intercambiable |
| API abierta por una configuración de producción incompleta | Media | Muy alto | Autenticación que falla cerrada y prueba automática de arranque |
| Registro público saturado de solicitudes falsas (modalidad B) | Media | Medio | Límite de intentos, datos de verificación, vencimiento de pendientes |
| Pausa del proyecto gratuito de Supabase por inactividad | Media | Alto | Preferir E1; si no, vigilar la pausa y documentar la restauración en el runbook |
| Pérdida o duplicación de datos en la sincronización | Media | Muy alto | UUID idempotente, cola de salida transaccional, conflictos al historial, prueba de campo de 48 horas |
| Dispositivo robado con sesión activa | Baja a media | Alto | Bloqueo biométrico o PIN, revocación remota, cuarentena de operaciones |
| Datos de patrimonio alojados fuera de la UNSa sin autorización | Media | Alto | Consultar antes de cargar datos reales (decisión 8) |
| Mantenedor futuro sin contexto | Alta | Alto | ADR, runbook, guía de traspaso, `.env.example`, entorno levantado por un tercero |
| Alcance excesivo para una sola persona | Alta | Medio | Fases con criterio de salida; posponer iOS, login institucional y fotos |
| Versiones muy nuevas (Expo SDK 57, NestJS 12, Prisma 7, TypeScript 6) con documentación de terceros desactualizada | Media | Medio | Priorizar documentación oficial versionada y fijar versiones en el lockfile |

## 13. Cambios a aplicar en `CLAUDE.md` al retomar Claude Code

No se aplican ahora. Cuando se retome el trabajo:

1. **Autenticación:** reemplazar "suspendida por ahora" por el estado real (Supabase Auth con aprobación de cuentas) y las modalidades A y B de la sección 3.
2. **Integración con SIU:** reemplazar el scraping como vía principal por la opción (a), con importación de archivo como camino garantizado y el scraping como contingencia.
3. **Requisito funcional 3:** reescribirlo como registro de hallazgos (encontrado, no identificado, nuevo) sin modificar SIU.
4. **Requisito funcional 5:** eliminar la edición de bienes del catálogo, o condicionarla a la decisión 6.
5. **Modelo de datos:** reflejar `bien` como espejo del catálogo, los estados de cuenta y las clases de hallazgo.
6. **Pendientes:** agregar aval de Patrimonio, consulta al datacenter (sección 6.5), escenario de despliegue, datos fuera de la UNSa y distribución por APK. Mantener la rotación de `consulta.patrimonio`.
7. **Reglas de trabajo:** agregar que el scraping no se desarrolla sin pedido expreso y que la autenticación debe fallar cerrada.

## Fuentes

- Supabase: [precios](https://supabase.com/pricing), [sesiones](https://supabase.com/docs/guides/auth/sessions)
- NestJS: [autorización](https://docs.nestjs.com/security/authorization)
- SIU: [Diaguita](https://documentacion.siu.edu.ar/wiki/SIU-Diaguita), [App Colector](https://documentacion.siu.edu.ar/wiki/SIU-Diaguita/appcolector), [REST de Toba](https://documentacion.siu.edu.ar/toba/docs/referencia-rest/), [bundle de patrimonio de Huarpe](https://documentacion.siu.edu.ar/huarpe/docs/servicios/bundle-patrimonio/), [SIU-Araí Usuarios](https://documentacion.siu.edu.ar/usuarios/docs/intro/)
- OWASP: [Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- Expo: [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [Camera](https://docs.expo.dev/versions/latest/sdk/camera/)
- Figma: [límites del servidor MCP](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/)
- ADR: [MADR](https://github.com/adr/madr)
