# Documentación del proyecto

Índice y mapa de lectura para quien mantenga el proyecto.

**Hoja de ruta vigente:** [`plan-v3-supabase-directo.md`](plan-v3-supabase-directo.md), "Plan v3: app conectada a Supabase, cuentas por administrador y catálogo por archivo" (26/10/2026). Define las decisiones, la arquitectura sin backend propio, la seguridad por RLS, el catálogo por archivo, los relevamientos compartidos y las fases 0 a 6. `CLAUDE.md` se alineó con este plan; si vuelven a diferir, manda el plan.

Los planes anteriores (login propia, backend NestJS, conexión con SIU) se retiraron de `docs/` porque ya no describen la app; siguen en el historial de git.

## Por dónde empezar

1. [`plan-v3-supabase-directo.md`](plan-v3-supabase-directo.md): la hoja de ruta.
2. [`estado-y-retomar.md`](estado-y-retomar.md): qué está hecho, qué falta, en qué fase estamos y qué decisiones esperan respuesta.
3. [`00-inicio/puesta-en-marcha.md`](00-inicio/puesta-en-marcha.md): cómo levantar el proyecto en una computadora nueva.
4. [`06-bitacora/`](06-bitacora/): qué se hizo y por qué, mes a mes.

## Mapa

| Ruta | Contenido | Estado |
|---|---|---|
| `plan-v3-supabase-directo.md` | Hoja de ruta vigente | Vigente |
| `estado-y-retomar.md` | Estado por fases y decisiones pendientes | Vigente |
| `00-inicio/` | Puesta en marcha | Vigente |
| `01-arquitectura/` | Diagramas C4, secuencias y modelo de datos (hoy solo [`arquitectura.md`](01-arquitectura/arquitectura.md)) | Parcial |
| `02-decisiones/` | ADR en formato MADR (0001 a 0006) | Vigente |
| `04-operacion/` | Runbook y seguridad | Por crear |
| `05-diseno/` | Figma y accesibilidad | Por crear |
| `06-bitacora/` | Diario por mes | Vigente |
| `07-traspaso/` | Guía para el próximo mantenedor | Por crear |
| `siu/` | Notas sobre SIU Diaguita | Vigente |

Las carpetas "por crear" se completan al llegar su fase. No hay `03-api/`: la app no tiene API propia.

## Convenciones

- Commits en español, en imperativo y breves (el plan sugiere Conventional Commits; se mantiene el estilo de `CLAUDE.md` hasta decidirlo).
- Nunca subir credenciales: los `.env` no se versionan y los `.env.example` no llevan valores reales.
- Una decisión técnica relevante se documenta en un ADR; una decisión aceptada nunca se edita, se reemplaza con otro ADR.
