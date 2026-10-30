# Integración con SIU Diaguita (solo lectura)

La app nunca escribe en SIU y no se conecta a SIU (plan v3, ADR 0003): ni API, ni scraping, ni vistas de base de datos. El catálogo entra solo por archivo:

1. Se exporta desde SIU el listado "Bienes de uso" o el informe de bienes por área (CSV o XLSX; SIU entrega el archivo con extensión `.xls`, pero es un `.xlsx`).
2. Un administrador lo carga desde la app, en "Importar catálogo": vista previa de lo que cambiaría y confirmación. Un archivo con solo algunas columnas actualiza solo esas columnas. Cada carga queda en el historial de cargas, visible para todas las cuentas.
3. El lector de archivos está en `shared/src/catalogo-archivo.ts` y la carga en la función SQL `importar_catalogo` (`supabase/migrations/`).

Pendiente con la Dirección de Patrimonio: pedir los maestros de Diaguita "Ubicaciones físicas" y "Áreas", por si se decide tener tablas propias de áreas y ubicaciones.

No se versionan credenciales de SIU. La cuenta `consulta.patrimonio` quedó expuesta en un chat y está pendiente de rotar.
