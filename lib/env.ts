const REQUIRED = ['DATABASE_URL', 'AUTH_SECRET', 'NODE_ENV'] as const;

/** Fail loudly at server startup rather than at the first request. */
export function assertEnv(): void {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. Set them in .env.local (see .env.example).`
    );
  }
}
