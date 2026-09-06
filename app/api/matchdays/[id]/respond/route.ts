import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary } from '@/lib/api/handler';
import { parseJson } from '@/lib/api/parse';
import { appError } from '@/lib/api/errors';
import { requireUser, requireLeaderTeam } from '@/lib/auth/guards';
import { getMatchdayById } from '@/lib/db/repo';
import { runDraftMutation } from '@/lib/draft/apply';
import { currentActor } from '@/lib/draft/engine';

const schema = z.object({
  version: z.number().int(),
  action: z.enum(['take', 'pass']),
});

export const POST = withErrorBoundary(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const matchday = await getMatchdayById(id);
  if (!matchday) throw appError('NOT_FOUND', "That matchday doesn't exist.");
  const team = user.isMaster ? null : requireLeaderTeam(matchday, user);
  const body = await parseJson(req, schema);

  const actingTeam = team ?? currentActor(matchday.state);
  if (!actingTeam) throw appError('WRONG_PHASE', 'There is nothing to respond to right now.');

  const { state, version } = await runDraftMutation({
    matchdayId: id,
    expectedVersion: body.version,
    actorId: user.id,
    buildAction: () => ({ kind: 'respond', team: actingTeam, action: body.action }),
  });

  return NextResponse.json({ state, version });
});
