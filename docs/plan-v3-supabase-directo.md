# Plan v3: app conectada a Supabase, cuentas por administrador y catálogo por archivo

Versión 3. Fecha: 26/10/2026. Estado: **hoja de ruta vigente**.

Reemplaza como hoja de ruta a los planes anteriores (`plan-de-mejora-login-auditoria-siu.md` y `plan-de-mejoras-y-decisiones.md`), que se retiraron de `docs/` el 30/10/2026 y siguen en el historial de git. Se conservan como referencia de investigación (hosting, SIU, auditoría, UX, Figma), pero donde difieran de este documento manda este.

## 0. Cómo leer este documento

- **[Autor]**: decisión del autor del proyecto, tomada el 26/10/2026.
- **[Código]**: comprobado en la rama `lautaPC`.
- **[Recomendación]**: criterio propuesto, a confirmar.
- **[Pendiente]**: falta un dato o una decisión. No se supone nada.

## 1. Decisiones

| N.º | Tema | Decisión | Origen |
|---|---|---|---|
| D1 | Servidor propio | No hay backend propio. La app habla directamente con Supabase (Auth, base con RLS, Realtime, Storage y Edge Functions). Se retira NestJS al terminar la migración. | [Autor] camino B |
| D2 | Cuentas | Solo inicio de sesión. Las cuentas las crea un administrador desde la app. Se desactiva el registro público. | [Autor] |
| D3 | Sesión | No caduca. El PIN o la biometría pasan a ser opcionales (Ajustes). Suspender o dar de baja una cuenta es el mecanismo de corte. | [Autor] sesión; [Recomendación] PIN opcional |
| D4 | Inicio de la app | Pantalla de bienvenida con el logo de la UNSa y "Dirección de Patrimonio", y luego el inicio (o el login si no hay sesión). | [Autor]; logo [Pendiente] |
| D5 | SIU | Sin conexión a SIU Diaguita: ni API, ni scraping, ni vistas. El catálogo entra por un archivo CSV o XLSX descargado de Diaguita. | [Autor] |
| D6 | Catálogo | Un único catálogo compartido en Supabase, cargado por un administrador desde un archivo. | [Autor] |
| D7 | Relevamientos | Compartidos y en tiempo real: si dos personas relevan a la vez, cada una ve lo que registra la otra. Esto exige conexión. | [Autor] |
| D8 | Tipos de relevamiento | Individual, por área, por ubicación física y hallazgos. | [Autor]; detalle [Pendiente] |
| D9 | Áreas, ubicaciones y empleados | Se decide si llevan tablas propias cuando el autor entregue la estructura. | [Autor]; [Pendiente] |
| D10 | Datos | Supabase es la única base. Los relevamientos se guardan ahí. | [Autor] |
| D11 | Orden | Primero funciones y arquitectura; al final se reestructuran las carpetas y se comenta cada archivo y función importante. | [Autor] |

Consecuencia de D7: se abandona el requisito de trabajar hasta 2 días sin conexión. Queda como mejora opcional una tolerancia mínima a cortes breves (sección 9).

## 2. Qué reemplaza del plan anterior

| Tema | Plan anterior | Plan v3 |
|---|---|---|
| Servidor | NestJS propio, a alojar en la UNSa u otro | Ninguno propio; todo en Supabase |
| Cuentas | Invitación o autorregistro con aprobación | Solo las crea el administrador |
| Estados de cuenta | `pendiente`, `activa`, `rechazada`, `suspendida`, `baja` | `activa`, `suspendida`, `baja` |
| Identidad | Autenticación propia, o Supabase Auth hasta conocer el hosting | Supabase Auth, definitivo |
| SIU | API REST (preferida), archivo, vistas, scraping | Solo archivo |
| Offline | Núcleo sin conexión con SQLite y sincronización | Conectada. Tolerancia mínima opcional |
| Sesión | Refresh rotativo, bloqueo con PIN | No caduca; PIN opcional |
| Consultas a la UNSa | Centro de Cómputos (hosting, API, identidad) | Ya no bloquean; queda el aval de Patrimonio |
| Auditoría | Servicio del backend con `set_config` | Triggers y funciones en la base con `auth.uid()`; sin permisos de UPDATE ni DELETE para los clientes |
| Rol de base de datos (ADR pendiente) | Backend propietario que se salta RLS | Los clientes nunca son propietarios; RLS y privilegios mínimos son la defensa |

## 3. Arquitectura objetivo

```
App Android (Expo)
   |  supabase-js (clave publicable + sesión del usuario)
   v
Supabase
   Auth ................. login; el administrador crea cuentas (Edge Function)
   Postgres + RLS ....... catálogo, relevamientos, hallazgos, auditoría
   Realtime ............. cambios de relevamientos en vivo
   Storage .............. fotos de hallazgos (bucket privado)
   Edge Functions ....... crear cuenta, cambiar rol/estado, acciones con clave secreta
```

- La app solo lleva la clave **publicable**. La clave secreta (`service_role`) vive únicamente en los secretos de las Edge Functions y nunca en la app ni en el repositorio.
- Las reglas de negocio pasan de código NestJS a tres lugares: políticas RLS (quién ve y escribe qué), restricciones y triggers (integridad y auditoría) y funciones SQL (`rpc`) para operaciones compuestas.
- `shared/` se conserva: normalización de códigos, tipos y constantes, que la app importa directamente.

## 4. Seguridad: RLS no es opcional

Con la app hablando directo a la base, las políticas RLS son la única barrera. Hasta ahora estaban habilitadas sin políticas (bloqueaban todo) porque el backend accedía como propietario. Este plan exige:

- RLS habilitado en toda tabla del esquema público, sin excepciones, y revisión con el asesor de seguridad de Supabase antes de cargar datos reales.
- Funciones auxiliares `es_activa()` y `es_administrador()` (SECURITY DEFINER, estables), que leen `usuario` por `auth.uid()`.
- Matriz de acceso inicial **[Recomendación]**, a refinar al diseñar cada tabla:

| Tabla | Lectura | Escritura |
|---|---|---|
| `usuario` | Propia fila; administrador, todas | Propia: solo nombre. Rol y estado: solo administrador vía función |
| `bien` y `codigo_bien` | Cuentas activas | Solo administrador (importación) |
| `jornada` (relevamiento compartido) | Participantes y administrador | Crear: cuentas activas; cerrar: creador o administrador |
| `relevamiento` (lectura individual) | Participantes de la jornada y administrador | Insertar: cuenta activa participante, con `usuario_id = auth.uid()`; sin UPDATE ni DELETE |
| Fotos (Storage) | Dueño y administrador | Dueño, una por hallazgo, tipo JPEG y tamaño máximo |
| `evento_auditoria`, `cambio_fila` | Administrador (y cada usuario, sus eventos) | Solo triggers y funciones; nadie hace UPDATE, DELETE ni TRUNCATE |
| `exportacion` | Dueño y administrador | Insertar por función |

- Registro público desactivado en Supabase Auth, y confirmación de correo desactivada (los correos de las cuentas son internos).
- Las pruebas de políticas se escriben como scripts SQL que simulan cada rol (`set role authenticated` con claims de prueba) dentro de una transacción que se revierte.

## 5. Cuentas y sesión

- **Login:** usuario o correo y contraseña (se mantiene el esquema actual de correo interno para quienes entran por nombre de usuario).
- **Crear cuenta:** pantalla "Nueva cuenta" para administradores. Llama a la Edge Function `admin-cuentas` (acción `crear`), que verifica que quien llama sea administrador activo, crea el usuario con la API de administración, inserta la fila en `usuario` con estado `activa` y rol, y registra el evento de auditoría. La contraseña inicial es temporal y la entrega el administrador.
- **Primer ingreso:** cambio obligatorio de contraseña (campo `debe_cambiar_clave`).
- **Cambiar rol, suspender, dar de baja:** Edge Function o `rpc` restringida a administradores, con motivo obligatorio y auditado.
- **Sesión:** `supabase-js` con renovación automática y la sesión guardada en `expo-secure-store` (ya implementado). Sin caducidad por tiempo.
- **PIN o biometría:** opcionales, se activan en Ajustes. El flujo actual de `configurar-bloqueo` se conserva pero deja de ser obligatorio.
- **Corte de acceso:** las políticas RLS consultan el estado de la cuenta en cada pedido (`es_activa()`), de modo que una cuenta suspendida deja de leer y escribir aunque conserve el token. Hay que verificarlo con una prueba.
- **Recuperación de contraseña:** el administrador la restablece (contraseña temporal nueva). Sin correo.

## 6. Catálogo por archivo

1. El administrador elige un CSV o XLSX descargado de Diaguita ("Bienes de uso") desde la app.
2. La app lo lee en el teléfono, valida columnas y filas, y muestra un resumen previo: bienes nuevos, modificados y sin cambios, y errores.
3. Al confirmar, sube por lotes a una función SQL que hace el alta o actualización por `numero_inventario` y registra una constancia (archivo, huella, cantidades) en la auditoría. **Nunca se borra** un bien del catálogo: los que no vienen en el archivo se marcan, no se eliminan.
4. El formato de columnas es el que ya reconoce el importador actual (`backend/src/catalogo/siu-excel.ts`); se lleva su lógica a `shared/` para que la use la app.

Puntos a verificar antes de implementar: biblioteca de lectura de XLSX que funcione en React Native sin dependencias nativas, y volumen real del listado (rendimiento y límites del plan gratuito). Alternativa si no es viable: leer el archivo en una Edge Function.

## 7. Relevamientos compartidos

Nombres: hoy `relevamiento` es una lectura individual y `loteId` las agrupa. Se introduce **`jornada`** como el relevamiento compartido, y `relevamiento` sigue siendo cada lectura.

- `jornada`: tipo (`individual`, `area`, `ubicacion`, `hallazgos`), alcance (área o ubicación, cuando corresponda), estado (`abierta`, `cerrada`), creador y fecha.
- Participantes: quienes se suman a una jornada abierta (por lista o código de acceso). **[Pendiente]** definir si cualquiera con cuenta activa puede sumarse.
- Lo esperado de una jornada se calcula del catálogo según su alcance (como hoy en el lote por ubicación).
- Cada lectura se inserta con `jornada_id`. La app se suscribe por Realtime a las lecturas de esa jornada y actualiza al instante lo encontrado, lo faltante y lo que otro ya relevó.
- **Dos personas leen el mismo bien:** se conservan ambos registros (no se descarta ninguna versión) y la pantalla muestra "ya relevado por X a las HH:MM". El resumen toma el más reciente.
- Idempotencia: se mantiene el `idCliente` (UUID) para que reintentar no duplique.
- **Hallazgos:** igual que hoy (clase, descripción, código provisorio `H-XXXXXXXX`), con la foto en Storage y vínculo posterior al catálogo por un administrador.
- El relevamiento individual y los lotes actuales se migran como jornadas de tipo `individual` y `ubicacion`.
- Detalle de tipos y pantallas: **[Pendiente]**, el autor lo entregará.

## 8. Exportación

- CSV armado en el teléfono con el mismo formato actual (`;`, BOM, CRLF, hora de Salta, neutralización de fórmulas).
- La constancia (filtros, filas, huella SHA-256 calculada con `expo-crypto`) se inserta en `exportacion` mediante una función, con evento de auditoría.
- PDF queda pendiente.

## 9. Conexión y cortes

La app requiere conexión para relevar de forma compartida. Mínimo opcional **[Recomendación]**: una cola local de reintentos para las lecturas hechas durante un corte breve (se envían al volver la red, idempotentes por `idCliente`) y un indicador de conexión visible. Sin SQLite ni catálogo local completo. Si el relevamiento en zonas sin señal pasa a ser necesario, se reabre la decisión.

## 10. Qué pasa con el código existente

| Parte | Destino |
|---|---|
| `backend/src/*` (NestJS) | Se retira al final de la migración. Su lógica pasa a RLS, funciones SQL y Edge Functions |
| `backend/prisma/migrations/` | Se trasladan a `supabase/migrations/` (SQL puro, con Supabase CLI). Se agregan políticas, funciones y la tabla `jornada` |
| `backend/src/auditoria/` y triggers | Los triggers se adaptan a `auth.uid()`; el servicio desaparece |
| `backend/src/catalogo/siu-excel.ts` | La lógica de lectura pasa a `shared/` y se usa desde la app |
| `backend/src/exportaciones/csv.ts` | Pasa a `shared/` y se usa desde la app |
| `backend/test/` y `base-falsa.ts` | Se reemplazan por pruebas SQL de políticas y pruebas unitarias en `shared/` |
| `shared/` | Se conserva y crece (normalización, CSV, lectura del catálogo, tipos) |
| `app/src/lib/api.ts` | Se reescribe sobre `supabase-js` (misma interfaz hacia las pantallas, para no tocarlas todas) |
| `app/src/app/(auth)/registro`, `estado-cuenta` | Se eliminan |
| `app/src/app/(app)/cuentas` | Se amplía con "Nueva cuenta" |
| `configurar-bloqueo`, `bloqueo` | Se conservan como opcionales |
| `docker-compose.yml`, `backend/src/siu/`, `backend/src/sync/` | Se eliminan |

## 11. Fases

| Fase | Contenido | Criterio de salida |
|---|---|---|
| 0. Planificación | Este plan, ADR de las decisiones D1 a D7, documentación alineada | Plan v3 aprobado por el autor |
| 1. Base y seguridad | Migraciones en `supabase/`, funciones auxiliares, políticas RLS, triggers con `auth.uid()`, privilegios mínimos (el registro público se desactiva al cerrar la fase 2) | Pruebas SQL de cada política en verde; asesor de seguridad de Supabase sin alertas críticas |
| 2. Cuentas y sesión | Edge Function `admin-cuentas` y funciones de gestión, pantalla "Nueva cuenta", cambio obligatorio de clave, sin registro, PIN opcional, sesión sin caducidad, pantalla de bienvenida | Un administrador crea una cuenta y esa persona entra y relevó; una cuenta suspendida pierde acceso |
| 3. App directa a Supabase | `api.ts` sobre `supabase-js`: bienes, búsqueda, relevamientos, hallazgos con Storage, exportación en el teléfono | Todas las pantallas actuales funcionan sin el backend |
| 4. Catálogo por archivo | Importación CSV y XLSX desde la app con resumen previo y constancia | Un administrador carga el listado real y se ve en otro teléfono |
| 5. Relevamientos compartidos | Tabla `jornada`, tipos de relevamiento, Realtime, estructura de áreas, ubicaciones y empleados (cuando llegue) | Dos teléfonos relevan a la vez y ven lo del otro |
| 6. Cierre | Retiro del backend, reestructura de carpetas, comentario de cabecera por archivo y por función importante, regeneración del grafo, documentación, release Android | Repositorio sin código muerto y documentación al día |

La pantalla de bienvenida (D4) espera el logo. El resto de la fase 2 no depende de él.

### Estado de las fases (26/10/2026)

- **Fase 0: hecha.** ADR 0001 a 0006 en [`02-decisiones/`](02-decisiones/README.md), aceptados.
- **Fase 1: hecha, con dos excepciones.** Migración `supabase/migrations/20261026131335_fase1_seguridad_rls.sql`, aplicada y probada: vínculo `usuario.authId` con Supabase Auth, esquema `privado` con `usuario_actual`, `es_activa` y `es_administrador`, privilegios mínimos para `anon` y `authenticated`, políticas por rol, restricciones `CHECK` y triggers que reemplazan las validaciones del backend, y auditoría con `auth.uid()`. Las 55 pruebas por rol de `supabase/tests/politicas.sql` dan verdadero y el asesor de seguridad de Supabase no marca nada crítico. Quedan:
  - **Registro público:** se desactiva al terminar la fase 2, porque la app actual todavía lo usa. Mientras tanto una cuenta nueva no accede a ningún dato (no tiene `usuario` activa).
  - **Protección contra contraseñas filtradas** (aviso del asesor): es una opción de Supabase Auth, probablemente de planes pagos. Se evalúa al final.
- **Fase 2: hecha el 26/10/2026; falta probarla en el teléfono, desactivar el registro público y la pantalla de bienvenida.**
  - Base: migración `supabase/migrations/20261026132212_fase2_gestion_de_cuentas.sql` con las funciones `alta_cuenta`, `cambiar_estado_cuenta`, `cambiar_rol_cuenta`, `marcar_clave_cambiada` y `marcar_clave_temporal`, y la columna `usuario.debeCambiarClave`. Suspender o dar de baja cierra además las sesiones abiertas (`auth.sessions`). 41 pruebas en `supabase/tests/cuentas.sql`, todas verdaderas.
  - Edge Function `admin-cuentas` (acciones `crear` y `restablecer`), desplegada con `verify_jwt` desactivado porque valida el token ella misma. Se comprobó que rechaza sin token, con la clave publicable y con un token sin cuenta (401). La creación real hay que probarla desde la app con un administrador.
  - App: se eliminaron la pantalla de registro y el flujo de aprobación; "Cuentas" lista todas las cuentas y permite crear, suspender, reactivar, dar de baja, cambiar el rol y restablecer la contraseña; el primer ingreso exige elegir contraseña propia; el PIN pasó a ser opcional (Ajustes); la sesión no caduca; el perfil y las cuentas se leen directo de Supabase. Lo demás sigue pasando por el backend hasta la fase 3.
  - Pendiente: desactivar el registro público de Supabase Auth una vez probado el alta de cuentas, y la pantalla de bienvenida (D4), que espera el logo.
  - El evento `SESION_INICIADA` lo sigue registrando el backend; al retirarlo en la fase 3 pasa a una función de la base.
  - El asesor de seguridad marca las cinco funciones de administración como ejecutables por usuarios autenticados: es intencional, cada una verifica el rol de quien llama dentro de la base.
- **Fase 2, cierre (26/10/2026):** probada en el teléfono por el autor (login, inicio, menú). Se agregó la pantalla de bienvenida (logo de la UNSa y "Dirección de Patrimonio", 1,8 s). Sigue pendiente desactivar el registro público en el panel de Supabase.
- **Fase 3: hecha en el código el 26/10/2026; falta probarla en el teléfono.**
  - Hecho: lecturas del catálogo directo desde la app, sin backend: escaneo, ficha, búsqueda, ubicaciones, bienes esperados por ubicación e historial (`app/src/lib/catalogo.ts`). Migración `20261026141858_fase3_lectura_del_catalogo.sql` con `ubicaciones_catalogo()` y `historial_bien()`; pruebas en `supabase/tests/catalogo.sql`. La lista de simbologías es la predeterminada, sin consultar al servidor.
  - Hecho, segunda parte: relevamientos (alta idempotente por `idCliente`, "Mis relevamientos", detalle, últimos de un bien), hallazgos con la foto en Storage (bucket privado `hallazgos`), vincular hallazgos, exportación CSV armada en el teléfono con su constancia y huella SHA-256, pantalla de Actividad y evento de inicio de sesión. Migración `20261026142904_fase3_relevamientos_y_fotos.sql`; pruebas en `supabase/tests/relevamientos.sql` (34). `csv.ts` y la validación de relevamientos pasaron a `shared/` (16 pruebas).
  - La app ya no tiene ninguna llamada al backend: `EXPO_PUBLIC_API_URL` dejó de usarse.
  - Cambios de comportamiento: los eventos de auditoría de relevamientos y exportaciones los escriben triggers (solo cuando escribe una cuenta de la app); el evento "se consultó la actividad" ya no se registra; "cuenta sin permiso" y "no existe" se muestran igual para un relevamiento ajeno.
  - Probada en el teléfono por el autor (26/10/2026): todo funciona sin backend. Ajuste pedido: ver lo que relevó otra cuenta. "Mis relevamientos" tiene ahora el selector "Míos / Del equipo" (función `relevamientos_visibles`, migración `20261026190000_fase3_relevamientos_del_equipo.sql`) y las fotos de hallazgos las ve cualquier cuenta activa. La tabla sigue privada por cuenta; el equipo lo ve por la función. La actualización en vivo (Realtime) llega con la fase 5.
  - Pendiente: retirar el backend, una vez confirmado el resto y, si anda, retirar el backend (carpeta `backend/`, Prisma, CI) y reescribir su documentación.
- **Fase 4: hecha en el código el 26/10/2026; falta probarla en el teléfono.** Un administrador importa el listado de SIU (Excel o CSV) desde "Importar catálogo": la app lee el archivo (`shared/src/catalogo-archivo.ts`, sin bibliotecas de planillas: el XLSX se descomprime con `fflate`), muestra cuántos bienes son nuevos, modificados y sin cambios, y al confirmar los sube en tandas. Funciones `importar_catalogo` y `registrar_importacion_catalogo`, tabla `importacion_catalogo` (constancia con la huella SHA-256), migraciones `20261026200000` y `20261026200100`; 21 pruebas SQL en `supabase/tests/importar-catalogo.sql` y 26 en `shared`. Verificado con tus tres listados reales (55, 14 y 61 bienes). Los cambios quedan en el historial del bien con el administrador como actor, y repetir la carga no agrega nada. El importador del backend ya no hace falta.
  - Reportes de un área (26/10/2026): el reporte que exporta Diaguita por área responsable ("Reporte de bienes patrimoniales activos...") trae cuatro filas de cabecera antes del encabezado, valores como "$ 100.000,00", el **responsable de uso** de cada bien y no trae estado, número de serie, número anterior ni expediente. El lector detecta el encabezado, lee la cabecera (total declarado y filtros) y devuelve qué columnas trae; la importación solo toca esas (migración `20261026210000`; pruebas en `supabase/tests/importar-catalogo-columnas.sql`). La ficha del bien muestra el responsable. Probado con ese archivo real: 84 bienes, 84 con responsable, total declarado coincidente. El reporte trae solo bienes activos, así que no hace falta importar las bajas.
  - Historial de importaciones (26/10/2026): cada carga deja su constancia (archivo, huella SHA-256, quién, cuándo, totales y las áreas que traía) y **todas las cuentas activas** la ven en "Historial de cargas" (función `historial_importaciones`, migración `historial_de_importaciones`; la tabla sigue siendo solo para administradores). Al elegir un archivo para importar, la app avisa si ese mismo archivo (por su huella) ya se cargó, con la fecha y quién. 9 pruebas en `supabase/tests/historial-importaciones.sql`. Las cargas anteriores a esto no guardaron las áreas.
  - Falta: marcar los bienes que no vienen en un listado nuevo (hoy no se borran ni se marcan) y avisar cada cuánto conviene cargar un listado nuevo.
- **Fase 5: iniciada (26/10/2026).** Primer paso hecho: "Explorar bienes" (menú) lista las áreas, los responsables y las ubicaciones físicas con su cantidad de bienes, y al tocar una se ven sus bienes, con un filtro de segundo nivel (en un área: sus ubicaciones; en un responsable: sus áreas; en una ubicación: sus responsables) y un buscador. Los listados se calculan en vivo a partir de `bien` (funciones `areas_catalogo`, `responsables_catalogo` y `ubicaciones_catalogo`), así que un archivo de otra área recién importado aparece al instante; sin tablas aparte por ahora. Migración `20261026230000_fase5_explorar_catalogo.sql`; 7 pruebas en `supabase/tests/explorar.sql`. Hecho después: **jornadas por área o ubicación** (menú "Jornadas por área"). Una jornada es un relevamiento compartido: cualquier cuenta activa la abre o se suma a la que ya está abierta para ese alcance; lo esperado son los bienes del área o la ubicación (calculado en vivo del catálogo); cada lectura es un `relevamiento` con su `jornadaId`; el avance (pendientes, encontrados, otros) lo ve todo el equipo y **se actualiza en vivo** con Supabase Realtime (suscripción a `relevamiento` y `jornada`, que reaprovecha las políticas de lectura). Un bien visto en otra ubicación del área cuenta como encontrado con aviso; uno de otra área o un código fuera del catálogo queda en "Otros". Quien la abrió o un administrador la cierra, y en una jornada cerrada ya no se releva. Para que el equipo se vea, **las cuentas activas leen todos los relevamientos** (escribir sigue siendo solo lo propio). Migraciones `fase5_jornadas` y `fase5_jornadas_codigo_en_extras`; 25 pruebas en `supabase/tests/jornadas.sql`. **Probada con dos teléfonos (30/10/2026).** Lecturas repetidas: figura la primera según la hora del servidor, las demás como "también lo vieron", y las que no coinciden se marcan como discrepancia (migración `jornadas_gana_el_primero`, `supabase/tests/jornadas-duplicados.sql`). Historial de exportaciones visible para todas las cuentas (`historial_exportaciones`, `supabase/tests/historial-exportaciones.sql`). Pendiente: el filtro por jornada de los relevamientos individuales y los lotes; decidir si hacen falta tablas propias de áreas y ubicaciones; quién puede cerrar y si hace falta aprobar la participación.
- **Fase 6: en curso (30/10/2026).** Hecho: se retiró el backend (`backend/`, Prisma, Docker, `.env.example` de la raíz y el paso de Prisma del CI); el esquema base de Prisma se conservó en `supabase/base-prisma/` para poder reconstruir la base; los planes anteriores pasaron a `docs/archivo/`; se reescribieron `README.md`, `CLAUDE.md`, `docs/estado-y-retomar.md`, la puesta en marcha, la arquitectura y las notas de SIU; cada archivo de `app/src` y `shared/src` tiene un comentario de propósito. Pendiente: regenerar el grafo de graphify (hecho en la sesión), la versión de entrega y la reorganización interna de `app/src/lib` si se la considera necesaria.

## 12. Pruebas

- `shared/`: unitarias con Vitest (normalización, CSV, lectura del catálogo).
- Políticas y funciones SQL: scripts por rol dentro de una transacción que se revierte (la auditoría no se puede borrar).
- Edge Functions: pruebas contra un proyecto de Supabase de desarrollo o una rama de base de datos, nunca contra datos reales.
- App: verificación manual en dos teléfonos para Realtime y cortes de red.

## 13. Riesgos

| Riesgo | Efecto | Mitigación |
|---|---|---|
| Una política RLS mal escrita expone datos | Alto | Pruebas SQL por rol, asesor de seguridad, nadie usa la clave secreta en la app |
| El plan gratuito de Supabase pausa el proyecto tras una semana sin actividad | La app deja de funcionar hasta reactivarlo | Visitar el panel o programar una consulta periódica; documentarlo en el traspaso |
| Datos reales (inventario, empleados) en servidores fuera de la UNSa | Reputacional y normativo | Aval escrito de Patrimonio antes de cargar datos reales; evaluar qué datos personales de empleados hacen falta |
| Sin conexión no se puede relevar | Zonas sin señal | Cola de reintentos opcional; confirmar con el autor si hay zonas sin cobertura |
| Sesión que no caduca y teléfono perdido | Acceso indebido | Suspensión inmediata por el administrador; PIN opcional recomendado |
| Límites del plan gratuito (almacenamiento de fotos, Edge Functions, Realtime) | Corte de servicio | Fotos de hasta 1 MB, monitoreo de uso |
| Migración de datos de prueba y de la auditoría existente | Pérdida de historial | La auditoría existente se conserva; los datos de prueba pueden rehacerse |

## 14. Pendientes

1. **Logo de la UNSa** y texto exacto de la bienvenida.
2. **Estructura de áreas y ubicaciones físicas** y de empleados, para decidir tablas (D9) y el modelo de jornadas por alcance.
3. **Detalle de los tipos de relevamiento** (D8) y quién puede sumarse a una jornada.
4. **Aval de Patrimonio** para cargar datos reales en Supabase (ya no bloquea el desarrollo).
5. Rotar la cuenta `consulta.patrimonio` de SIU (sigue expuesta) y cambiar o dar de baja las cuentas de prueba (`adminlauta`, `relevador-app`) antes de cargar datos reales.
6. Confirmar con Patrimonio las simbologías de las etiquetas (las físicas traen menos dígitos que SIU).

## 15. ADR a redactar (fase 0)

1. App directa a Supabase sin backend propio (D1).
2. Cuentas creadas por administrador y sesión sin caducidad (D2, D3).
3. Catálogo por archivo y sin conexión a SIU (D5, D6).
4. Relevamientos compartidos en tiempo real (D7).
5. Seguridad por RLS y privilegios mínimos (reemplaza el ADR del rol de base de datos).
6. Auditoría append-only en la base con `auth.uid()`.
