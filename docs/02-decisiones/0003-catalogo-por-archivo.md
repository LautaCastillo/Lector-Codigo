# ADR 0003: Catálogo por archivo, sin conexión a SIU Diaguita

- Estado: aceptada
- Fecha: 26/10/2026
- Decide: el autor del proyecto
- Plan: [`plan-v3-supabase-directo.md`](../plan-v3-supabase-directo.md), decisiones D5 y D6

## Contexto

El plan anterior estudiaba cuatro vías hacia SIU Diaguita: API REST oficial, importación de archivo, vistas de solo lectura y scraping. Ninguna tuvo respuesta del Centro de Cómputos, y conectar la app a SIU abre un riesgo de seguridad sobre un sistema institucional que el proyecto no controla. La importación de archivo ya está implementada y probada con 55 bienes.

## Decisión

- No hay conexión con SIU: ni API, ni scraping, ni vistas.
- El catálogo entra por un archivo CSV o XLSX descargado de Diaguita ("Bienes de uso"), que un administrador carga desde la app.
- Hay un único catálogo compartido en Supabase. Todos los teléfonos ven el mismo.
- La carga muestra un resumen previo (nuevos, modificados, sin cambios y errores) y deja constancia en la auditoría con la huella del archivo.
- Un bien **nunca se borra** del catálogo: los que no vienen en un archivo nuevo se marcan, no se eliminan.
- SIU nunca se modifica. Un bien nuevo o no identificado se registra como hallazgo y Patrimonio lo incorpora a SIU por su cuenta.

## Consecuencias

- El catálogo puede quedar desactualizado respecto de SIU hasta que alguien cargue un archivo nuevo. Hay que definir con Patrimonio cada cuánto.
- La lectura del archivo pasa del servidor al teléfono (o a una Edge Function si no hay una biblioteca de XLSX viable en React Native). La lógica de `backend/src/catalogo/siu-excel.ts` se traslada a `shared/`.
- Dejan de ser bloqueantes las consultas al Centro de Cómputos sobre la API de Diaguita.
