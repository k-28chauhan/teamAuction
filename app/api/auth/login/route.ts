import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary } from '@/lib/api/handler';
import { parseJson } from '@/lib/api/parse';
import { appError } from '@/lib/api/errors';
import { serializePlayer } from '@/lib/api/serialize';
import { getUserByUsername } from '@/lib/db/repo';
import { setSessionCookie } from '@/lib/auth/session';
import { verifyPin } from '@/lib/auth/pin';
import { recordPinAttempt, clearPinAttempts } from '@/lib/auth/rate-limit';

const schema = z.object({
  username: z.string().trim().min(1, 'Enter a username.'),
  pin: z.string().trim().optional(),
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { username, pin } = await parseJson(req, schema);

  const user = await getUserByUsername(username);
  if (!user || !user.isActive) {
    throw appError('UNKNOWN_USERNAME', "That username isn't on the roster.");
  }

  if (!user.isMaster) {
    await setSessionCookie({ userId: user.id, username: user.username, isMaster: user.isMaster });
    return NextResponse.json({ user: serializePlayer(user) });
  }

  if (!pin) {
    throw appError('PIN_REQUIRED', 'Enter the master PIN.');
  }

  const { allowed } = recordPinAttempt(user.username);
  if (!allowed) {
    throw appError('BAD_PIN', 'Too many attempts — wait a few minutes and try again.');
  }

  const validPin = user.masterPinHash ? await verifyPin(pin, user.masterPinHash) : false;
  if (!validPin) {
    throw appError('BAD_PIN', "That PIN doesn't match.");
  }

  clearPinAttempts(user.username);
  await setSessionCookie({ userId: user.id, username: user.username, isMaster: user.isMaster });
  return NextResponse.json({ user: serializePlayer(user) });
});
