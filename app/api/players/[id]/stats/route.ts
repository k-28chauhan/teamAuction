import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary } from '@/lib/api/handler';
import { appError } from '@/lib/api/errors';
import { requireUser } from '@/lib/auth/guards';
import { getPlayerMatches, getPlayerStats, getUserById } from '@/lib/db/repo';

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const { id } = await ctx.params;

  const player = await getUserById(id);
  if (!player) throw appError('NOT_FOUND', "That player doesn't exist.");

  const [stats, matches] = await Promise.all([getPlayerStats(id), getPlayerMatches(id)]);

  return NextResponse.json({
    stats,
    matches: matches.map((m) => ({
      matchdayId: m.matchdayId,
      playedAt: m.playedAt,
      team: m.team,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
    })),
  });
});
