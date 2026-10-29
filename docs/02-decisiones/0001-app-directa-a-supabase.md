# ADR 0001: La app habla directo con Supabase, sin backend propio

- Estado: aceptada
- Fecha: 26/10/2026
- Decide: el autor del proyecto
- Plan: [`plan-v3-supabase-directo.md`](../plan-v3-supabase-directo.md), decisión D1

## Contexto

El backend NestJS corre hoy en la computadora del autor. Para usarlo desde otros teléfonos haría falta alojarlo: en un servidor de la UNSa (sin respuesta del Centro de Cómputos y sin presupuesto) o en un servicio gratuito con límites y suspensión por inactividad. Además lo mantendrá otra persona después de la entrega, y cada servidor propio es algo más que mantener.

La base ya está en Supabase, que además ofrece autenticación, tiempo real, almacenamiento de archivos y funciones de borde.

## Opciones

1. **Mantener NestJS** y alojarlo en un servicio gratuito. Conserva el código actual, pero suma un servidor que se duerme y que alguien debe operar.
2. **App directa a Supabase.** Las reglas pasan a la base (políticas RLS, restricciones, triggers y funciones SQL) y a Edge Functions para lo que necesita la clave secreta.

## Decisión

Opción 2. La app usa `supabase-js` con la clave publicable y la sesión del usuario. El backend NestJS se retira al terminar la migración (fase 6 del plan v3).

## Consecuencias

- No hay servidor propio que alojar, parchear ni vigilar. Se depende de Supabase y de los límites de su plan gratuito (pausa por inactividad, cuotas).
- La seguridad queda en la base: ver [ADR 0005](0005-seguridad-por-rls-y-privilegios-minimos.md).
- La clave secreta (`service_role`) vive solo en los secretos de las Edge Functions. Nunca en la app ni en el repositorio.
- Las validaciones del backend (por ejemplo `validarRelevamiento`) pasan a restricciones `CHECK` y triggers en la base, y a `shared/` para validar también en el teléfono.
- Las migraciones se escriben en SQL en `supabase/migrations/`. Las de `backend/prisma/migrations/` quedan como línea base ya aplicada.
- Se reescriben las pruebas del backend como pruebas SQL por rol y pruebas unitarias en `shared/`.
