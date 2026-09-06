import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { draftEvents, matchdayPlayers, matchdays, users } from '@/lib/db/schema';
import { hashPin } from '@/lib/auth/pin';
import { basePriceForRating, createInitialAuctionState } from '@/lib/draft/engine';
import type { DraftState, Position } from '@/lib/contract/types';

// Karaninder is seeded as master (matches the signed-in operator of this app).
const MASTER_USERNAME = 'karaninder';
const MASTER_PIN = '1234';

const SQUAD: { username: string; displayName: string; position: Position; rating: number }[] = [
  { username: 'keerat', displayName: 'Keerat', position: 'FWD', rating: 8 },
  { username: 'ranvir', displayName: 'Ranvir', position: 'FWD', rating: 8 },
  { username: 'mehul', displayName: 'Mehul', position: 'FWD', rating: 8 },
  { username: 'ikman', displayName: 'Ikman', position: 'FWD', rating: 8 },
  { username: 'neel', displayName: 'Neel', position: 'MID', rating: 8 },
  { username: 'shivi', displayName: 'Shivi', position: 'MID', rating: 8 },
  { username: 'cucky', displayName: 'Cucky', position: 'MID', rating: 8 },
  { username: 'karaninder', displayName: 'Karaninder', position: 'MID', rating: 8 },
  { username: 'adesh', displayName: 'Adesh', position: 'MID', rating: 8 },
  { username: 'chitvan', displayName: 'Chitvan', position: 'MID', rating: 8 },
  { username: 'aagman', displayName: 'Aagman', position: 'DEF', rating: 6 },
  { username: 'japam', displayName: 'Japam', position: 'DEF', rating: 6 },
  { username: 'kaura', displayName: 'Kaura', position: 'GK', rating: 5 },
  { username: 'harjap', displayName: 'Harjap', position: 'GK', rating: 5 },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  console.log('Seeding...');

  await db.delete(draftEvents);
  await db.delete(matchdayPlayers);
  await db.delete(matchdays);
  await db.delete(users);

  const masterPinHash = await hashPin(MASTER_PIN);
  const inserted = await db
    .insert(users)
    .values(
      SQUAD.map((p) => ({
        username: p.username,
        displayName: p.displayName,
        position: p.position,
        rating: p.rating,
        isMaster: p.username === MASTER_USERNAME,
        masterPinHash: p.username === MASTER_USERNAME ? masterPinHash : null,
      }))
    )
    .returning();

  if (process.env.SEED_HISTORY !== 'true') {
    console.log(`Seeded ${inserted.length} players. No matchdays seeded (set SEED_HISTORY=true to include demo history).`);
    console.log(`Master login: username="${MASTER_USERNAME}" pin="${MASTER_PIN}"`);
    await sql.end();
    return;
  }

  const byUsername = new Map(inserted.map((u) => [u.username, u]));
  const roundOrder: Position[] = ['GK', 'FWD', 'MID', 'DEF'];

  // Three completed matchdays, alternating leaders and squad size, with a played score.
  const historicalGroups: { players: string[]; leaderA: string; leaderB: string; scoreA: number; scoreB: number }[] = [
    {
      // 12 players (6-a-side), leaving out adesh and chitvan this week.
      players: [
        'keerat', 'ranvir', 'mehul', 'ikman',
        'neel', 'shivi', 'cucky', 'karaninder',
        'aagman', 'japam', 'kaura', 'harjap',
      ],
      leaderA: 'keerat',
      leaderB: 'neel',
      scoreA: 4,
      scoreB: 3,
    },
    {
      // Full squad, 7-a-side.
      players: [
        'keerat', 'ranvir', 'mehul', 'ikman',
        'neel', 'shivi', 'cucky', 'karaninder', 'adesh', 'chitvan',
        'aagman', 'japam', 'kaura', 'harjap',
      ],
      leaderA: 'ranvir',
      leaderB: 'adesh',
      scoreA: 3,
      scoreB: 3,
    },
    {
      // 10 players (5-a-side), a smaller midweek session.
      players: [
        'keerat', 'ranvir', 'mehul',
        'neel', 'shivi', 'cucky', 'karaninder', 'adesh', 'chitvan',
        'kaura',
      ],
      leaderA: 'mehul',
      leaderB: 'shivi',
      scoreA: 5,
      scoreB: 2,
    },
  ];

  for (let i = 0; i < historicalGroups.length; i++) {
    const group = historicalGroups[i]!;
    const playerRows = group.players.map((u) => byUsername.get(u)!);
    const leaderA = byUsername.get(group.leaderA)!;
    const leaderB = byUsername.get(group.leaderB)!;
    const teamSize = playerRows.length / 2;

    const positionOf: Record<string, Position> = {};
    const ratingOf: Record<string, number> = {};
    for (const row of playerRows) {
      positionOf[row.id] = row.position;
      ratingOf[row.id] = row.rating;
    }
    const poolIds = playerRows.map((r) => r.id).filter((id) => id !== leaderA.id && id !== leaderB.id);

    const avgRating = playerRows.reduce((sum, r) => sum + r.rating, 0) / playerRows.length;
    const budget = Math.ceil(teamSize * avgRating * 1.5);
    const initialState = createInitialAuctionState({
      leaderAId: leaderA.id,
      leaderBId: leaderB.id,
      poolIds,
      budget,
      teamSize,
      roundOrder,
      positionOf,
      ratingOf,
    });

    // For seed purposes, split the pool evenly between the two teams rather
    // than replaying a full auction — the draft engine itself is covered by
    // its own unit tests.
    const half = Math.ceil(poolIds.length / 2);
    const finalState: DraftState = {
      ...initialState,
      phase: 'complete',
      currentRound: null,
      poolIds: [],
      teams: {
        A: { ...initialState.teams.A, playerIds: [leaderA.id, ...poolIds.slice(0, half)] },
        B: { ...initialState.teams.B, playerIds: [leaderB.id, ...poolIds.slice(half)] },
      },
    };

    const [matchday] = await db
      .insert(matchdays)
      .values({
        status: 'completed',
        method: 'auction',
        style: 'price',
        budget,
        roundOrder,
        teamSize,
        leaderAId: leaderA.id,
        leaderBId: leaderB.id,
        state: finalState,
        scoreA: group.scoreA,
        scoreB: group.scoreB,
        createdBy: byUsername.get(MASTER_USERNAME)!.id,
        playedAt: new Date(Date.now() - (historicalGroups.length - i) * 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .returning();

    await db.insert(matchdayPlayers).values(
      playerRows.map((row) => ({
        matchdayId: matchday!.id,
        userId: row.id,
        team: finalState.teams.A.playerIds.includes(row.id) ? ('A' as const) : ('B' as const),
        price: row.id === leaderA.id || row.id === leaderB.id ? null : basePriceForRating(row.rating),
        position: row.position,
      }))
    );

    await db.insert(draftEvents).values({
      matchdayId: matchday!.id,
      sequence: 1,
      actorId: byUsername.get(MASTER_USERNAME)!.id,
      type: 'autofill',
      payload: { note: 'seeded historical matchday' },
    });
  }

  console.log(`Seeded ${inserted.length} players and ${historicalGroups.length} completed matchdays.`);
  console.log(`Master login: username="${MASTER_USERNAME}" pin="${MASTER_PIN}"`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
