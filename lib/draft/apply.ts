import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { draftEvents, matchdayPlayers, matchdays, users } from '@/lib/db/schema';
import { appError } from '@/lib/api/errors';
import { reduce, type DraftAction, type DraftContext } from '@/lib/draft/engine';
import type { DraftState, Position, Team } from '@/lib/contract/types';

/**
 * The shared shape of every mutating draft endpoint (nominate/respond/bid):
 * lock the row, check the version, run the pure engine, persist the result,
 * and log every draft mutation as an event. See backend PRD sections 1 and 2.
 */
export async function runDraftMutation(args: {
  matchdayId: string;
  expectedVersion: number;
  actorId: string;
  buildAction: (ctx: DraftContext) => DraftAction;
}): Promise<{ state: DraftState; version: number }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(matchdays)
      .where(eq(matchdays.id, args.matchdayId))
      .for('update')
      .limit(1);

    if (!row) throw appError('NOT_FOUND', "That matchday doesn't exist.");
    if (row.status !== 'drafting') {
      throw appError('WRONG_PHASE', 'This draft is not currently active.');
    }
    if (row.method !== 'auction') {
      throw appError('WRONG_PHASE', 'This matchday uses a shuffle, not an auction.');
    }
    if (row.version !== args.expectedVersion) {
      throw appError('STALE_VERSION', 'Someone got there first — here is the latest state.', {
        state: row.state,
        version: row.version,
      });
    }

    const memberRows = await tx
      .select({ userId: matchdayPlayers.userId, position: matchdayPlayers.position, rating: users.rating })
      .from(matchdayPlayers)
      .innerJoin(users, eq(users.id, matchdayPlayers.userId))
      .where(eq(matchdayPlayers.matchdayId, args.matchdayId));

    const positionOf: Record<string, Position> = {};
    const ratingOf: Record<string, number> = {};
    for (const m of memberRows) {
      positionOf[m.userId] = m.position;
      ratingOf[m.userId] = m.rating;
    }

    const ctx: DraftContext = {
      teamSize: row.teamSize,
      roundOrder: row.roundOrder ?? ['GK', 'FWD', 'MID', 'DEF'],
      style: (row.style ?? 'price') as 'price' | 'open',
      positionOf,
      ratingOf,
    };

    const action = args.buildAction(ctx);
    const result = reduce(row.state, action, ctx);
    if (!result.ok) {
      throw appError(result.code, result.message);
    }

    const newVersion = row.version + 1;
    await tx
      .update(matchdays)
      .set({
        state: result.state,
        version: newVersion,
        status: result.state.phase === 'complete' ? 'teams_set' : row.status,
      })
      .where(eq(matchdays.id, args.matchdayId));

    // Mirror newly-assigned players (and what they cost) into matchday_players,
    // derived from the state diff rather than event payloads — correct for a
    // single pick and for an autofill dump alike.
    for (const team of ['A', 'B'] as Team[]) {
      const before = row.state.teams[team].playerIds;
      const after = result.state.teams[team].playerIds;
      const addedIds = after.filter((id) => !before.includes(id));
      if (addedIds.length === 0) continue;

      const pricePerPlayer =
        addedIds.length === 1
          ? row.state.teams[team].budget - result.state.teams[team].budget
          : 0; // autofill: zero cost, whole remaining pool at once

      await tx
        .update(matchdayPlayers)
        .set({ team, price: pricePerPlayer })
        .where(and(eq(matchdayPlayers.matchdayId, args.matchdayId), inArray(matchdayPlayers.userId, addedIds)));
    }

    const [{ next }] = await tx.execute<{ next: number }>(sql`
      select coalesce(max(sequence), 0) + 1 as next from ${draftEvents} where matchday_id = ${args.matchdayId}
    `);
    let sequence = next;
    for (const event of result.events) {
      await tx.insert(draftEvents).values({
        matchdayId: args.matchdayId,
        sequence: sequence++,
        actorId: args.actorId,
        type: event.type,
        payload: { team: event.team, ...event.payload },
      });
    }

    return { state: result.state, version: newVersion };
  });
}
