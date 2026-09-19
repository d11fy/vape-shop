import path from 'node:path';

// Same environment the app runs with: `.env.local` first, then `.env`.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    /* optional */
  }
}

// Pure unit tests must not depend on a configured secret.
process.env.AUTH_SECRET ??= 'test-secret-that-is-long-enough-for-hmac-usage-1234';
