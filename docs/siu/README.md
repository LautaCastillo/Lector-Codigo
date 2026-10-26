# Integración con SIU Diaguita (solo lectura)

La app nunca escribe en SIU. Las vías de acceso, en orden de preferencia según el plan vigente (`../plan-de-mejora-login-auditoria-siu.md`):

1. **API REST oficial de Diaguita:** a la espera de la respuesta del Centro de Cómputos (usuario exclusivo, versión y endpoints de bienes). Ver `../consultas-unsa.md`.
2. **Importación de archivo:** camino garantizado y único implementado. Se exporta el listado "Bienes de uso" desde SIU y se carga con `npm run importar -w backend -- ruta/al/archivo.xls`. El código está en `backend/src/catalogo/` (`siu-excel.ts`, `catalogo.service.ts`, `importar-cli.ts`).
3. **Vistas de solo lectura o exportación programada:** a definir con el Centro de Cómputos.
4. **Scraping de la interfaz web (Toba):** contingencia, sin desarrollo activo y sin carpeta `backend/src/siu/`. Solo se desarrollaría por pedido expreso. Sería frágil si SIU cambia identificadores.

No se versionan credenciales de SIU. La cuenta `consulta.patrimonio` quedó expuesta en un chat y está pendiente de rotar.
