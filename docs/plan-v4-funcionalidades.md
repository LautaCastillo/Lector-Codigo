# Plan v4: nuevas funcionalidades

Propuesto el 30/10/2026, después de cerrar la fase 5 y de asociar hallazgos, relevamientos y lotes a las jornadas. Complementa el [plan v3](plan-v3-supabase-directo.md), que sigue vigente hasta cerrar la fase 6. Está ordenado de lo más importante a lo menos importante; nada de esto está hecho.

Tamaños: **S** = una sesión de trabajo, **M** = unas pocas sesiones, **L** = requiere diseño previo (ADR) y varias etapas.

## Criterio de orden

1. Lo que evita perder o falsear datos en el campo (errores de lectura, falta de señal, lecturas que no coinciden).
2. Lo que pide una auditoría (actas, constancias, firmas).
3. Lo que mejora el trabajo diario de quien relevó.
4. Lo que hace falta para que otra universidad use la app.
5. Lo que es cómodo pero no cambia el resultado.

## Etapa 1: confianza en el campo

| # | Funcionalidad | Qué resuelve | Cómo | Tam. |
|---|---|---|---|---|
| 1 | **Deshacer una lectura** | Una lectura equivocada queda anotada y no se puede corregir. | La persona borra o anula sus propias lecturas mientras la jornada está abierta (función en la base, con auditoría; no se borra la fila, se la marca anulada). El avance ignora las anuladas. | S |
| 2 | **Funcionamiento sin conexión e indicador de conexión** | Sótanos, depósitos y sedes del interior sin señal. Hoy no se puede relevar de forma compartida sin red. | Cola local de relevamientos con reintento automático (los `idCliente` ya hacen el envío idempotente); la jornada se guarda en el teléfono y se sincroniza al volver la red; indicador "N sin enviar". Nueva decisión sobre ADR 0004. | L |
| 3 | **Cola de discrepancias** | El aviso "Revisar" no tiene salida: nadie resuelve cuál lectura vale. | Pantalla con los bienes de una jornada con lecturas que no coinciden; un supervisor elige la lectura válida y deja una nota. Se guarda quién resolvió y cuándo. | M |
| 4 | **Dividir una jornada por sectores** | Dos relevadores recorren lo mismo. | Cada persona toma una ubicación o rango dentro de la jornada; las filas de otros sectores se atenúan. Solo organiza: no impide leer fuera del sector. | M |

## Etapa 2: lo que pide una auditoría

| # | Funcionalidad | Qué resuelve | Cómo | Tam. |
|---|---|---|---|---|
| 5 | **Acta de relevamiento en PDF** | Hoy solo hay CSV. | Acta de una jornada cerrada: encontrados, faltantes, sobrantes y fuera de lugar, quién relevó y cuándo, con huella SHA-256. Se registra en el historial de exportaciones. | M |
| 6 | **Firma de conformidad del responsable** | El acta no tiene constancia de que el responsable la vio. | Firma en pantalla o confirmación con su cuenta sobre el acta; se guarda en la base con fecha. Depende de 5. | M |
| 7 | **Bienes para baja o en reparación** | Cuentan como faltantes aunque se sepa dónde están. | Estado administrativo del bien (en reparación, para baja, prestado) con motivo; el avance los muestra aparte. Resuelve también el pendiente "marcar los bienes que dejan de figurar en un listado nuevo". | M |
| 8 | **Pendientes que se repiten** | Un bien no encontrado en varias jornadas se pierde entre los demás. | Contar en cuántas jornadas seguidas quedó pendiente y destacarlo. | S |

## Etapa 3: trabajo diario

| # | Funcionalidad | Qué resuelve | Cómo | Tam. |
|---|---|---|---|---|
| 9 | **Comentarios en un bien o una jornada** | No hay dónde anotar "prestado a otra oficina". | Tabla de comentarios con autor y fecha, visibles en la ficha y la jornada. Entran en la auditoría. | S |
| 10 | **Linterna y escaneo continuo** | Depósitos oscuros; leer varios códigos seguidos. | Botón de linterna en la cámara; modo continuo con pausa entre lecturas. | S |
| 11 | **Historia de cada bien** | No se ve dónde estuvo ni en qué estado. | Línea de tiempo en la ficha con los relevamientos, ubicaciones y estados declarados. | M |
| 12 | **Panel del administrador** | No hay una vista de conjunto. | Avance por área, bienes nunca encontrados, lecturas por persona. | M |
| 13 | **Comparar dos jornadas** | No se ve qué cambió de un relevamiento al siguiente. | Diferencias entre dos jornadas de la misma área: apareció, desapareció, cambió de lugar. | M |
| 14 | **Búsqueda más amplia** | Se busca por número o descripción. | Filtros combinados por responsable, número de serie, área y estado. | S |
| 15 | **Planificar jornadas** | Las jornadas se abren a mano. | Asignar ubicaciones a personas con fecha, y un listado "mis tareas". | M |
| 16 | **Avisos** | Hay que abrir la app para enterarse. | Notificaciones al abrirse o cerrarse una jornada de tu área y cuando hay discrepancias nuevas. | M |

## Etapa 4: que otras universidades puedan usarla

| # | Funcionalidad | Qué resuelve | Cómo | Tam. |
|---|---|---|---|---|
| 17 | **Importador con mapeo de columnas** | Cada universidad exporta Diaguita con columnas algo distintas. | Mapeo configurable y guardado por institución, con vista previa. | M |
| 18 | **Varias instituciones** | Hoy toda la base es de una universidad. | Decidir primero por ADR: una instalación por universidad (simple, los datos quedan en cada una) o una institución por fila con RLS. Requiere aval de cada institución y revisar la normativa. | L |
| 19 | **Altas, bajas y traslados con acta** | La app solo observa el catálogo. | Flujos de movimiento entre áreas con acta y aprobación. Depende de 6 y 7. | L |
| 20 | **Tablas propias de áreas, ubicaciones y empleados** | Hoy son texto dentro de los bienes. | Maestros normalizados. Es la base de 21 y mejora 17 y 19. | L |
| 21 | **Ubicaciones con jerarquía** | Lista plana de ubicaciones. | Edificio, piso, aula. Depende de 20. | M |

## Etapa 5: comodidades

| # | Funcionalidad | Cómo | Tam. |
|---|---|---|---|
| 22 | **Generar e imprimir etiquetas** QR o Code128 para bienes sin etiqueta o dañadas | Generador y hoja imprimible | M |
| 23 | **Fotos por bien** | Depende de la decisión pendiente: cuántas fotos, tamaño y dónde guardarlas | M |
| 24 | **Leer el número con la cámara (OCR)** para etiquetas dañadas | Reconocimiento de texto en el teléfono | M |
| 25 | **Hallazgo con ayuda de la foto** (sugerir clase y descripción) | Sugerencias a partir de bienes parecidos | M |
| 26 | **Mapa o plano de la ubicación** | Solo si Patrimonio tiene los planos | L |

## Dependencias

```
5 acta PDF ──> 6 firma ──> 19 altas, bajas y traslados
7 estado administrativo ──> 19
20 maestros ──> 21 jerarquía
17 importador ──> 18 varias instituciones
2 sin conexión: independiente, pero conviene hacerlo antes que 15 y 16
```

## Antes de empezar

- Cerrar la fase 6 (prueba completa en teléfonos y commit).
- Definir con Patrimonio quién abre y cierra jornadas: condiciona 3, 4 y 15.
- Para la etapa 4 hace falta el aval de cada institución y decidir la licencia del código (ver `estado-y-retomar.md`, sección 5).
- Cada funcionalidad nueva con base de datos sigue el patrón actual: migración, prueba SQL por rol en `supabase/tests/` y actualización de la bitácora.
