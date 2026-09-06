import type {
  Player,
  Matchday,
  DraftState,
  Position,
  Team,
  PlayerStats,
  LeaderboardRow,
  Permissions,
} from '@/lib/contract/types';

export class MockStore {
  currentUser: Player | null = null;
  players: Player[] = [];
  matchdays: Matchday[] = [];
  currentMatchdayId: string | null = null;
  matchdayVersions: Map<string, number> = new Map();
  masterPin = '1234';

  constructor() {
    this.reset();
  }

  reset() {
    this.players = [
      { id: 'u-1', username: 'master', displayName: 'Sam (Master)', position: 'MID', rating: 7, isMaster: true, isGuest: false, isActive: true },
      { id: 'u-2', username: 'alex', displayName: 'Alex', position: 'GK', rating: 6, isMaster: false, isGuest: false, isActive: true },
      { id: 'u-3', username: 'ben', displayName: 'Ben', position: 'GK', rating: 7, isMaster: false, isGuest: false, isActive: true },
      { id: 'u-4', username: 'chris', displayName: 'Chris', position: 'FWD', rating: 8, isMaster: false, isGuest: false, isActive: true },
      { id: 'u-5', username: 'dan', displayName: 'Dan', position: 'FWD', rating: 6, isMaster: false, isGuest: false, isActive: true },
      { id: 'u-6', username: 'eddie', displayName: 'Eddie', position: 'FWD', rating: 5, isMaster: false, isGuest: false, isActive: true },
      { id: 'u-7', username: 'farid', displayName: 'Farid', position: 'MID', rating: 7, isMaster: false, isGuest: false, isActive: true },
      { id: 'u-8', username: 'george', displayName: 'George', position: 'MID', rating: 6, isMaster: false, isGuest: false, isActive: true },
      { id: 'u-9', username: 'harry', displayName: 'Harry', position: 'MID', rating: 8, isMaster: false, isGuest: false, isActive: true },
      { id: 'u-10', username: 'ivan', displayName: 'Ivan', position: 'MID', rating: 5, isMaster: false, isGuest: false, isActive: true },
      { id: 'u-11', username: 'jack', displayName: 'Jack', position: 'FWD', rating: 7, isMaster: false, isGuest: false, isActive: true },
      { id: 'u-12', username: 'kevin', displayName: 'Kevin', position: 'MID', rating: 6, isMaster: false, isGuest: false, isActive: true },
      { id: 'u-13', username: 'leo', displayName: 'Leo', position: 'FWD', rating: 9, isMaster: false, isGuest: false, isActive: true },
      { id: 'u-14', username: 'mo', displayName: 'Mo', position: 'GK', rating: 5, isMaster: false, isGuest: false, isActive: true },
      { id: 'u-15', username: 'nate', displayName: 'Nate', position: 'MID', rating: 4, isMaster: false, isGuest: false, isActive: true },
    ];

    this.currentUser = this.players[0]!;

    const m1: Matchday = {
      id: 'm-seed-1',
      status: 'completed',
      method: 'auction',
      style: 'price',
      budget: 18,
      roundOrder: ['GK', 'FWD', 'MID', 'DEF'],
      teamSize: 6,
      leaderA: this.players[3]!,
      leaderB: this.players[8]!,
      teams: {
        A: [this.players[3]!, this.players[1]!, this.players[4]!, this.players[6]!, this.players[7]!, this.players[11]!],
        B: [this.players[8]!, this.players[2]!, this.players[5]!, this.players[9]!, this.players[10]!, this.players[12]!],
      },
      scoreA: 4,
      scoreB: 3,
      scorers: [],
      createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      playedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    };

    const m2: Matchday = {
      id: 'm-seed-2',
      status: 'completed',
      method: 'auction',
      style: 'price',
      budget: 18,
      roundOrder: ['GK', 'FWD', 'MID', 'DEF'],
      teamSize: 6,
      leaderA: this.players[10]!,
      leaderB: this.players[7]!,
      teams: {
        A: [this.players[10]!, this.players[2]!, this.players[4]!, this.players[5]!, this.players[9]!, this.players[13]!],
        B: [this.players[7]!, this.players[1]!, this.players[3]!, this.players[6]!, this.players[8]!, this.players[12]!],
      },
      scoreA: 2,
      scoreB: 2,
      scorers: [],
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      playedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    };

    this.matchdays = [m2, m1];
    this.currentMatchdayId = null;
  }

  getPlayerById(id: string): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  getCurrentMatchday(): Matchday | null {
    if (!this.currentMatchdayId) return null;
    return this.matchdays.find((m) => m.id === this.currentMatchdayId) ?? null;
  }

  getPermissions(matchday?: Matchday | null): Permissions {
    const isMaster = !!this.currentUser?.isMaster;
    if (!matchday || matchday.status !== 'drafting') {
      return { isMaster, isLeader: false, team: null, canAct: false };
    }

    const isLeaderA = matchday.leaderA?.id === this.currentUser?.id;
    const isLeaderB = matchday.leaderB?.id === this.currentUser?.id;
    const team: Team | null = isLeaderA ? 'A' : isLeaderB ? 'B' : null;
    const isLeader = team !== null;

    let canAct = false;
    const state = (matchday as any).state as DraftState | undefined;
    if (state && state.phase !== 'complete') {
      if (isMaster) {
        canAct = true;
      } else if (team) {
        if (state.phase === 'nominate') canAct = state.turn === team;
        else if (state.phase === 'respond') canAct = state.turn !== team;
        else if (state.phase === 'bidding') canAct = state.nomination?.highTeam !== team;
      }
    }

    return { isMaster, isLeader, team, canAct };
  }

  calculateMaxBid(state: DraftState, team: Team, teamSize: number): number {
    const currentCount = state.teams[team].playerIds.length;
    const slotsRemaining = teamSize - currentCount;
    if (slotsRemaining <= 1) return state.teams[team].budget;
    return state.teams[team].budget - (slotsRemaining - 1);
  }
}

export const mockStore = new MockStore();
