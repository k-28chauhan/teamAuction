import { mockStore } from './store';
import type {
  Player,
  Matchday,
  DraftState,
  Position,
  Team,
  LeaderboardRow,
  PlayerStats,
} from '@/lib/contract/types';

export class MockApiError extends Error {
  code: string;
  status: number;
  data?: any;
  constructor(code: string, message: string, status = 400, data?: any) {
    super(message);
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

export const mockHandlers = {
  login: async (username: string, pin?: string) => {
    const user = mockStore.players.find((p) => p.username.toLowerCase() === username.toLowerCase() && p.isActive);
    if (!user) {
      throw new MockApiError('UNKNOWN_USERNAME', "That username isn't on the roster.", 404);
    }
    if (user.isMaster) {
      if (!pin) {
        throw new MockApiError('PIN_REQUIRED', 'Enter the master PIN.', 401);
      }
      if (pin !== mockStore.masterPin) {
        throw new MockApiError('BAD_PIN', "That PIN doesn't match.", 401);
      }
    }
    mockStore.currentUser = user;
    return { user };
  },

  logout: async () => {
    mockStore.currentUser = null;
    return { ok: true };
  },

  getMe: async () => {
    if (!mockStore.currentUser) {
      throw new MockApiError('UNAUTHENTICATED', 'You must log in first.', 401);
    }
    const current = mockStore.getCurrentMatchday();
    return {
      user: mockStore.currentUser,
      permissions: mockStore.getPermissions(current),
    };
  },

  getPlayers: async (includeGuests = false) => {
    const players = mockStore.players.filter((p) => p.isActive && (includeGuests || !p.isGuest));
    return { players };
  },

  createPlayer: async (data: { displayName: string; username?: string; position: Position; rating?: number; isGuest?: boolean }) => {
    if (!mockStore.currentUser?.isMaster) {
      throw new MockApiError('FORBIDDEN', 'Master access required.', 403);
    }
    const username = data.username || (data.isGuest ? `guest_${Date.now()}` : data.displayName.toLowerCase().replace(/\s+/g, ''));
    if (!data.isGuest && mockStore.players.some((p) => p.username === username)) {
      throw new MockApiError('USERNAME_TAKEN', 'That username is already taken.', 409);
    }
    const player: Player = {
      id: `u-${Date.now()}`,
      username,
      displayName: data.displayName,
      position: data.position,
      rating: data.rating ?? 5,
      isMaster: false,
      isGuest: !!data.isGuest,
      isActive: true,
    };
    mockStore.players.push(player);
    return { player };
  },

  updatePlayer: async (id: string, data: Partial<Player>) => {
    if (!mockStore.currentUser?.isMaster) {
      throw new MockApiError('FORBIDDEN', 'Master access required.', 403);
    }
    const player = mockStore.getPlayerById(id);
    if (!player) throw new MockApiError('NOT_FOUND', "That player doesn't exist.", 404);
    Object.assign(player, data);
    return { player };
  },

  deletePlayer: async (id: string) => {
    if (!mockStore.currentUser?.isMaster) {
      throw new MockApiError('FORBIDDEN', 'Master access required.', 403);
    }
    const player = mockStore.getPlayerById(id);
    if (!player) throw new MockApiError('NOT_FOUND', "That player doesn't exist.", 404);
    player.isActive = false;
    return { ok: true };
  },

  transferMaster: async (id: string, _pin?: string) => {
    if (!mockStore.currentUser?.isMaster) {
      throw new MockApiError('FORBIDDEN', 'Master access required.', 403);
    }
    const target = mockStore.getPlayerById(id);
    if (!target) throw new MockApiError('NOT_FOUND', "That player doesn't exist.", 404);
    if (target.isGuest) throw new MockApiError('FORBIDDEN', "A guest can't become master.", 403);

    mockStore.players.forEach((p) => {
      p.isMaster = p.id === id;
    });
    if (mockStore.currentUser) {
      mockStore.currentUser.isMaster = mockStore.currentUser.id === id;
    }
    return { ok: true };
  },

  getPlayerStats: async (id: string) => {
    const player = mockStore.getPlayerById(id);
    if (!player) throw new MockApiError('NOT_FOUND', "That player doesn't exist.", 404);

    let played = 0;
    let won = 0;
    let drawn = 0;
    let lost = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;

    const matches = mockStore.matchdays
      .filter((m) => m.status === 'completed' && (m.teams.A.some((p) => p.id === id) || m.teams.B.some((p) => p.id === id)))
      .map((m) => {
        played++;
        const inA = m.teams.A.some((p) => p.id === id);
        const myScore = inA ? m.scoreA ?? 0 : m.scoreB ?? 0;
        const oppScore = inA ? m.scoreB ?? 0 : m.scoreA ?? 0;
        goalsFor += myScore;
        goalsAgainst += oppScore;
        if (myScore > oppScore) won++;
        else if (myScore === oppScore) drawn++;
        else lost++;

        return {
          matchdayId: m.id,
          playedAt: m.playedAt,
          team: inA ? ('A' as Team) : ('B' as Team),
          scoreA: m.scoreA,
          scoreB: m.scoreB,
        };
      });

    const winRate = played > 0 ? Math.round((won / played) * 100) : 0;
    const stats: PlayerStats = { played, won, drawn, lost, goalsFor, goalsAgainst, winRate };
    return { stats, matches };
  },

  getCurrentMatchday: async () => {
    const matchday = mockStore.getCurrentMatchday();
    return { matchday };
  },

  getMatchdays: async (limit = 20, _cursor?: string) => {
    const sorted = [...mockStore.matchdays].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { matchdays: sorted.slice(0, limit), nextCursor: null };
  },

  getMatchdayById: async (id: string) => {
    const m = mockStore.matchdays.find((x) => x.id === id);
    if (!m) throw new MockApiError('NOT_FOUND', "That matchday doesn't exist.", 404);
    return { matchday: m };
  },

  createMatchday: async (data: {
    playerIds: string[];
    leaderAId: string;
    leaderBId: string;
    method: 'auction' | 'shuffle';
    style?: 'price' | 'open';
    budget?: number;
    roundOrder?: Position[];
  }) => {
    if (!mockStore.currentUser?.isMaster) {
      throw new MockApiError('FORBIDDEN', 'Master access required.', 403);
    }
    if (data.playerIds.length % 2 !== 0) {
      throw new MockApiError('ODD_PLAYER_COUNT', 'The squad for a matchday must be an even number of players.', 422);
    }
    const leaderA = mockStore.getPlayerById(data.leaderAId);
    const leaderB = mockStore.getPlayerById(data.leaderBId);
    if (!leaderA || !leaderB) throw new MockApiError('NOT_FOUND', 'Leader not found.', 404);

    const teamSize = data.playerIds.length / 2;
    const budget = data.budget ?? teamSize * 3;
    const roundOrder = data.roundOrder ?? ['GK', 'FWD', 'MID', 'DEF'];
    const poolIds = data.playerIds.filter((id) => id !== leaderA.id && id !== leaderB.id);

    let state: DraftState;
    if (data.method === 'auction') {
      state = {
        phase: 'nominate',
        turn: 'A',
        currentRound: roundOrder[0] ?? 'GK',
        poolIds,
        teams: {
          A: { leaderId: leaderA.id, budget, playerIds: [leaderA.id] },
          B: { leaderId: leaderB.id, budget, playerIds: [leaderB.id] },
        },
        nomination: null,
        log: [{ text: 'Draft started.', at: new Date().toISOString() }],
      };
    } else {
      state = {
        phase: 'complete',
        turn: 'A',
        currentRound: null,
        poolIds,
        teams: {
          A: { leaderId: leaderA.id, budget: 0, playerIds: [leaderA.id] },
          B: { leaderId: leaderB.id, budget: 0, playerIds: [leaderB.id] },
        },
        nomination: null,
        log: [{ text: 'Ready to shuffle.', at: new Date().toISOString() }],
      };
    }

    const matchday: Matchday = {
      id: `m-${Date.now()}`,
      status: 'setup',
      method: data.method,
      style: data.style ?? 'price',
      budget,
      roundOrder,
      teamSize,
      leaderA,
      leaderB,
      teams: { A: [leaderA], B: [leaderB] },
      scoreA: null,
      scoreB: null,
      scorers: [],
      createdAt: new Date().toISOString(),
      playedAt: null,
    };
    (matchday as any).state = state;
    mockStore.matchdays.unshift(matchday);
    mockStore.currentMatchdayId = matchday.id;
    mockStore.matchdayVersions.set(matchday.id, 1);

    return { matchday };
  },

  startMatchday: async (id: string) => {
    const matchday = mockStore.matchdays.find((m) => m.id === id);
    if (!matchday) throw new MockApiError('NOT_FOUND', "That matchday doesn't exist.", 404);
    matchday.status = 'drafting';
    return { matchday };
  },

  cancelMatchday: async (id: string) => {
    const matchday = mockStore.matchdays.find((m) => m.id === id);
    if (!matchday) throw new MockApiError('NOT_FOUND', "That matchday doesn't exist.", 404);
    matchday.status = 'cancelled';
    if (mockStore.currentMatchdayId === id) {
      mockStore.currentMatchdayId = null;
    }
    return { ok: true };
  },

  getMatchdayState: async (id: string) => {
    const matchday = mockStore.matchdays.find((m) => m.id === id);
    if (!matchday) throw new MockApiError('NOT_FOUND', "That matchday doesn't exist.", 404);
    const version = mockStore.matchdayVersions.get(id) ?? 1;
    const permissions = mockStore.getPermissions(matchday);
    return {
      state: (matchday as any).state,
      version,
      permissions,
      roster: mockStore.players,
    };
  },

  nominate: async (id: string, version: number, playerId: string, price: number) => {
    const matchday = mockStore.matchdays.find((m) => m.id === id);
    if (!matchday) throw new MockApiError('NOT_FOUND', "That matchday doesn't exist.", 404);
    const currentVersion = mockStore.matchdayVersions.get(id) ?? 1;
    if (version !== currentVersion) {
      throw new MockApiError('STALE_VERSION', "Someone got there first.", 409, {
        state: (matchday as any).state,
        version: currentVersion,
      });
    }

    const state = (matchday as any).state as DraftState;
    const actingTeam = state.turn;
    const maxBid = mockStore.calculateMaxBid(state, actingTeam, matchday.teamSize);
    if (price > maxBid) {
      throw new MockApiError('EXCEEDS_MAX_BID', `You need to keep credits for your remaining slots (max bid ${maxBid}).`, 422);
    }

    state.nomination = {
      playerId,
      price,
      nominatedBy: actingTeam,
      highTeam: actingTeam,
    };
    state.phase = matchday.style === 'open' ? 'bidding' : 'respond';
    const player = mockStore.getPlayerById(playerId);
    state.log.unshift({
      text: `Team ${actingTeam} nominated ${player?.displayName ?? 'Player'} for ${price}cr.`,
      at: new Date().toISOString(),
    });

    mockStore.matchdayVersions.set(id, currentVersion + 1);
    return { state, version: currentVersion + 1 };
  },

  respond: async (id: string, version: number, action: 'take' | 'pass') => {
    const matchday = mockStore.matchdays.find((m) => m.id === id);
    if (!matchday) throw new MockApiError('NOT_FOUND', "That matchday doesn't exist.", 404);
    const currentVersion = mockStore.matchdayVersions.get(id) ?? 1;
    if (version !== currentVersion) {
      throw new MockApiError('STALE_VERSION', "Someone got there first.", 409, {
        state: (matchday as any).state,
        version: currentVersion,
      });
    }

    const state = (matchday as any).state as DraftState;
    if (!state.nomination) throw new MockApiError('WRONG_PHASE', 'Nothing to respond to.', 400);

    const respondingTeam: Team = state.turn === 'A' ? 'B' : 'A';
    const winningTeam: Team = action === 'take' ? respondingTeam : state.turn;
    const price = state.nomination.price;
    const player = mockStore.getPlayerById(state.nomination.playerId)!;

    state.teams[winningTeam].budget -= price;
    state.teams[winningTeam].playerIds.push(player.id);
    matchday.teams[winningTeam].push(player);
    state.poolIds = state.poolIds.filter((pId) => pId !== player.id);

    state.log.unshift({
      text: `${player.displayName} went to Team ${winningTeam} for ${price}cr.`,
      at: new Date().toISOString(),
    });

    state.nomination = null;
    state.turn = state.turn === 'A' ? 'B' : 'A';

    // Auto-fill check
    if (state.teams.A.playerIds.length >= matchday.teamSize) {
      const remainder = [...state.poolIds];
      remainder.forEach((pId) => {
        const p = mockStore.getPlayerById(pId)!;
        state.teams.B.playerIds.push(p.id);
        matchday.teams.B.push(p);
      });
      state.poolIds = [];
      state.phase = 'complete';
      matchday.status = 'teams_set';
      state.log.unshift({ text: 'Team A filled! Remaining players auto-assigned to Team B.', at: new Date().toISOString() });
    } else if (state.teams.B.playerIds.length >= matchday.teamSize) {
      const remainder = [...state.poolIds];
      remainder.forEach((pId) => {
        const p = mockStore.getPlayerById(pId)!;
        state.teams.A.playerIds.push(p.id);
        matchday.teams.A.push(p);
      });
      state.poolIds = [];
      state.phase = 'complete';
      matchday.status = 'teams_set';
      state.log.unshift({ text: 'Team B filled! Remaining players auto-assigned to Team A.', at: new Date().toISOString() });
    } else {
      state.phase = 'nominate';
    }

    mockStore.matchdayVersions.set(id, currentVersion + 1);
    return { state, version: currentVersion + 1 };
  },

  bid: async (id: string, version: number, action: 'raise' | 'pass', amount?: 1 | 5) => {
    const matchday = mockStore.matchdays.find((m) => m.id === id);
    if (!matchday) throw new MockApiError('NOT_FOUND', "That matchday doesn't exist.", 404);
    const currentVersion = mockStore.matchdayVersions.get(id) ?? 1;
    if (version !== currentVersion) {
      throw new MockApiError('STALE_VERSION', "Someone got there first.", 409, {
        state: (matchday as any).state,
        version: currentVersion,
      });
    }

    const state = (matchday as any).state as DraftState;
    if (!state.nomination) throw new MockApiError('WRONG_PHASE', 'No active nomination.', 400);

    if (action === 'raise') {
      const raiseBy = amount ?? 1;
      const actingTeam: Team = state.nomination.highTeam === 'A' ? 'B' : 'A';
      const newPrice = state.nomination.price + raiseBy;
      const maxBid = mockStore.calculateMaxBid(state, actingTeam, matchday.teamSize);
      if (newPrice > maxBid) {
        throw new MockApiError('EXCEEDS_MAX_BID', `That raise exceeds your budget cap of ${maxBid}cr.`, 422);
      }
      state.nomination.price = newPrice;
      state.nomination.highTeam = actingTeam;
      state.log.unshift({ text: `Team ${actingTeam} raised to ${newPrice}cr.`, at: new Date().toISOString() });
    } else {
      // Pass sells to highTeam
      const winningTeam = state.nomination.highTeam;
      const price = state.nomination.price;
      const player = mockStore.getPlayerById(state.nomination.playerId)!;

      state.teams[winningTeam].budget -= price;
      state.teams[winningTeam].playerIds.push(player.id);
      matchday.teams[winningTeam].push(player);
      state.poolIds = state.poolIds.filter((pId) => pId !== player.id);

      state.log.unshift({ text: `${player.displayName} sold to Team ${winningTeam} for ${price}cr.`, at: new Date().toISOString() });
      state.nomination = null;
      state.turn = state.turn === 'A' ? 'B' : 'A';
      state.phase = 'nominate';
    }

    mockStore.matchdayVersions.set(id, currentVersion + 1);
    return { state, version: currentVersion + 1 };
  },

  shuffle: async (id: string) => {
    const matchday = mockStore.matchdays.find((m) => m.id === id);
    if (!matchday) throw new MockApiError('NOT_FOUND', "That matchday doesn't exist.", 404);

    const allPlayers = [...matchday.teams.A, ...matchday.teams.B];
    const half = Math.floor(allPlayers.length / 2);
    const shuffled = [...allPlayers].sort(() => Math.random() - 0.5);

    const splitId = `split-${Date.now()}`;
    const chosen = {
      teamAIds: shuffled.slice(0, half).map((p) => p.id),
      teamBIds: shuffled.slice(half).map((p) => p.id),
      ratingGap: Math.floor(Math.random() * 2),
    };

    const state = (matchday as any).state as DraftState;
    state.pendingSplit = {
      splitId,
      teamAIds: chosen.teamAIds,
      teamBIds: chosen.teamBIds,
    };
    state.log.unshift({ text: 'A new split was proposed.', at: new Date().toISOString() });

    const currentVersion = mockStore.matchdayVersions.get(id) ?? 1;
    mockStore.matchdayVersions.set(id, currentVersion + 1);

    return { split: chosen, splitId, diff: chosen.ratingGap, legalCount: 12 };
  },

  lock: async (id: string, splitId: string) => {
    const matchday = mockStore.matchdays.find((m) => m.id === id);
    if (!matchday) throw new MockApiError('NOT_FOUND', "That matchday doesn't exist.", 404);

    const state = (matchday as any).state as DraftState;
    if (!state.pendingSplit || state.pendingSplit.splitId !== splitId) {
      throw new MockApiError('STALE_VERSION', "That split isn't current anymore — shuffle again.", 409);
    }

    matchday.teams.A = state.pendingSplit.teamAIds.map((pId) => mockStore.getPlayerById(pId)!);
    matchday.teams.B = state.pendingSplit.teamBIds.map((pId) => mockStore.getPlayerById(pId)!);
    state.pendingSplit = null;
    matchday.status = 'teams_set';

    const currentVersion = mockStore.matchdayVersions.get(id) ?? 1;
    mockStore.matchdayVersions.set(id, currentVersion + 1);
    return { matchday };
  },

  recordResult: async (id: string, scoreA: number, scoreB: number) => {
    const matchday = mockStore.matchdays.find((m) => m.id === id);
    if (!matchday) throw new MockApiError('NOT_FOUND', "That matchday doesn't exist.", 404);
    matchday.scoreA = scoreA;
    matchday.scoreB = scoreB;
    matchday.status = 'completed';
    matchday.playedAt = new Date().toISOString();
    if (mockStore.currentMatchdayId === id) {
      mockStore.currentMatchdayId = null;
    }
    return { matchday };
  },

  getLeaderboard: async () => {
    const rows: LeaderboardRow[] = mockStore.players
      .filter((p) => p.isActive && !p.isGuest)
      .map((p) => {
        let played = 0;
        let won = 0;
        let drawn = 0;
        let lost = 0;
        let goalsFor = 0;
        let goalsAgainst = 0;

        mockStore.matchdays
          .filter((m) => m.status === 'completed' && (m.teams.A.some((x) => x.id === p.id) || m.teams.B.some((x) => x.id === p.id)))
          .forEach((m) => {
            played++;
            const inA = m.teams.A.some((x) => x.id === p.id);
            const myScore = inA ? m.scoreA ?? 0 : m.scoreB ?? 0;
            const oppScore = inA ? m.scoreB ?? 0 : m.scoreA ?? 0;
            goalsFor += myScore;
            goalsAgainst += oppScore;
            if (myScore > oppScore) won++;
            else if (myScore === oppScore) drawn++;
            else lost++;
          });

        const winRate = played > 0 ? Math.round((won / played) * 100) : 0;
        return {
          player: p,
          stats: { played, won, drawn, lost, goalsFor, goalsAgainst, winRate },
        };
      })
      .sort((a, b) => b.stats.winRate - a.stats.winRate || b.stats.won - a.stats.won);

    return { rows };
  },
};
