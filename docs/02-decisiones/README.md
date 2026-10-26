# Decisiones de arquitectura (ADR)

Cada decisión técnica relevante se registra en un ADR con el formato MADR simplificado: contexto, opciones, decisión y consecuencias. Una decisión aceptada nunca se edita: se reemplaza con un ADR nuevo que la declara reemplazada.

| N.º | Decisión | Estado |
|---|---|---|
| [0001](0001-app-directa-a-supabase.md) | La app habla directo con Supabase, sin backend propio | Aceptada |
| [0002](0002-cuentas-por-administrador-y-sesion-sin-caducidad.md) | Cuentas creadas por administrador y sesión sin caducidad | Aceptada |
| [0003](0003-catalogo-por-archivo.md) | Catálogo por archivo, sin conexión a SIU Diaguita | Aceptada |
| [0004](0004-relevamientos-compartidos-en-tiempo-real.md) | Relevamientos compartidos en tiempo real | Aceptada |
| [0005](0005-seguridad-por-rls-y-privilegios-minimos.md) | Seguridad por RLS y privilegios mínimos | Aceptada |
| [0006](0006-auditoria-append-only-en-la-base.md) | Auditoría append-only en la base, con la identidad de Supabase | Aceptada |

Las decisiones del 26/10/2026 las tomó el autor al aprobar el [plan v3](../plan-v3-supabase-directo.md). El ADR 0005 es una propuesta del asistente que el autor aprobó junto con el plan.

## Plantilla

```
# ADR NNNN: Título

- Estado: propuesta | aceptada | reemplazada por NNNN
- Fecha:
- Decide:
- Plan:

## Contexto
## Opciones
## Decisión
## Consecuencias
```
