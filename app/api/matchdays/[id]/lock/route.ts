import { and, eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { draftEvents, matchdayPlayers, matchdays } from '@/lib/db/schema';
import { withErrorBoundary } from '@/lib/api/handler';
import { parseJson } from '@/lib/api/parse';
import { appError } from '@/lib/api/errors';
import { requireUser, requireLeaderTeam } from '@/lib/auth/guards';
import { getMatchdayPlayers } from '@/lib/db/repo';
import { serializeMatchday } from '@/lib/api/serialize';

const schema = z.object({ splitId: z.string() });

export const POST = withErrorBoundary(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);

  const locked = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(matchdays).where(eq(matchdays.id, id)).for('update').limit(1);
    if (!row) throw appError('NOT_FOUND', "That matchday doesn't exist.");
    if (!user.isMaster) requireLeaderTeam(row, user);
    if (row.method !== 'shuffle') throw appError('WRONG_PHASE', 'This matchday uses an auction, not a shuffle.');
    if (row.status !== 'drafting') throw appError('WRONG_PHASE', 'There is nothing to lock right now.');

    const pending = row.state.pendingSplit;
    if (!pending || pending.splitId !== body.splitId) {
      throw appError('STALE_VERSION', "That split isn't current anymore — shuffle again.", {
        state: row.state,
        version: row.version,
      });
    }

    const nextState = {
      ...row.state,
      teams: {
        A: { ...row.state.teams.A, playerIds: pending.teamAIds },
        B: { ...row.state.teams.B, playerIds: pending.teamBIds },
      },
      pendingSplit: null,
      log: [{ text: 'Teams locked in.', at: new Date().toISOString() }, ...row.state.log].slice(0, 50),
    };

    const [updatedRow] = await tx
      .update(matchdays)
      .set({ status: 'teams_set', state: nextState, version: row.version + 1 })
      .where(eq(matchdays.id, id))
      .returning();

    await tx
      .update(matchdayPlayers)
      .set({ team: 'A' })
      .where(and(eq(matchdayPlayers.matchdayId, id), inArray(matchdayPlayers.userId, pending.teamAIds)));
    await tx
      .update(matchdayPlayers)
      .set({ team: 'B' })
      .where(and(eq(matchdayPlayers.matchdayId, id), inArray(matchdayPlayers.userId, pending.teamBIds)));

    await tx.insert(draftEvents).values({
      matchdayId: id,
      sequence: row.version + 1,
      actorId: user.id,
      type: 'lock',
      payload: { splitId: body.splitId },
    });

    return updatedRow!;
  });

  const playersByUser = await getMatchdayPlayers(id);
  return NextResponse.json({ matchday: serializeMatchday(locked, playersByUser) });
});
