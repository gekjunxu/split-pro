import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { defineConfig, env } from 'prisma/config';

if (existsSync('.env')) {
  loadEnvFile('.env');
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  experimental: {
    externalTables: true,
  },
  tables: {
    external: ['cron.job', 'cron.job_run_details'],
  },
});
