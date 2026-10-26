# Documentación del proyecto

Índice y mapa de lectura para quien mantenga el proyecto.

**Hoja de ruta vigente:** [`plan-v3-supabase-directo.md`](plan-v3-supabase-directo.md), "Plan v3: app conectada a Supabase, cuentas por administrador y catálogo por archivo" (26/10/2026). Define las decisiones, la arquitectura sin backend propio, la seguridad por RLS, el catálogo por archivo, los relevamientos compartidos y las fases 0 a 6. `CLAUDE.md` se alineó con este plan; si vuelven a diferir, manda el plan.

Los planes anteriores son **históricos** y se conservan como referencia de investigación: [`plan-de-mejora-login-auditoria-siu.md`](plan-de-mejora-login-auditoria-siu.md) y [`plan-de-mejoras-y-decisiones.md`](plan-de-mejoras-y-decisiones.md) (v2). Donde difieren del v3, manda el v3.

## Por dónde empezar

1. [`plan-v3-supabase-directo.md`](plan-v3-supabase-directo.md): la hoja de ruta.
2. [`estado-y-retomar.md`](estado-y-retomar.md): qué está hecho, qué falta, en qué fase estamos y qué decisiones esperan respuesta.
3. [`00-inicio/puesta-en-marcha.md`](00-inicio/puesta-en-marcha.md): cómo levantar el proyecto en una computadora nueva.
4. [`06-bitacora/`](06-bitacora/): qué se hizo y por qué, mes a mes.
5. [`consultas-unsa.md`](consultas-unsa.md): preguntas para el Centro de Cómputos y Patrimonio, con su estado.

## Mapa

| Ruta | Contenido | Estado |
|---|---|---|
| `plan-v3-supabase-directo.md` | Hoja de ruta vigente | Vigente |
| `plan-de-mejora-login-auditoria-siu.md` | Plan anterior (login propia, auditoría, SIU) | Histórico |
| `plan-de-mejoras-y-decisiones.md` | Plan anterior, complemento (v2) | Histórico |
| `estado-y-retomar.md` | Estado por fases y decisiones pendientes | Vigente |
| `00-inicio/` | Puesta en marcha | Vigente |
| `01-arquitectura/` | Diagramas C4, secuencias y modelo de datos (hoy solo [`arquitectura.md`](01-arquitectura/arquitectura.md)) | Parcial |
| `02-decisiones/` | ADR en formato MADR (0001 a 0006) | Vigente |
| `03-api/` | OpenAPI y convenciones | Por crear |
| `04-operacion/` | Runbook y seguridad | Por crear |
| `05-diseno/` | Figma y accesibilidad | Por crear |
| `06-bitacora/` | Diario por mes | Vigente |
| `07-traspaso/` | Guía para el próximo mantenedor | Por crear |
| `siu/` | Notas sobre SIU Diaguita | Vigente |
| `consultas-unsa.md` | Consultas a la UNSa | Vigente |

Las carpetas "por crear" siguen la estructura de la sección 6 del plan anterior y se completan al llegar su fase.

## Convenciones

- Commits en español, en imperativo y breves (el plan sugiere Conventional Commits; se mantiene el estilo de `CLAUDE.md` hasta decidirlo).
- Nunca subir credenciales: los `.env` no se versionan y los `.env.example` no llevan valores reales.
- Una decisión técnica relevante se documenta en un ADR; una decisión aceptada nunca se edita, se reemplaza con otro ADR.
