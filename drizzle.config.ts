import { defineConfig } from 'drizzle-kit';

// Locally the URL comes from .env; on Netlify it is a site environment variable.
try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
