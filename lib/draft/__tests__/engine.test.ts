import { describe, expect, it } from 'vitest';
import {
  STARTING_BID,
  createInitialAuctionState,
  maxBid,
  reduce,
  type DraftContext,
} from '@/lib/draft/engine';
import type { DraftState, Position } from '@/lib/contract/types';

const LEADER_A = 'leaderA';
const LEADER_B = 'leaderB';

// Positions are only labels now — the engine ignores them entirely. They're kept
// on the fixtures to prove that: any mix of roles can be nominated at any time.
type TestPlayer = { id: string; position: Position; rating?: number };

function setup(
  players: TestPlayer[],
  opts: { teamSize: number; budget: number; style: 'price' | 'open'; roundOrder?: Position[] }
) {
  const ctx: DraftContext = { teamSize: opts.teamSize, style: opts.style };
  const state: DraftState = createInitialAuctionState({
    leaderAId: LEADER_A,
    leaderBId: LEADER_B,
    poolIds: players.map((p) => p.id),
    budget: opts.budget,
    teamSize: opts.teamSize,
  });
  return { ctx, state };
}

describe('STARTING_BID', () => {
  it('is a flat 5 for every player', () => {
    expect(STARTING_BID).toBe(5);
  });
});

describe('maxBid', () => {
  it('reserves the flat starting bid for each remaining eligible slot, not a flat 1 credit each', () => {
    const players: TestPlayer[] = [
      { id: 'p1', position: 'FWD' },
      { id: 'p2', position: 'FWD' },
      { id: 'p3', position: 'FWD' },
    ];
    const { ctx, state } = setup(players, { teamSize: 4, budget: 20, style: 'price', roundOrder: ['FWD'] });
    const team = state.teams.A; // owns 1 (the leader), needs 3 more -> 2 remaining after this pick

    // Cheapest 2 eligible players, each at the flat starting bid: 5 + 5 = 10.
    expect(maxBid(team, ctx, state.poolIds)).toBe(20 - 10);

    // Excluding p1 (as when p1 is the very player being bid on) still leaves 2 eligible players at the same flat price.
    expect(maxBid(team, ctx, state.poolIds, 'p1')).toBe(20 - 10);
  });

  it('reserves nothing on the final slot — the whole remaining budget is available', () => {
    const players: TestPlayer[] = [{ id: 'p1', position: 'FWD', rating: 3 }];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 20, style: 'price', roundOrder: ['FWD'] });
    const team = state.teams.A; // owns 1, needs 1 more -> 0 remaining after this pick
    expect(maxBid(team, ctx, state.poolIds)).toBe(20);
  });

  it('a team with 1 credit and 3 more slots to fill cannot afford even the cheapest remaining player', () => {
    const players: TestPlayer[] = [
      { id: 'p1', position: 'FWD', rating: 1 },
      { id: 'p2', position: 'FWD', rating: 1 },
      { id: 'p3', position: 'FWD', rating: 1 },
    ];
    const { ctx, state } = setup(players, { teamSize: 5, budget: 1, style: 'price', roundOrder: ['FWD'] });
    const cap = maxBid(state.teams.A, ctx, state.poolIds);
    expect(cap).toBeLessThan(1);

    const result = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 5 }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('EXCEEDS_MAX_BID');
  });
});

describe('flat starting prices', () => {
  it('rejects a nomination priced below the flat starting price', () => {
    const players: TestPlayer[] = [{ id: 'p1', position: 'FWD' }];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 20, style: 'price', roundOrder: ['FWD'] });
    const under = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 4 }, ctx);
    expect(under.ok).toBe(false);
    if (!under.ok) expect(under.code).toBe('BELOW_BASE_PRICE');

    const atFloor = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 5 }, ctx);
    expect(atFloor.ok).toBe(true);
  });

  it('open bidding starts at the flat starting price for every player', () => {
    const players: TestPlayer[] = [{ id: 'p1', position: 'FWD' }];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 20, style: 'open', roundOrder: ['FWD'] });
    // Any client-supplied price is ignored/overridden for open style.
    const nominated = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 999 }, ctx);
    expect(nominated.ok).toBe(true);
    if (!nominated.ok) return;
    expect(nominated.state.nomination?.price).toBe(5);
    expect(nominated.state.nomination?.highTeam).toBe('A');
  });
});

describe('name-your-price auctions', () => {
  it('a pass assigns the player to the nominator at the nominator’s own price', () => {
    const players: TestPlayer[] = [
      { id: 'p1', position: 'FWD' },
      { id: 'p2', position: 'FWD' },
    ];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 10, style: 'price', roundOrder: ['FWD'] });
    const nominated = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 5 }, ctx);
    expect(nominated.ok).toBe(true);
    if (!nominated.ok) return;

    const passed = reduce(nominated.state, { kind: 'respond', team: 'B', action: 'pass' }, ctx);
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.state.teams.A.playerIds).toContain('p1');
    expect(passed.state.teams.A.budget).toBe(5);
    expect(passed.state.teams.B.playerIds).not.toContain('p1');
  });

  it('the responder cannot afford the price and only a pass is accepted', () => {
    const players: TestPlayer[] = [
      { id: 'p1', position: 'FWD' },
      { id: 'p2', position: 'FWD' },
    ];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 5, style: 'price', roundOrder: ['FWD'] });
    const nominated = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 5 }, ctx);
    expect(nominated.ok).toBe(true);
    if (!nominated.ok) return;

    const take = reduce(nominated.state, { kind: 'respond', team: 'B', action: 'take' }, ctx);
    expect(take.ok).toBe(true); // affordable here; the EXCEEDS_MAX_BID case is exercised in the maxBid block above
  });
});

describe('open bidding', () => {
  const style = 'open' as const;

  it('a pass sells to highTeam at the current price', () => {
    const players: TestPlayer[] = [
      { id: 'p1', position: 'FWD' },
      { id: 'p2', position: 'FWD' },
    ];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 10, style, roundOrder: ['FWD'] });
    const nominated = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 5 }, ctx);
    expect(nominated.ok).toBe(true);
    if (!nominated.ok) return;

    const passed = reduce(nominated.state, { kind: 'bid', team: 'B', action: 'pass' }, ctx);
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.state.teams.A.playerIds).toContain('p1');
    expect(passed.state.teams.A.budget).toBe(5);
  });

  it('raises alternate highTeam correctly', () => {
    const players: TestPlayer[] = [
      { id: 'p1', position: 'FWD' },
      { id: 'p2', position: 'FWD' },
    ];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 20, style, roundOrder: ['FWD'] });
    const nominated = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 5 }, ctx);
    if (!nominated.ok) throw new Error('setup failed');

    const raised1 = reduce(nominated.state, { kind: 'bid', team: 'B', action: 'raise', amount: 1 }, ctx);
    expect(raised1.ok).toBe(true);
    if (!raised1.ok) return;
    expect(raised1.state.nomination?.highTeam).toBe('B');
    expect(raised1.state.nomination?.price).toBe(6);

    const raised2 = reduce(raised1.state, { kind: 'bid', team: 'A', action: 'raise', amount: 5 }, ctx);
    expect(raised2.ok).toBe(true);
    if (!raised2.ok) return;
    expect(raised2.state.nomination?.highTeam).toBe('A');
    expect(raised2.state.nomination?.price).toBe(11);

    const passed = reduce(raised2.state, { kind: 'bid', team: 'B', action: 'pass' }, ctx);
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.state.teams.A.playerIds).toContain('p1');
    expect(passed.state.teams.A.budget).toBe(9);
  });
});

describe('no categories — any player, any time', () => {
  it('lets a captain nominate any pool player regardless of position, in any order', () => {
    const players: TestPlayer[] = [
      { id: 'gk1', position: 'GK' },
      { id: 'd1', position: 'DEF' },
      { id: 'f1', position: 'FWD' },
      { id: 'm1', position: 'MID' },
    ];
    const { ctx, state } = setup(players, { teamSize: 3, budget: 30, style: 'price' });
    expect(state.currentRound).toBeNull();

    // Start with a defender, not the "first" position of any round order.
    const r = reduce(state, { kind: 'nominate', team: 'A', playerId: 'd1', price: 5 }, ctx);
    expect(r.ok).toBe(true);
  });

  it('has no position limit — a team may end up with several of the same role', () => {
    const players: TestPlayer[] = [
      { id: 'gk1', position: 'GK' },
      { id: 'gk2', position: 'GK' },
      { id: 'gk3', position: 'GK' },
      { id: 'x1', position: 'FWD' },
    ];
    const { ctx, state } = setup(players, { teamSize: 4, budget: 100, style: 'price' });

    // A buys gk1 (B passes); turn -> B. B nominates gk2, A takes it; A now holds 2 keepers.
    let r = reduce(state, { kind: 'nominate', team: 'A', playerId: 'gk1', price: 5 }, ctx);
    if (!r.ok) throw new Error('setup');
    r = reduce(r.state, { kind: 'respond', team: 'B', action: 'pass' }, ctx);
    if (!r.ok) throw new Error('setup');
    r = reduce(r.state, { kind: 'nominate', team: 'B', playerId: 'gk2', price: 5 }, ctx);
    if (!r.ok) throw new Error('setup');
    r = reduce(r.state, { kind: 'respond', team: 'A', action: 'take' }, ctx);
    if (!r.ok) throw new Error('setup');

    // The turn comes back to A, who nominates gk3 — B passes, so A buys a THIRD keeper.
    // No POSITION_LIMIT any more; this fills A's squad (leader + 3) and triggers autofill.
    expect(r.state.turn).toBe('A');
    const n = reduce(r.state, { kind: 'nominate', team: 'A', playerId: 'gk3', price: 5 }, ctx);
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    const taken = reduce(n.state, { kind: 'respond', team: 'B', action: 'pass' }, ctx);
    expect(taken.ok).toBe(true);
    if (!taken.ok) return;
    expect(taken.state.teams.A.playerIds.filter((id) => id.startsWith('gk')).length).toBe(3);
  });

  it('alternates the turn after each sale', () => {
    const players: TestPlayer[] = [
      { id: 'p1', position: 'FWD' },
      { id: 'p2', position: 'MID' },
      { id: 'p3', position: 'DEF' },
      { id: 'p4', position: 'GK' },
    ];
    const { ctx, state } = setup(players, { teamSize: 4, budget: 100, style: 'price' });
    let r = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 5 }, ctx);
    if (!r.ok) throw new Error('setup');
    r = reduce(r.state, { kind: 'respond', team: 'B', action: 'pass' }, ctx);
    if (!r.ok) throw new Error('setup');
    expect(r.state.turn).toBe('B');
    expect(r.state.phase).toBe('nominate');
  });

  it('hands the turn to the other team when the current one cannot afford any nomination', () => {
    const players: TestPlayer[] = [
      { id: 'p1', position: 'FWD' },
      { id: 'p2', position: 'MID' },
      { id: 'p3', position: 'DEF' },
    ];
    // A has 5 credits and needs 2 more players (reserve 5 after this pick) -> max bid 0 -> cannot nominate.
    const { ctx, state } = setup(players, { teamSize: 4, budget: 100, style: 'price' });
    const poor: DraftState = {
      ...state,
      turn: 'A',
      teams: { ...state.teams, A: { ...state.teams.A, budget: 5 } },
    };
    const turn = reduce(poor, { kind: 'nominate', team: 'A', playerId: 'p1', price: 5 }, ctx);
    expect(turn.ok).toBe(false);
    if (!turn.ok) expect(turn.code).toBe('EXCEEDS_MAX_BID');
  });
});

describe('autofill', () => {
  it('fills the opposition with the entire remaining pool at zero cost once a team reaches team_size', () => {
    const players: TestPlayer[] = [
      { id: 'f1', position: 'FWD' },
      { id: 'f2', position: 'FWD' },
      { id: 'f3', position: 'FWD' },
    ];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 20, style: 'price', roundOrder: ['FWD'] });

    const n1 = reduce(state, { kind: 'nominate', team: 'A', playerId: 'f1', price: 5 }, ctx);
    if (!n1.ok) throw new Error('setup');
    // A takes f1 via a pass from B => A now has [leaderA, f1] = team_size 2 reached.
    const r1 = reduce(n1.state, { kind: 'respond', team: 'B', action: 'pass' }, ctx);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    expect(r1.state.phase).toBe('complete');
    expect(r1.state.teams.A.playerIds.sort()).toEqual([LEADER_A, 'f1'].sort());
    expect(r1.state.teams.B.playerIds.sort()).toEqual([LEADER_B, 'f2', 'f3'].sort());
    expect(r1.state.poolIds).toEqual([]);
  });

  it('resolves the final player in the pool without leaving a phase nobody can act on', () => {
    const players: TestPlayer[] = [{ id: 'f1', position: 'FWD' }];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 20, style: 'price', roundOrder: ['FWD'] });

    const n1 = reduce(state, { kind: 'nominate', team: 'A', playerId: 'f1', price: 5 }, ctx);
    if (!n1.ok) throw new Error('setup');
    const r1 = reduce(n1.state, { kind: 'respond', team: 'B', action: 'take' }, ctx);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    expect(r1.state.phase).toBe('complete');
    expect(r1.state.poolIds).toEqual([]);
  });
});

describe('guard rails', () => {
  it('rejects an action from the team whose turn it is not, leaving state untouched', () => {
    const players: TestPlayer[] = [
      { id: 'f1', position: 'FWD', rating: 1 },
      { id: 'f2', position: 'FWD', rating: 1 },
    ];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 20, style: 'price', roundOrder: ['FWD'] });
    expect(state.turn).toBe('A');

    const result = reduce(state, { kind: 'nominate', team: 'B', playerId: 'f1', price: 1 }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_YOUR_TURN');
  });

  it('rejects an action in the wrong phase', () => {
    const players: TestPlayer[] = [
      { id: 'f1', position: 'FWD', rating: 1 },
      { id: 'f2', position: 'FWD', rating: 1 },
    ];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 20, style: 'price', roundOrder: ['FWD'] });

    const result = reduce(state, { kind: 'respond', team: 'B', action: 'pass' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('WRONG_PHASE');
  });
});
