import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { withErrorBoundary } from '@/lib/api/handler';
import { parseJson } from '@/lib/api/parse';
import { appError } from '@/lib/api/errors';
import { serializeMatchday } from '@/lib/api/serialize';
import { requireUser, requireMaster } from '@/lib/auth/guards';
import { getActiveMatchday, getMatchdayPlayers, insertMatchday, listMatchdaysPage } from '@/lib/db/repo';
import { createInitialAuctionState, STARTING_BID } from '@/lib/draft/engine';
import { findLegalSplits } from '@/lib/draft/splits';
import type { DraftState, Position } from '@/lib/contract/types';

const positionSchema = z.enum(['GK', 'FWD', 'MID', 'DEF']);

const createSchema = z.object({
  playerIds: z.array(z.string().uuid()).min(4, 'Pick at least 4 players.'),
  leaderAId: z.string().uuid(),
  leaderBId: z.string().uuid(),
  method: z.enum(['auction', 'shuffle']),
  style: z.enum(['price', 'open']).optional(),
  budget: z.number().int().min(1).optional(),
});

export const GET = withErrorBoundary(async (req: NextRequest) => {
  await requireUser();
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 20, 50);
  const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined;

  const { rows, nextCursor } = await listMatchdaysPage(limit, cursor);
  const withPlayers = await Promise.all(
    rows.map(async (row) => serializeMatchday(row, await getMatchdayPlayers(row.id)))
  );
  return NextResponse.json({ matchdays: withPlayers, nextCursor });
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const caller = await requireUser();
  requireMaster(caller);

  const data = await parseJson(req, createSchema);

  if (data.playerIds.length % 2 !== 0) {
    throw appError('ODD_PLAYER_COUNT', 'The squad for a matchday must be an even number of players.');
  }
  if (!data.playerIds.includes(data.leaderAId) || !data.playerIds.includes(data.leaderBId)) {
    throw appError('VALIDATION_ERROR', 'Both leaders must be part of the available players.');
  }
  if (data.leaderAId === data.leaderBId) {
    throw appError('VALIDATION_ERROR', 'The two leaders must be different people.');
  }

  const active = await getActiveMatchday();
  if (active) {
    throw appError('ACTIVE_MATCHDAY_EXISTS', 'Finish or cancel the current matchday before starting another.');
  }

  const rows = await db.select().from(users).where(inArray(users.id, data.playerIds));
  if (rows.length !== data.playerIds.length || rows.some((r) => !r.isActive)) {
    throw appError('VALIDATION_ERROR', 'One of those players is no longer on the active roster.');
  }

  const teamSize = data.playerIds.length / 2;
  const positionOf: Record<string, Position> = {};
  for (const row of rows) {
    positionOf[row.id] = row.position;
  }
  const poolIds = data.playerIds.filter((id) => id !== data.leaderAId && id !== data.leaderBId);

  let state: DraftState;
  let style: 'price' | 'open' | null = null;
  let budget: number | null = null;

  if (data.method === 'auction') {
    style = data.style ?? 'price';
    // Enough for every player at the flat starting bid, plus 50% headroom to actually bid.
    budget = data.budget ?? Math.ceil(teamSize * STARTING_BID * 1.5);
    state = createInitialAuctionState({
      leaderAId: data.leaderAId,
      leaderBId: data.leaderBId,
      poolIds,
      budget,
      teamSize,
    });
  } else {
    const splitPlayers = rows.map((r) => ({ id: r.id, position: positionOf[r.id]!, rating: r.rating }));
    const legalSplits = findLegalSplits(splitPlayers);
    if (legalSplits.length === 0) {
      throw appError(
        'NO_LEGAL_SPLIT',
        'No fair split is possible with this squad — you may need a second keeper.'
      );
    }
    state = {
      phase: 'complete',
      turn: 'A',
      currentRound: null,
      poolIds,
      teams: {
        A: { leaderId: data.leaderAId, budget: 0, playerIds: [data.leaderAId] },
        B: { leaderId: data.leaderBId, budget: 0, playerIds: [data.leaderBId] },
      },
      nomination: null,
      log: [{ text: 'Ready to shuffle.', at: new Date().toISOString() }],
      pendingSplit: null,
    };
  }

  const matchday = await insertMatchday({
    status: 'setup',
    method: data.method,
    style,
    budget,
    roundOrder: null,
    teamSize,
    leaderAId: data.leaderAId,
    leaderBId: data.leaderBId,
    state,
    createdBy: caller.id,
    playerIds: data.playerIds,
    positionOf,
  });

  const playersByUser = await getMatchdayPlayers(matchday.id);
  return NextResponse.json({ matchday: serializeMatchday(matchday, playersByUser) }, { status: 201 });
});
