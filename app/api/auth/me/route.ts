import { NextResponse } from 'next/server';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireUser } from '@/lib/auth/guards';
import { computePermissions, serializePlayer } from '@/lib/api/serialize';

export const GET = withErrorBoundary(async () => {
  const user = await requireUser();
  return NextResponse.json({
    user: serializePlayer(user),
    permissions: computePermissions({ isMaster: user.isMaster, team: null, canAct: false }),
  });
});
