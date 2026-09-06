import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary } from '@/lib/api/handler';
import { parseJson } from '@/lib/api/parse';
import { appError } from '@/lib/api/errors';
import { serializePlayer } from '@/lib/api/serialize';
import { requireUser, requireMaster } from '@/lib/auth/guards';
import { getUserById, updateUser } from '@/lib/db/repo';

const patchSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  position: z.enum(['GK', 'DEF', 'MID', 'FWD']).optional(),
  rating: z.number().int().min(1).max(10).optional(),
  isGuest: z.boolean().optional(),
});

export const PATCH = withErrorBoundary(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  requireMaster(user);
  const { id } = await ctx.params;

  const existing = await getUserById(id);
  if (!existing) throw appError('NOT_FOUND', "That player doesn't exist.");

  const patch = await parseJson(req, patchSchema);
  const row = await updateUser(id, patch);
  return NextResponse.json({ player: serializePlayer(row!) });
});

export const DELETE = withErrorBoundary(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  requireMaster(user);
  const { id } = await ctx.params;

  const existing = await getUserById(id);
  if (!existing) throw appError('NOT_FOUND', "That player doesn't exist.");

  await updateUser(id, { isActive: false });
  return NextResponse.json({ ok: true });
});
