import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { appError } from '@/lib/api/errors';
import { readSessionFromCookies, setSessionCookie } from '@/lib/auth/session';
import type { Position, Team } from '@/lib/contract/types';

export type AuthedUser = {
  id: string;
  username: string;
  displayName: string;
  position: Position;
  rating: number;
  isMaster: boolean;
  isGuest: boolean;
  isActive: boolean;
};

/** Reads the session cookie, re-loads the user from the DB (never trusting the token's claims), and slides the cookie's expiry. */
export async function requireUser(): Promise<AuthedUser> {
  const session = await readSessionFromCookies();
  if (!session) throw appError('UNAUTHENTICATED', 'Log in to continue.');

  const [row] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!row || !row.isActive) {
    throw appError('UNAUTHENTICATED', 'Log in to continue.');
  }

  // isMaster is re-read from the DB above; refresh the sliding cookie with the current facts.
  await setSessionCookie({ userId: row.id, username: row.username, isMaster: row.isMaster });

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    position: row.position,
    rating: row.rating,
    isMaster: row.isMaster,
    isGuest: row.isGuest,
    isActive: row.isActive,
  };
}

export function requireMaster(user: AuthedUser): void {
  if (!user.isMaster) {
    throw appError('FORBIDDEN', 'Only the master can do that.');
  }
}

export function leaderTeamOf(
  matchday: { leaderAId: string | null; leaderBId: string | null },
  userId: string
): Team | null {
  if (matchday.leaderAId === userId) return 'A';
  if (matchday.leaderBId === userId) return 'B';
  return null;
}

/** Leader-scoped actions: the caller must be leaderA or leaderB on this specific matchday. */
export function requireLeaderTeam(
  matchday: { leaderAId: string | null; leaderBId: string | null },
  user: AuthedUser
): Team {
  const team = leaderTeamOf(matchday, user.id);
  if (!team) throw appError('FORBIDDEN', "You're not a leader for this matchday.");
  return team;
}
