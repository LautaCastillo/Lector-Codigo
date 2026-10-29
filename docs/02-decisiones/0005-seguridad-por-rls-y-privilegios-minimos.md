# ADR 0005: Seguridad por RLS y privilegios mínimos

- Estado: aceptada
- Fecha: 26/10/2026
- Decide: el autor del proyecto (a propuesta del asistente)
- Plan: [`plan-v3-supabase-directo.md`](../plan-v3-supabase-directo.md), sección 4. Reemplaza el ADR pendiente "rol de base de datos" del plan anterior.

## Contexto

Hasta ahora el backend se conectaba como propietario (`postgres`), que se salta RLS, y las tablas tenían RLS habilitado **sin políticas** para bloquear la API pública. Con la app hablando directo a Supabase ([ADR 0001](0001-app-directa-a-supabase.md)), las políticas RLS pasan a ser la única barrera entre cualquier teléfono y los datos.

Se comprobó el 26/10/2026 que Supabase concede por defecto **todos los privilegios** sobre las tablas de `public` a los roles `anon` y `authenticated`. Solo RLS sin políticas los frena.

## Decisión

1. Los roles `anon` y `authenticated` pierden todos los privilegios sobre `public` y recuperan solo los mínimos, tabla por tabla y, cuando hace falta, columna por columna (por ejemplo, `UPDATE` de `usuario` solo sobre `nombre`). Los privilegios por defecto de objetos futuros también se revocan.
2. Todas las tablas de `public` tienen RLS habilitado, y cada una tiene políticas explícitas por rol de la aplicación.
3. La identidad de la aplicación se resuelve con `auth.uid()`. Se agrega `usuario.authId` (UUID de Supabase Auth, único) para vincular cada cuenta.
4. Las funciones de apoyo (`usuario_actual`, `es_activa`, `es_administrador`) viven en un esquema `privado`, que la API pública no expone. Son `SECURITY DEFINER` con `search_path` vacío y solo las ejecuta `authenticated`.
5. Toda política exige `es_activa()`: una cuenta suspendida o dada de baja pierde el acceso al instante, aunque conserve su token.
6. Las tablas de auditoría no admiten escritura directa de los clientes. Solo las escriben triggers y funciones `SECURITY DEFINER`.
7. Las reglas de validación que hacía el backend pasan a restricciones `CHECK` y triggers en la base.
8. Cada política y privilegio se prueba con scripts SQL que simulan cada rol (`supabase/tests/`), y el asesor de seguridad de Supabase se revisa antes de cargar datos reales.

## Consecuencias

- La clave publicable es pública por diseño; la seguridad no depende de ocultarla.
- La clave secreta no se usa en la app. Las operaciones que la necesitan (crear cuentas, por ejemplo) van en Edge Functions que verifican que quien llama sea administrador.
- Una política mal escrita expone datos: por eso hay pruebas por rol y no se posterga esta fase.
- Mientras el backend NestJS siga existiendo, se conecta como `postgres` y no se ve afectado por estos cambios.
