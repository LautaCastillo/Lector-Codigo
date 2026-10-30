# Esquema base (histórico)

Las tablas originales (`bien`, `usuario`, `relevamiento`, `exportacion`, auditoría, etc.) se crearon con Prisma cuando existía el backend NestJS, que el plan v3 retiró. Estos archivos se conservan solo para poder reconstruir la base desde cero:

1. Aplicar `migraciones/` en orden de nombre (SQL de Prisma).
2. Aplicar después `../migrations/` en orden de nombre (RLS, cuentas, catálogo, relevamientos, jornadas, historiales).

`schema.prisma` es la descripción del modelo original; el estado real manda sobre ella (ver `../migrations/`). Ya no se usa Prisma.
