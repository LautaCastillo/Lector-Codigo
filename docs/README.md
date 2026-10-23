# Documentación del proyecto

Índice y mapa de lectura para quien mantenga el proyecto.

**Hoja de ruta vigente:** [`plan-de-mejora-login-auditoria-siu.md`](plan-de-mejora-login-auditoria-siu.md), "Plan de mejora de la app de relevamiento patrimonial de la UNSa: login, auditoría e integración con SIU-Diaguita". Define las fases 0 a 6, la arquitectura de login, la auditoría, la integración con SIU y la estructura de esta carpeta. En caso de contradicción con `CLAUDE.md`, prevalece el plan hasta que se actualice `CLAUDE.md`.

[`plan-de-mejoras-y-decisiones.md`](plan-de-mejoras-y-decisiones.md) (v2, 23/10/2026) es un **complemento**: parte del plan vigente y le suma decisiones del autor y una lectura del código. Es una referencia; cuando difiere del plan vigente manda el plan vigente. Las diferencias están en [`estado-y-retomar.md`](estado-y-retomar.md), sección 5.

## Por dónde empezar

1. [`plan-de-mejora-login-auditoria-siu.md`](plan-de-mejora-login-auditoria-siu.md): la hoja de ruta.
2. [`estado-y-retomar.md`](estado-y-retomar.md): qué está hecho, qué falta, en qué fase estamos y qué decisiones esperan respuesta.
3. [`00-inicio/puesta-en-marcha.md`](00-inicio/puesta-en-marcha.md): cómo levantar el proyecto en una computadora nueva.
4. [`06-bitacora/`](06-bitacora/): qué se hizo y por qué, mes a mes.
5. [`consultas-unsa.md`](consultas-unsa.md): preguntas para el Centro de Cómputos y Patrimonio, con su estado.

## Mapa

| Ruta | Contenido | Estado |
|---|---|---|
| `plan-de-mejora-login-auditoria-siu.md` | Hoja de ruta vigente | Vigente |
| `plan-de-mejoras-y-decisiones.md` | Complemento (v2): decisiones del autor y revisión del código | Referencia |
| `estado-y-retomar.md` | Estado por fases y decisiones pendientes | Vigente |
| `00-inicio/` | Puesta en marcha | Vigente |
| `01-arquitectura/` | Diagramas C4, secuencias y modelo de datos (hoy solo [`arquitectura.md`](arquitectura.md)) | Parcial |
| `02-decisiones/` | ADR en formato MADR | Por crear |
| `03-api/` | OpenAPI y convenciones | Por crear |
| `04-operacion/` | Runbook y seguridad | Por crear |
| `05-diseno/` | Figma y accesibilidad | Por crear |
| `06-bitacora/` | Diario por mes | Vigente |
| `07-traspaso/` | Guía para el próximo mantenedor | Por crear |
| `siu/` | Notas sobre SIU Diaguita | Vigente |
| `consultas-unsa.md` | Consultas a la UNSa | Vigente |

Las carpetas "por crear" siguen la estructura de la sección 6 del plan y se completan al llegar su fase.

## Convenciones

- Commits en español, en imperativo y breves (el plan sugiere Conventional Commits; se mantiene el estilo de `CLAUDE.md` hasta decidirlo).
- Nunca subir credenciales: los `.env` no se versionan y los `.env.example` no llevan valores reales.
- Una decisión técnica relevante se documenta en un ADR; una decisión aceptada nunca se edita, se reemplaza con otro ADR.
