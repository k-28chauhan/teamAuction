import type { Matchday, MatchdayPrice, MatchdayScorer, Permissions, Player, Position, Team } from '@/lib/contract/types';

export type UserRow = {
  id: string;
  username: string;
  displayName: string;
  position: Position;
  rating: number;
  isMaster: boolean;
  isGuest: boolean;
  isActive: boolean;
};

/**
 * `positionOverride` renders a player as whatever role they're filling for a
 * specific matchday (see matchdayPlayers.position) rather than their profile
 * default — someone tagged MID can still show as FWD for a night they played up front.
 */
export function serializePlayer(row: UserRow, positionOverride?: Position): Player {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    position: positionOverride ?? row.position,
    rating: row.rating,
    isMaster: row.isMaster,
    isGuest: row.isGuest,
    isActive: row.isActive,
  };
}

export type MatchdayRow = {
  id: string;
  status: 'setup' | 'drafting' | 'teams_set' | 'completed' | 'cancelled';
  method: 'auction' | 'shuffle';
  style: 'price' | 'open' | null;
  budget: number | null;
  roundOrder: Position[] | null;
  teamSize: number;
  leaderAId: string | null;
  leaderBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  createdAt: string;
  playedAt: string | null;
};

export function serializeMatchday(
  row: MatchdayRow,
  playersByUser: Map<string, { team: 'A' | 'B' | null; goals?: number; price?: number | null; position?: Position; user: UserRow }>
): Matchday {
  const teamA: Player[] = [];
  const teamB: Player[] = [];
  const scorers: MatchdayScorer[] = [];
  const prices: MatchdayPrice[] = [];
  for (const [userId, { team, goals, price, position, user }] of playersByUser) {
    if (team === 'A') teamA.push(serializePlayer(user, position));
    if (team === 'B') teamB.push(serializePlayer(user, position));
    if (goals) scorers.push({ userId, goals });
    if (price !== null && price !== undefined) prices.push({ userId, price });
  }

  const leaderEntryA = row.leaderAId ? playersByUser.get(row.leaderAId) : undefined;
  const leaderEntryB = row.leaderBId ? playersByUser.get(row.leaderBId) : undefined;

  return {
    id: row.id,
    status: row.status,
    method: row.method,
    style: row.style,
    budget: row.budget,
    roundOrder: row.roundOrder ?? [],
    teamSize: row.teamSize,
    leaderA: leaderEntryA ? serializePlayer(leaderEntryA.user, leaderEntryA.position) : null,
    leaderB: leaderEntryB ? serializePlayer(leaderEntryB.user, leaderEntryB.position) : null,
    teams: { A: teamA, B: teamB },
    scoreA: row.scoreA,
    scoreB: row.scoreB,
    scorers,
    prices,
    createdAt: row.createdAt,
    playedAt: row.playedAt,
  };
}

export function computePermissions(args: { isMaster: boolean; team: Team | null; canAct: boolean }): Permissions {
  return { isMaster: args.isMaster, isLeader: args.team !== null, team: args.team, canAct: args.canAct };
}
