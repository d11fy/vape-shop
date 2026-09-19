import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer auto-loads .env files — do it explicitly.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // file absent — fine, environment may be provided by the host
  }
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    // Optional here so `prisma generate` (run on `npm install`) works on a fresh
    // clone before `.env` exists; migrate and seed still need it and say so.
    url: process.env.DATABASE_URL,
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    // `server-only` guards the service layer; the react-server condition lets
    // the seed import those modules from plain Node.
    seed: 'node --conditions=react-server --import tsx prisma/seed.ts',
  },
});
