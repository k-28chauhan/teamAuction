import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary } from '@/lib/api/handler';
import { parseJson } from '@/lib/api/parse';
import { appError } from '@/lib/api/errors';
import { serializePlayer } from '@/lib/api/serialize';
import { requireUser, requireMaster } from '@/lib/auth/guards';
import { generateUniqueUsername, getUserByUsername, insertUser, listPlayers } from '@/lib/db/repo';

const positionSchema = z.enum(['GK', 'DEF', 'MID', 'FWD']);

const createSchema = z.object({
  username: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1, 'Enter a display name.'),
  position: positionSchema,
  rating: z.number().int().min(1).max(10).optional(),
  isGuest: z.boolean().optional(),
});

export const GET = withErrorBoundary(async (req: NextRequest) => {
  await requireUser();
  const includeGuests = req.nextUrl.searchParams.get('includeGuests') === 'true';
  const rows = await listPlayers(includeGuests);
  return NextResponse.json({ players: rows.map((row) => serializePlayer(row)) });
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const user = await requireUser();
  requireMaster(user);

  const data = await parseJson(req, createSchema);
  const isGuest = data.isGuest ?? false;

  let username: string;
  if (isGuest) {
    username = await generateUniqueUsername(data.displayName);
  } else {
    if (!data.username) {
      throw appError('VALIDATION_ERROR', 'Pick a username for this player.');
    }
    const existing = await getUserByUsername(data.username);
    if (existing) {
      throw appError('USERNAME_TAKEN', 'That username is already taken.');
    }
    username = data.username;
  }

  const row = await insertUser({
    username,
    displayName: data.displayName,
    position: data.position,
    rating: data.rating ?? 5,
    isGuest,
  });

  return NextResponse.json({ player: serializePlayer(row) }, { status: 201 });
});
