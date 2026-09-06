import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary } from '@/lib/api/handler';
import { appError } from '@/lib/api/errors';
import { requireUser, requireMaster } from '@/lib/auth/guards';
import { cancelMatchday, getMatchdayById } from '@/lib/db/repo';

export const POST = withErrorBoundary(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const caller = await requireUser();
  requireMaster(caller);
  const { id } = await ctx.params;

  const row = await getMatchdayById(id);
  if (!row) throw appError('NOT_FOUND', "That matchday doesn't exist.");
  if (row.status === 'completed' || row.status === 'cancelled') {
    throw appError('WRONG_PHASE', 'This matchday is already finished.');
  }

  await cancelMatchday(id);
  return NextResponse.json({ ok: true });
});
