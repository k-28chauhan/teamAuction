import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary } from '@/lib/api/handler';
import { parseJson } from '@/lib/api/parse';
import { appError } from '@/lib/api/errors';
import { requireUser, requireMaster } from '@/lib/auth/guards';
import { getUserById, transferMaster } from '@/lib/db/repo';
import { hashPin, DEFAULT_MASTER_PIN } from '@/lib/auth/pin';

const schema = z.object({
  pin: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'The PIN must be 4 digits.')
    .optional(),
});

export const POST = withErrorBoundary(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const caller = await requireUser();
  requireMaster(caller);
  const { id } = await ctx.params;

  const target = await getUserById(id);
  if (!target || !target.isActive) {
    throw appError('NOT_FOUND', "That player doesn't exist.");
  }
  if (target.isGuest) {
    throw appError('FORBIDDEN', "A guest can't become master.");
  }

  const { pin } = await parseJson(req, schema);
  const newPinHash = await hashPin(pin ?? DEFAULT_MASTER_PIN);

  await transferMaster(caller.id, target.id, newPinHash);
  return NextResponse.json({ ok: true });
});
