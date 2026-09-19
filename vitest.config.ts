import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Forward slashes: Vite matches aliases against POSIX-style ids, even on Windows.
const here = (relative: string) =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), relative).replaceAll('\\', '/');

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(here(file));
  } catch {
    /* optional */
  }
}

// Database tests import the app's env module, which refuses to load without a
// database — so on a fresh checkout they are left out rather than crashing.
const hasDatabase = Boolean(process.env.DATABASE_URL);
if (!hasDatabase) {
  console.warn('DATABASE_URL is not set — skipping tests/integration.');
}

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${here('src')}/$1` },
      // `server-only` throws outside a React Server Component bundle; tests run
      // server code directly, so it becomes a no-op here.
      { find: /^server-only$/, replacement: here('tests/support/server-only.ts') },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: hasDatabase ? [] : ['tests/integration/**'],
    setupFiles: ['tests/support/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
  },
});
