import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { appError } from '@/lib/api/errors';

export async function parseJson<T>(req: NextRequest, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw appError('VALIDATION_ERROR', "We couldn't read that request.");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw appError('VALIDATION_ERROR', first ? `${first.path.join('.')}: ${first.message}` : 'That form has a problem.');
  }
  return result.data;
}
