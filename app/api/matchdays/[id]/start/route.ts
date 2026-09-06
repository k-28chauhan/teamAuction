import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary } from '@/lib/api/handler';
import { appError } from '@/lib/api/errors';
import { serializeMatchday } from '@/lib/api/serialize';
import { requireUser, requireMaster } from '@/lib/auth/guards';
import { getMatchdayById, getMatchdayPlayers, startMatchday } from '@/lib/db/repo';

export const POST = withErrorBoundary(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const caller = await requireUser();
  requireMaster(caller);
  const { id } = await ctx.params;

  const row = await getMatchdayById(id);
  if (!row) throw appError('NOT_FOUND', "That matchday doesn't exist.");
  if (row.status !== 'setup') {
    throw appError('WRONG_PHASE', 'This matchday has already started.');
  }

  const updated = await startMatchday(id, row.state);
  const playersByUser = await getMatchdayPlayers(id);
  return NextResponse.json({ matchday: serializeMatchday(updated!, playersByUser) });
});
