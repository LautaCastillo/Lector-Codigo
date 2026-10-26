# ADR 0004: Relevamientos compartidos en tiempo real

- Estado: aceptada
- Fecha: 26/10/2026
- Decide: el autor del proyecto
- Plan: [`plan-v3-supabase-directo.md`](../plan-v3-supabase-directo.md), decisiones D7, D8 y D10

## Contexto

Cuando dos personas relevan juntas la misma ubicación o área, cada una necesita ver lo que la otra ya registró para no repetir ni perder trabajo. El esquema actual guarda lotes individuales que se envían al terminar.

## Decisión

- Los relevamientos se guardan en Supabase y se comparten en tiempo real con Supabase Realtime. Esto exige conexión: se abandona el requisito de trabajar 2 días sin conexión y se descarta SQLite local.
- Se introduce la **jornada**: un relevamiento compartido, con tipo (`individual`, `area`, `ubicacion` o `hallazgos`), alcance (área o ubicación), estado (`abierta` o `cerrada`) y participantes. `relevamiento` sigue siendo cada lectura, con un `jornada_id`.
- Lo esperado de una jornada se calcula del catálogo según su alcance.
- Si dos personas leen el mismo bien, se **conservan ambos registros** (no se descarta ninguna versión) y la pantalla muestra quién lo relevó primero. El resumen toma el más reciente.
- La subida sigue siendo idempotente: el identificador de cada lectura (`idCliente`, UUID) lo genera el teléfono.
- Opcional: una cola local de reintentos para cortes breves de red, sin catálogo local completo.

## Implementación (26/10/2026)

- La jornada es una tabla `jornada` (tipo `area` o `ubicacion`, alcance, estado) y cada lectura lleva `relevamiento.jornadaId`. Abrir una jornada para un alcance que ya tiene una abierta devuelve esa: así se suma quien llega después.
- El tiempo real usa Supabase Realtime sobre `relevamiento` y `jornada`; la app, al recibir un cambio, vuelve a pedir el avance (`avance_jornada`). Para que todas las cuentas reciban los cambios, la política de lectura de `relevamiento` pasó de "lo propio" a "cualquier cuenta activa". Es coherente con la decisión de que el equipo se ve entre sí; la escritura sigue siendo solo de lo propio.
- Cualquier cuenta activa puede abrir, sumarse y relevar; cerrar es de quien la abrió o de un administrador.

## Consecuencias

- Sin señal no se puede relevar de forma compartida. Hay que confirmar con Patrimonio si existen zonas sin cobertura; de ser así, se reabre esta decisión.
- Realtime tiene límites de conexiones y mensajes en el plan gratuito, suficientes para unas 30 personas.
- Los tipos de relevamiento, el modelo de áreas, ubicaciones y empleados y quién puede sumarse a una jornada están pendientes de la estructura que entregue el autor (fase 5).
