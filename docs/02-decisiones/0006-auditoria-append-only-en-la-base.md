# ADR 0006: Auditoría append-only en la base, con la identidad de Supabase

- Estado: aceptada
- Fecha: 26/10/2026
- Decide: el autor del proyecto
- Plan: [`plan-v3-supabase-directo.md`](../plan-v3-supabase-directo.md), sección 4. Parte de la auditoría ya implementada el 23/10/2026.

## Contexto

La auditoría actual tiene dos tablas: `evento_auditoria` (eventos de negocio, escritos por el servicio de auditoría del backend) y `cambio_fila` (cambios de fila, escritos por triggers que toman el actor de `app.usuario_id`, fijado por el backend con `set_config`). Triggers impiden `UPDATE`, `DELETE` y `TRUNCATE` en ambas.

Sin backend ([ADR 0001](0001-app-directa-a-supabase.md)), nadie fija `app.usuario_id` ni escribe los eventos de negocio.

## Decisión

- Se conservan las dos tablas y los triggers de inmutabilidad.
- El actor de `cambio_fila` es `app.usuario_id` si está fijado (para el backend actual y los scripts) y, si no, el usuario vinculado a `auth.uid()`.
- Los eventos de negocio los escriben funciones `SECURITY DEFINER` (`privado.registrar_evento`) y triggers sobre las tablas que los originan. Ningún cliente inserta en `evento_auditoria` ni en `cambio_fila`.
- Los clientes pierden `INSERT`, `UPDATE`, `DELETE` y `TRUNCATE` sobre ambas. La lectura queda así: el administrador ve todo; cada cuenta ve sus propios eventos de `evento_auditoria`; `cambio_fila` solo la ve el administrador.
- Los eventos de las cuentas (alta, rol, estado, baja) los registran las Edge Functions de administración. El de inicio de sesión se resuelve en la fase 2 (hook de Supabase Auth o registro desde la app).
- Los registros ya existentes se conservan sin cambios.

## Consecuencias

- Mientras convivan el backend y la app directa, un mismo hecho puede registrarse una vez por cada vía; por eso los triggers de eventos de relevamientos y exportaciones se agregan al migrar esas funciones (fase 3), no antes.
- `evento_auditoria` pierde su identificador UUID v7 generado por Prisma: se usa `gen_random_uuid()` y se ordena por `horaServidor`.
- El hash encadenado entre eventos sigue siendo opcional y queda fuera por ahora.
- La retención y la normativa aplicable a la auditoría siguen pendientes con Patrimonio.
