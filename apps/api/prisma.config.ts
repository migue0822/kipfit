import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `prisma generate` no necesita base de datos; el valor por defecto permite generar en CI.
const urlDesarrollo = 'postgresql://kip:kip@localhost:5434/kipfit';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? urlDesarrollo },
});
