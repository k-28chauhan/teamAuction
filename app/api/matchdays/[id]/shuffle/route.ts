import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { matchdayPlayers, matchdays, users } from '@/lib/db/schema';
import { withErrorBoundary } from '@/lib/api/handler';
import { appError } from '@/lib/api/errors';
import { requireUser, requireLeaderTeam } from '@/lib/auth/guards';
import { findLegalSplits } from '@/lib/draft/splits';

export const POST = withErrorBoundary(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(matchdays).where(eq(matchdays.id, id)).for('update').limit(1);
    if (!row) throw appError('NOT_FOUND', "That matchday doesn't exist.");
    if (!user.isMaster) requireLeaderTeam(row, user);
    if (row.method !== 'shuffle') throw appError('WRONG_PHASE', 'This matchday uses an auction, not a shuffle.');
    if (row.status !== 'drafting') throw appError('WRONG_PHASE', 'Start the matchday before shuffling teams.');

    const memberRows = await tx
      .select({ id: matchdayPlayers.userId, position: matchdayPlayers.position, rating: users.rating })
      .from(matchdayPlayers)
      .innerJoin(users, eq(users.id, matchdayPlayers.userId))
      .where(eq(matchdayPlayers.matchdayId, id));
    const splitPlayers = memberRows;

    const legalSplits = findLegalSplits(splitPlayers);
    if (legalSplits.length === 0) {
      throw appError('NO_LEGAL_SPLIT', 'No fair split is possible with this squad.');
    }

    const bestGap = legalSplits[0]!.ratingGap;
    const nearBest = legalSplits.filter((s) => s.ratingGap <= bestGap + 1);
    const chosen = nearBest[Math.floor(Math.random() * nearBest.length)]!;
    const splitId = randomUUID();

    const nextState = {
      ...row.state,
      pendingSplit: { splitId, teamAIds: chosen.teamAIds, teamBIds: chosen.teamBIds },
      log: [{ text: 'A new split was proposed.', at: new Date().toISOString() }, ...row.state.log].slice(0, 50),
    };

    await tx
      .update(matchdays)
      .set({ state: nextState, version: row.version + 1 })
      .where(eq(matchdays.id, id));

    return { split: chosen, splitId, diff: chosen.ratingGap, legalCount: legalSplits.length };
  });

  return NextResponse.json(result);
});
