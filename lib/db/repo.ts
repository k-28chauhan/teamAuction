import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { matchdayPlayers, matchdays, users } from '@/lib/db/schema';
import type { DraftState, Position } from '@/lib/contract/types';
import type { UserRow } from '@/lib/api/serialize';

export async function getUserById(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function getUserByUsername(username: string) {
  const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return row ?? null;
}

export async function listPlayers(includeGuests: boolean) {
  const condition = includeGuests ? eq(users.isActive, true) : and(eq(users.isActive, true), eq(users.isGuest, false));
  return db.select().from(users).where(condition).orderBy(users.displayName);
}

function slugifyUsername(displayName: string): string {
  const base = displayName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  return base.length > 0 ? base : 'guest';
}

/** Generates a unique username from a display name, appending a numeric suffix on collision. */
export async function generateUniqueUsername(displayName: string): Promise<string> {
  const base = slugifyUsername(displayName);
  let candidate = base;
  let suffix = 1;
  while (await getUserByUsername(candidate)) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  return candidate;
}

export async function insertUser(data: {
  username: string;
  displayName: string;
  position: Position;
  rating: number;
  isGuest: boolean;
  isMaster?: boolean;
  masterPinHash?: string | null;
}) {
  const [row] = await db
    .insert(users)
    .values({
      username: data.username,
      displayName: data.displayName,
      position: data.position,
      rating: data.rating,
      isGuest: data.isGuest,
      isMaster: data.isMaster ?? false,
      masterPinHash: data.masterPinHash ?? null,
    })
    .returning();
  return row;
}

export async function updateUser(
  id: string,
  patch: Partial<{ displayName: string; position: Position; rating: number; isActive: boolean; isGuest: boolean }>
) {
  const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  return row ?? null;
}

export async function transferMaster(fromId: string, toId: string, newPinHash: string) {
  return db.transaction(async (tx) => {
    await tx.update(users).set({ isMaster: false, masterPinHash: null }).where(eq(users.id, fromId));
    const [row] = await tx
      .update(users)
      .set({ isMaster: true, masterPinHash: newPinHash })
      .where(eq(users.id, toId))
      .returning();
    return row;
  });
}

export async function getPlayerStats(userId: string) {
  const rows = await db.execute<{
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goals_for: number;
    goals_against: number;
  }>(sql`
    select
      count(*)::int as played,
      count(*) filter (where
        (mp.team = 'A' and m.score_a > m.score_b) or
        (mp.team = 'B' and m.score_b > m.score_a)
      )::int as won,
      count(*) filter (where m.score_a = m.score_b)::int as drawn,
      count(*) filter (where
        (mp.team = 'A' and m.score_a < m.score_b) or
        (mp.team = 'B' and m.score_b < m.score_a)
      )::int as lost,
      coalesce(sum(case when mp.team = 'A' then m.score_a else m.score_b end), 0)::int as goals_for,
      coalesce(sum(case when mp.team = 'A' then m.score_b else m.score_a end), 0)::int as goals_against
    from ${matchdayPlayers} mp
    join ${matchdays} m on m.id = mp.matchday_id
    where mp.user_id = ${userId}
      and m.status = 'completed'
      and mp.team is not null
  `);

  const row = rows[0] as
    | { played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number }
    | undefined;

  const played = row?.played ?? 0;
  const won = row?.won ?? 0;
  const drawn = row?.drawn ?? 0;
  const lost = row?.lost ?? 0;
  const goalsFor = row?.goals_for ?? 0;
  const goalsAgainst = row?.goals_against ?? 0;

  return {
    played,
    won,
    drawn,
    lost,
    goalsFor,
    goalsAgainst,
    winRate: played > 0 ? Math.round((won / played) * 100) : 0,
  };
}

export async function getPlayerMatches(userId: string) {
  const rows = await db
    .select({
      matchdayId: matchdays.id,
      playedAt: matchdays.playedAt,
      team: matchdayPlayers.team,
      scoreA: matchdays.scoreA,
      scoreB: matchdays.scoreB,
    })
    .from(matchdayPlayers)
    .innerJoin(matchdays, eq(matchdays.id, matchdayPlayers.matchdayId))
    .where(and(eq(matchdayPlayers.userId, userId), eq(matchdays.status, 'completed')))
    .orderBy(desc(matchdays.playedAt));

  return rows;
}

export async function getLeaderboard() {
  const players = await db.select().from(users).where(and(eq(users.isActive, true), eq(users.isGuest, false)));
  const rows = await Promise.all(
    players.map(async (player) => ({ player, stats: await getPlayerStats(player.id) }))
  );
  // The leaderboard screen renders rank from array position, so the server must sort.
  return rows.sort((a, b) => b.stats.winRate - a.stats.winRate || b.stats.won - a.stats.won);
}

export async function getActiveMatchday() {
  const [row] = await db
    .select()
    .from(matchdays)
    .where(inArray(matchdays.status, ['setup', 'drafting', 'teams_set']))
    .limit(1);
  return row ?? null;
}

export async function getMatchdayById(id: string) {
  const [row] = await db.select().from(matchdays).where(eq(matchdays.id, id)).limit(1);
  return row ?? null;
}

export async function listMatchdaysPage(limit: number, cursor?: string) {
  const conditions = cursor ? [lt(matchdays.createdAt, cursor)] : [];
  const rows = await db
    .select()
    .from(matchdays)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(matchdays.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { rows: page, nextCursor: hasMore ? page[page.length - 1]!.createdAt : null };
}

export async function getMatchdayPlayers(matchdayId: string) {
  const rows = await db
    .select({
      userId: matchdayPlayers.userId,
      team: matchdayPlayers.team,
      price: matchdayPlayers.price,
      goals: matchdayPlayers.goals,
      position: matchdayPlayers.position,
      user: users,
    })
    .from(matchdayPlayers)
    .innerJoin(users, eq(users.id, matchdayPlayers.userId))
    .where(eq(matchdayPlayers.matchdayId, matchdayId));

  const map = new Map<
    string,
    { team: 'A' | 'B' | null; price: number | null; goals: number; position: Position; user: UserRow }
  >();
  for (const row of rows) {
    map.set(row.userId, { team: row.team, price: row.price, goals: row.goals, position: row.position, user: row.user });
  }
  return map;
}

export async function insertMatchday(data: {
  status: 'setup';
  method: 'auction' | 'shuffle';
  style: 'price' | 'open' | null;
  budget: number | null;
  roundOrder: Position[] | null;
  teamSize: number;
  leaderAId: string;
  leaderBId: string;
  state: DraftState;
  createdBy: string;
  playerIds: string[];
  /** The role each player fills for this matchday — see matchdayPlayers.position. */
  positionOf: Record<string, Position>;
}) {
  return db.transaction(async (tx) => {
    const [matchday] = await tx
      .insert(matchdays)
      .values({
        status: data.status,
        method: data.method,
        style: data.style,
        budget: data.budget,
        roundOrder: data.roundOrder,
        teamSize: data.teamSize,
        leaderAId: data.leaderAId,
        leaderBId: data.leaderBId,
        state: data.state,
        createdBy: data.createdBy,
      })
      .returning();

    await tx.insert(matchdayPlayers).values(
      data.playerIds.map((userId) => ({
        matchdayId: matchday!.id,
        userId,
        team: userId === data.leaderAId ? ('A' as const) : userId === data.leaderBId ? ('B' as const) : null,
        price: null,
        position: data.positionOf[userId]!,
      }))
    );

    return matchday!;
  });
}

export async function updateMatchdaySetup(
  id: string,
  patch: Partial<{
    style: 'price' | 'open' | null;
    budget: number | null;
    roundOrder: Position[] | null;
    teamSize: number;
    leaderAId: string;
    leaderBId: string;
    state: DraftState;
  }>
) {
  const [row] = await db.update(matchdays).set(patch).where(eq(matchdays.id, id)).returning();
  return row ?? null;
}

export async function cancelMatchday(id: string) {
  await db.update(matchdays).set({ status: 'cancelled' }).where(eq(matchdays.id, id));
}

/** Hard delete — matchdayPlayers and draftEvents cascade via their FK. */
export async function deleteMatchday(id: string) {
  await db.delete(matchdays).where(eq(matchdays.id, id));
}

export async function startMatchday(id: string, state: DraftState) {
  const [row] = await db
    .update(matchdays)
    .set({ status: 'drafting', state })
    .where(eq(matchdays.id, id))
    .returning();
  return row ?? null;
}

export async function recordResult(
  id: string,
  scoreA: number,
  scoreB: number,
  scorers?: { userId: string; goals: number }[]
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(matchdays)
      .set({
        scoreA,
        scoreB,
        status: 'completed',
        // Editing an already-completed score shouldn't bump the played date.
        playedAt: sql`coalesce(${matchdays.playedAt}, now())`,
      })
      .where(eq(matchdays.id, id))
      .returning();

    if (scorers) {
      await tx.update(matchdayPlayers).set({ goals: 0 }).where(eq(matchdayPlayers.matchdayId, id));
      for (const s of scorers) {
        await tx
          .update(matchdayPlayers)
          .set({ goals: s.goals })
          .where(and(eq(matchdayPlayers.matchdayId, id), eq(matchdayPlayers.userId, s.userId)));
      }
    }

    return row ?? null;
  });
}

