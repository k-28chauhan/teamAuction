import { NextResponse } from 'next/server';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireUser } from '@/lib/auth/guards';
import { getActiveMatchday, getMatchdayPlayers } from '@/lib/db/repo';
import { serializeMatchday } from '@/lib/api/serialize';

export const GET = withErrorBoundary(async () => {
  await requireUser();
  const row = await getActiveMatchday();
  if (!row) return NextResponse.json({ matchday: null });

  const playersByUser = await getMatchdayPlayers(row.id);
  return NextResponse.json({ matchday: serializeMatchday(row, playersByUser) });
});
