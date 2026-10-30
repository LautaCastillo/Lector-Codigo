# Estado del proyecto y cómo retomar

Actualizado el 30/10/2026. Rama `lautaPC`. Hoja de ruta vigente: [`plan-v3-supabase-directo.md`](plan-v3-supabase-directo.md). Para levantar el proyecto en otra computadora: [`00-inicio/puesta-en-marcha.md`](00-inicio/puesta-en-marcha.md). Historia detallada: [`06-bitacora/`](06-bitacora/).

## 1. Fases del plan v3

| Fase | Contenido | Estado |
|---|---|---|
| 0 | ADR 0001 a 0006 | Hecha |
| 1 | Seguridad en la base: RLS, privilegios mínimos, auditoría | Hecha |
| 2 | Cuentas por administrador, sesión sin caducidad, PIN opcional, bienvenida | Hecha. Falta desactivar el registro público en Supabase |
| 3 | App directo a Supabase: catálogo, relevamientos, hallazgos con foto, exportación, actividad | Hecha |
| 4 | Importar catálogo CSV/XLSX desde la app, con historial de cargas | Hecha |
| 5 | Explorar por área, responsable y ubicación; jornadas compartidas en vivo; lecturas repetidas (gana la primera); historial de exportaciones | Hecha y probada con dos teléfonos |
| 6 | Retirar el backend, reordenar, comentar el código | En curso: backend retirado (30/10/2026); faltan comentarios por archivo |

## 2. Qué funciona hoy

- **Cuentas:** las crea un administrador (Edge Function `admin-cuentas`); contraseña temporal con cambio obligatorio; estados `activa`, `suspendida` y `baja`; sesión sin caducidad; PIN y biometría opcionales.
- **Catálogo:** importación desde la app (vista previa, solo columnas presentes, varias áreas), historial de cargas visible para todos, búsqueda, ficha con responsable y "Explorar bienes" por área, responsable y ubicación.
- **Relevamientos:** escaneo con varias simbologías, relevamiento individual, lote por ubicación, hallazgos con foto, "Mis relevamientos" y "Del equipo".
- **Jornadas por área o ubicación:** compartidas en tiempo real; un bien visto en otra ubicación del área cuenta con aviso; si dos personas leen el mismo bien figura la primera según la hora del servidor, con "también lo vio" y marca de discrepancia.
- **Navegación (30/10/2026):** inicio y menú lateral agrupados por tarea (Relevar, Consultar, Informes, Administración), definidos en `app/src/compartido/navegacion.ts`; el inicio muestra "Escanear" grande y las jornadas abiertas con su avance; el menú marca cuántas jornadas hay abiertas y pliega Administración; los historiales de cargas y de exportaciones están en una sola pantalla con dos pestañas ("Historiales").
- **Exportación a CSV** con constancia (filtros, filas, huella SHA-256) e historial de exportaciones visible para todos. PDF pendiente.
- **Auditoría** append-only y pantalla "Actividad" para administradores.
- **Pruebas:** 29 unitarias en `shared` y 27 en `app` (`funciones/lote/lote.spec.ts`); scripts SQL por rol en `supabase/tests/` (todas deben dar `true`); la app se probó en teléfonos reales con Expo Go.

## 3. Pendientes del autor

- Desactivar el registro público en Supabase (Authentication, "Allow new users to sign up").
- Rotar `consulta.patrimonio` de SIU y cambiar o dar de baja `adminlauta`, `relevador-app` y `prueba1`.
- Conseguir el aval escrito de Patrimonio antes de cargar datos reales.
- Probar "Importar catálogo" con el archivo de 61 bienes (suma las áreas SAD y FIJOS) y "Historial de cargas".

## 4. Pendientes de desarrollo

- Fase 6: cierre. Hecho: backend retirado, limpieza de la app y reorganización de `app/src/` (ver `docs/01-arquitectura/arquitectura.md`). Falta una prueba completa en el teléfono y el commit.
- Relevamientos individuales y lotes asociados a una jornada.
- Decidir si hacen falta tablas propias de áreas, ubicaciones y empleados (maestros de Diaguita: "Ubicaciones físicas" y "Áreas").
- Marcar los bienes que dejan de figurar en un listado nuevo.
- Confirmar con Patrimonio quién abre y cierra jornadas.
- Exportación a PDF y vista de administrador por ubicación o relevador.
- Cola de reintentos para cortes breves de red (opcional) e indicador de conexión.

## 5. Decisiones pendientes con la UNSa

Desde el plan v3 no bloquean el desarrollo, salvo el aval de Patrimonio para datos reales.

| Decisión | Con quién |
|---|---|
| Aval para cargar datos reales (inventario y empleados) en Supabase | Dirección de Patrimonio |
| Simbologías y formato de las etiquetas | Dirección de Patrimonio |
| Significado del campo "Cantidad de bienes" y listas de estados y ubicaciones | Dirección de Patrimonio |
| Imágenes: cuántas por bien, tamaño y dónde guardarlas | Dirección de Patrimonio |
| Retención de la auditoría y normativa aplicable | Patrimonio y área legal |
| Licencia del código y permiso para mostrarlo en un portfolio (sin datos reales) | Patrimonio y cátedra o tutor |

## 6. Riesgos abiertos

- **Datos reales fuera de la UNSa:** el catálogo vive en Supabase. No cargar datos reales sin el aval.
- **Pausa del proyecto gratuito de Supabase** tras una semana de inactividad, sobre todo en el receso de verano.
- **Cuentas de prueba y `consulta.patrimonio`:** ver la sección 3.
- **Registro público abierto** hasta desactivarlo en el panel de Supabase.
- **Sin conexión no se puede relevar de forma compartida** (ADR 0004): confirmar con Patrimonio si hay zonas sin cobertura.
