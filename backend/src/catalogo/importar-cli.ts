import { readFile } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogoService } from './catalogo.service.js';
import { leerExcelSiu } from './siu-excel.js';

// Uso: npm run importar -w backend -- ruta/al/listado.xls   (lee DATABASE_URL de backend/.env)
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const ruta = process.argv[2];
if (!ruta) {
  console.error('Falta la ruta del listado de SIU (Bienes de uso).');
  process.exit(1);
}

const prisma = new PrismaService();
try {
  const { bienes, omitidas } = await leerExcelSiu(await readFile(ruta));
  const { creados, actualizados } = await new CatalogoService(prisma).importar(bienes);
  console.log(`Leídos ${bienes.length} bienes (${omitidas} filas omitidas). Creados: ${creados}. Actualizados: ${actualizados}.`);
} finally {
  await prisma.$disconnect();
}
