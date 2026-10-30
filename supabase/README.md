# Supabase

Todo lo que vive en la base de datos de Supabase, versionado como SQL (plan v3, ADR 0001 y 0005).

| Ruta | Contenido |
|---|---|
| `base-prisma/` | Esquema original creado con Prisma (histórico), para reconstruir la base desde cero antes de aplicar `migrations/` |
| `migrations/` | Migraciones SQL, en orden. El nombre lleva la misma versión con la que quedó registrada en Supabase (`supabase_migrations.schema_migrations`). Las migraciones anteriores a la fase 1 están en `backend/prisma/migrations/` (línea base ya aplicada, que se retira con el backend) |
| `functions/` | Edge Functions (`admin-cuentas`: crear cuentas y restablecer contraseñas con la clave secreta, que Supabase inyecta en la función) |
| `tests/politicas.sql` | Pruebas de privilegios y políticas RLS por rol |
| `tests/cuentas.sql` | Pruebas de las funciones de administración de cuentas |
| `tests/catalogo.sql`, `tests/relevamientos.sql`, `tests/importar-catalogo.sql`, `tests/explorar.sql`, `tests/jornadas.sql`, `tests/jornadas-duplicados.sql`, `tests/jornadas-hallazgos.sql`, `tests/historial-exportaciones.sql` | Pruebas de la lectura del catálogo, de los relevamientos, fotos y eventos, de la importación del catálogo y de los listados por área y responsable |

## Aplicar una migración

Con la CLI de Supabase (`supabase db push`) o con la herramienta `apply_migration` del conector de Supabase. Una migración aplicada no se edita: se agrega otra.

## Probar las políticas

`tests/politicas.sql` se ejecuta completo contra la base (SQL Editor o `execute_sql`). Crea cuentas ficticias, simula a cada persona con los claims del JWT y termina con `ROLLBACK`, así que no deja datos ni registros de auditoría. La última consulta lista cada prueba con `ok = true` o `false`: todas deben dar `true`.

Hay que correr los dos archivos después de cada cambio de privilegios, políticas o funciones.

## Edge Functions

Se despliegan con `supabase functions deploy <nombre>` o con la herramienta `deploy_edge_function` del conector. La clave secreta (`SUPABASE_SERVICE_ROLE_KEY`) la provee la plataforma: nunca se escribe en el repositorio ni en la app. Una función con `verify_jwt` desactivado tiene que validar por sí misma al que llama antes de hacer nada.

## Reglas para escribir SQL acá

- Toda tabla de `public` lleva RLS y políticas explícitas por rol.
- Las funciones de apoyo van en el esquema `privado` (no lo expone la API), con `SECURITY DEFINER` y `search_path` vacío, y se revoca `EXECUTE` a `PUBLIC`.
- Una función nueva en `public` queda ejecutable por cualquiera si no se revoca: evitarlas o revocar `EXECUTE` a `PUBLIC`, `anon` y `authenticated`.
- Los clientes nunca reciben `INSERT`, `UPDATE` ni `DELETE` sobre las tablas de auditoría.
