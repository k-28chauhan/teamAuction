import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary } from '@/lib/api/handler';
import { parseJson } from '@/lib/api/parse';
import { appError } from '@/lib/api/errors';
import { serializeMatchday } from '@/lib/api/serialize';
import { requireUser, requireMaster } from '@/lib/auth/guards';
import { deleteMatchday, getMatchdayById, getMatchdayPlayers, updateMatchdaySetup } from '@/lib/db/repo';
import { createInitialAuctionState, STARTING_BID } from '@/lib/draft/engine';
import type { DraftState } from '@/lib/contract/types';

const patchSchema = z.object({
  style: z.enum(['price', 'open']).optional(),
  budget: z.number().int().min(1).optional(),
  leaderAId: z.string().uuid().optional(),
  leaderBId: z.string().uuid().optional(),
});

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const { id } = await ctx.params;
  const row = await getMatchdayById(id);
  if (!row) throw appError('NOT_FOUND', "That matchday doesn't exist.");

  const playersByUser = await getMatchdayPlayers(id);
  return NextResponse.json({ matchday: serializeMatchday(row, playersByUser) });
});

export const PATCH = withErrorBoundary(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const caller = await requireUser();
  requireMaster(caller);
  const { id } = await ctx.params;

  const row = await getMatchdayById(id);
  if (!row) throw appError('NOT_FOUND', "That matchday doesn't exist.");
  if (row.status !== 'setup') {
    throw appError('WRONG_PHASE', 'This matchday has already started — settings are locked.');
  }

  const patch = await parseJson(req, patchSchema);
  const playersByUser = await getMatchdayPlayers(id);
  const leaderAId = patch.leaderAId ?? row.leaderAId!;
  const leaderBId = patch.leaderBId ?? row.leaderBId!;

  if (!playersByUser.has(leaderAId) || !playersByUser.has(leaderBId)) {
    throw appError('VALIDATION_ERROR', 'Leaders must be part of this matchday.');
  }
  if (leaderAId === leaderBId) {
    throw appError('VALIDATION_ERROR', 'The two leaders must be different people.');
  }

  const patchToApply: Parameters<typeof updateMatchdaySetup>[1] = {
    style: patch.style ?? row.style,
    budget: patch.budget ?? row.budget,
    leaderAId,
    leaderBId,
  };

  if (row.method === 'auction') {
    const poolIds = [...playersByUser.keys()].filter((uid) => uid !== leaderAId && uid !== leaderBId);

    const state: DraftState = createInitialAuctionState({
      leaderAId,
      leaderBId,
      poolIds,
      budget: patchToApply.budget ?? Math.ceil(row.teamSize * STARTING_BID * 1.5),
      teamSize: row.teamSize,
    });
    patchToApply.state = state;
  }

  const updated = await updateMatchdaySetup(id, patchToApply);
  return NextResponse.json({ matchday: serializeMatchday(updated!, playersByUser) });
});

export const DELETE = withErrorBoundary(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const caller = await requireUser();
  requireMaster(caller);
  const { id } = await ctx.params;

  const row = await getMatchdayById(id);
  if (!row) throw appError('NOT_FOUND', "That matchday doesn't exist.");
  if (row.status !== 'completed' && row.status !== 'cancelled') {
    throw appError('WRONG_PHASE', 'Only a completed or cancelled matchday can be deleted — cancel it first.');
  }

  await deleteMatchday(id);
  return NextResponse.json({ ok: true });
});
