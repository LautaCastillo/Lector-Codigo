-- Habilita Row Level Security sin políticas: bloquea el acceso por la API pública de Supabase (anon/authenticated).
-- El backend se conecta como `postgres`, que omite RLS.
ALTER TABLE "usuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bien" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "codigo_bien" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "relevamiento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "historial_cambio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exportacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
