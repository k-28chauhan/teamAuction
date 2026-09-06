import { NextResponse } from 'next/server';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireUser } from '@/lib/auth/guards';
import { getLeaderboard } from '@/lib/db/repo';
import { serializePlayer } from '@/lib/api/serialize';

export const GET = withErrorBoundary(async () => {
  await requireUser();
  const rows = await getLeaderboard();
  return NextResponse.json({
    rows: rows.map(({ player, stats }) => ({ player: serializePlayer(player), stats })),
  });
});
