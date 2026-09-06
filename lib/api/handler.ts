import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/api/errors';
import { logEvent } from '@/lib/api/logger';

type RouteHandler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<NextResponse>;

/**
 * Wraps a route handler so every failure — ours or an unexpected one — comes
 * back as the contract's error shape, and every request is logged once with
 * its outcome. A raw Postgres error or stack trace never reaches the client.
 */
export function withErrorBoundary<Ctx = { params: Promise<Record<string, string>> }>(
  handler: RouteHandler<Ctx>
): RouteHandler<Ctx> {
  return async (req, ctx) => {
    const requestId = randomUUID();
    const start = Date.now();
    try {
      const response = await handler(req, ctx);
      logEvent({
        requestId,
        route: req.nextUrl.pathname,
        method: req.method,
        outcome: 'ok',
        durationMs: Date.now() - start,
      });
      return response;
    } catch (err) {
      if (err instanceof AppError) {
        logEvent({
          requestId,
          route: req.nextUrl.pathname,
          method: req.method,
          outcome: 'error',
          code: err.code,
          durationMs: Date.now() - start,
        });
        return NextResponse.json(
          { error: { code: err.code, message: err.message }, ...err.extra },
          { status: err.status }
        );
      }

      console.error(`[${requestId}] unhandled error on ${req.method} ${req.nextUrl.pathname}`, err);
      logEvent({
        requestId,
        route: req.nextUrl.pathname,
        method: req.method,
        outcome: 'error',
        code: 'INTERNAL',
        durationMs: Date.now() - start,
      });
      return NextResponse.json(
        { error: { code: 'INTERNAL', message: 'Something went wrong on our end. Try again in a moment.' } },
        { status: 500 }
      );
    }
  };
}
