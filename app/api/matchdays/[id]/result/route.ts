import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary } from '@/lib/api/handler';
import { parseJson } from '@/lib/api/parse';
import { appError } from '@/lib/api/errors';
import { requireUser, requireLeaderTeam, requireMaster } from '@/lib/auth/guards';
import { getMatchdayById, getMatchdayPlayers, recordResult } from '@/lib/db/repo';
import { serializeMatchday } from '@/lib/api/serialize';

const schema = z.object({
  scoreA: z.number().int().min(0),
  scoreB: z.number().int().min(0),
  // Optional: who scored. Omit entirely to leave any previously-recorded
  // scorers untouched (e.g. when just correcting the score); pass an array
  // (empty included) to replace them outright.
  scorers: z
    .array(
      z.object({
        userId: z.string().uuid(),
        goals: z.number().int().min(1),
      })
    )
    .optional(),
});

export const POST = withErrorBoundary(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const matchday = await getMatchdayById(id);
  if (!matchday) throw appError('NOT_FOUND', "That matchday doesn't exist.");

  if (matchday.status === 'completed') {
    requireMaster(user); // "remains editable afterwards by the master only"
  } else if (matchday.status === 'teams_set') {
    if (!user.isMaster) requireLeaderTeam(matchday, user);
  } else {
    throw appError('WRONG_PHASE', 'Teams need to be set before you can record a score.');
  }

  const { scoreA, scoreB, scorers } = await parseJson(req, schema);
  const playersByUser = await getMatchdayPlayers(id);

  if (scorers) {
    const seen = new Set<string>();
    let sumA = 0;
    let sumB = 0;
    for (const s of scorers) {
      if (seen.has(s.userId)) {
        throw appError('VALIDATION_ERROR', 'Each player can only be listed once.');
      }
      seen.add(s.userId);

      const entry = playersByUser.get(s.userId);
      if (!entry || !entry.team) {
        throw appError('VALIDATION_ERROR', 'A goal scorer must be one of the two locked-in teams.');
      }
      if (entry.team === 'A') sumA += s.goals;
      else sumB += s.goals;
    }
    if (sumA !== scoreA || sumB !== scoreB) {
      throw appError(
        'VALIDATION_ERROR',
        `Goal scorers need to add up to the score you entered — Team A: ${sumA} of ${scoreA}, Team B: ${sumB} of ${scoreB}.`
      );
    }
  }

  const updated = await recordResult(id, scoreA, scoreB, scorers);
  const refreshedPlayersByUser = scorers ? await getMatchdayPlayers(id) : playersByUser;
  return NextResponse.json({ matchday: serializeMatchday(updated!, refreshedPlayersByUser) });
});
