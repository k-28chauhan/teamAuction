import { NextResponse } from 'next/server';
import { withErrorBoundary } from '@/lib/api/handler';
import { clearSessionCookie } from '@/lib/auth/session';

export const POST = withErrorBoundary(async () => {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
});
