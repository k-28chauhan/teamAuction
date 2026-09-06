import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/db/schema';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

/**
 * A single pooled connection, reused across hot reloads and route handler
 * invocations. DATABASE_URL must point at a pooled connection string when
 * deploying to a serverless target (see AGENTS/PRD section 6).
 */
const client =
  globalForDb.pgClient ??
  postgres(requireEnv('DATABASE_URL'), {
    max: process.env.NODE_ENV === 'production' ? 10 : 5,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
