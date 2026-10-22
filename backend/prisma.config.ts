import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // El valor de respaldo permite `prisma generate` sin base (CI); migrar exige DATABASE_URL real.
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://sin-configurar' },
});
