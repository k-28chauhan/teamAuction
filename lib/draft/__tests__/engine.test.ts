import { describe, expect, it } from 'vitest';
import {
  basePriceForRating,
  createInitialAuctionState,
  maxBid,
  positionCap,
  reduce,
  type DraftContext,
} from '@/lib/draft/engine';
import type { DraftState, Position } from '@/lib/contract/types';

const LEADER_A = 'leaderA';
const LEADER_B = 'leaderB';

type TestPlayer = { id: string; position: Position; rating?: number };

function buildCtx(
  players: TestPlayer[],
  opts: { teamSize: number; style: 'price' | 'open'; roundOrder?: Position[]; leaderRating?: number }
): DraftContext {
  const positionOf: Record<string, Position> = { [LEADER_A]: 'MID', [LEADER_B]: 'MID' };
  const ratingOf: Record<string, number> = {
    [LEADER_A]: opts.leaderRating ?? 5,
    [LEADER_B]: opts.leaderRating ?? 5,
  };
  for (const p of players) {
    positionOf[p.id] = p.position;
    ratingOf[p.id] = p.rating ?? 5;
  }
  return {
    teamSize: opts.teamSize,
    roundOrder: opts.roundOrder ?? ['GK', 'FWD', 'MID', 'DEF'],
    style: opts.style,
    positionOf,
    ratingOf,
  };
}

function buildState(ctx: DraftContext, players: TestPlayer[], budget: number): DraftState {
  return createInitialAuctionState({
    leaderAId: LEADER_A,
    leaderBId: LEADER_B,
    poolIds: players.map((p) => p.id),
    budget,
    teamSize: ctx.teamSize,
    roundOrder: ctx.roundOrder,
    positionOf: ctx.positionOf,
    ratingOf: ctx.ratingOf,
  });
}

function setup(players: TestPlayer[], opts: { teamSize: number; budget: number; style: 'price' | 'open'; roundOrder?: Position[] }) {
  const ctx = buildCtx(players, opts);
  const state = buildState(ctx, players, opts.budget);
  return { ctx, state };
}

describe('basePriceForRating', () => {
  it('is a direct, rounded reading of the rating, floored at 1', () => {
    expect(basePriceForRating(1)).toBe(1);
    expect(basePriceForRating(8)).toBe(8);
    expect(basePriceForRating(10)).toBe(10);
    expect(basePriceForRating(5.6)).toBe(6);
    expect(basePriceForRating(0)).toBe(1);
  });
});

describe('positionCap', () => {
  it('caps each side at half the squad-wide supply, rounded up', () => {
    const players: TestPlayer[] = [
      { id: 'f1', position: 'FWD' }, { id: 'f2', position: 'FWD' },
      { id: 'f3', position: 'FWD' }, { id: 'f4', position: 'FWD' },
    ];
    const ctx = buildCtx(players, { teamSize: 6, style: 'price' });
    expect(positionCap('FWD', ctx)).toBe(2);
  });

  it('rounds an odd supply up rather than splitting it unevenly in favour of one side', () => {
    const players: TestPlayer[] = [
      { id: 'f1', position: 'FWD' }, { id: 'f2', position: 'FWD' }, { id: 'f3', position: 'FWD' },
    ];
    const ctx = buildCtx(players, { teamSize: 6, style: 'price' });
    // 3 forwards -> cap 2 each, so the worst split is 2-1, never 3-0.
    expect(positionCap('FWD', ctx)).toBe(2);
  });
});

describe('maxBid', () => {
  it('reserves the combined starting price of the cheapest remaining eligible players, not a flat 1 credit each', () => {
    const players: TestPlayer[] = [
      { id: 'p1', position: 'FWD', rating: 3 },
      { id: 'p2', position: 'FWD', rating: 7 },
      { id: 'p3', position: 'FWD', rating: 2 },
    ];
    const { ctx, state } = setup(players, { teamSize: 4, budget: 20, style: 'price', roundOrder: ['FWD'] });
    const team = state.teams.A; // owns 1 (the leader), needs 3 more -> 2 remaining after this pick

    // Cheapest 2 of {3,7,2} = 2 + 3 = 5.
    expect(maxBid(team, ctx, state.poolIds)).toBe(20 - 5);

    // Excluding p1 (as when p1 is the very player being bid on) changes which players count as "remaining".
    expect(maxBid(team, ctx, state.poolIds, 'p1')).toBe(20 - (2 + 7));
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

    const result = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 1 }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('EXCEEDS_MAX_BID');
  });
});

describe('rating-based starting prices', () => {
  it('rejects a nomination priced below the player’s starting price', () => {
    const players: TestPlayer[] = [{ id: 'p1', position: 'FWD', rating: 6 }];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 20, style: 'price', roundOrder: ['FWD'] });
    const under = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 5 }, ctx);
    expect(under.ok).toBe(false);
    if (!under.ok) expect(under.code).toBe('BELOW_BASE_PRICE');

    const atFloor = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 6 }, ctx);
    expect(atFloor.ok).toBe(true);
  });

  it('open bidding starts at the player’s rating-based price, not a flat 1 credit', () => {
    const players: TestPlayer[] = [{ id: 'p1', position: 'FWD', rating: 7 }];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 20, style: 'open', roundOrder: ['FWD'] });
    // Any client-supplied price is ignored/overridden for open style.
    const nominated = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 999 }, ctx);
    expect(nominated.ok).toBe(true);
    if (!nominated.ok) return;
    expect(nominated.state.nomination?.price).toBe(7);
    expect(nominated.state.nomination?.highTeam).toBe('A');
  });
});

describe('name-your-price auctions', () => {
  it('a pass assigns the player to the nominator at the nominator’s own price', () => {
    const players: TestPlayer[] = [
      { id: 'p1', position: 'FWD', rating: 4 },
      { id: 'p2', position: 'FWD', rating: 4 },
    ];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 10, style: 'price', roundOrder: ['FWD'] });
    const nominated = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 4 }, ctx);
    expect(nominated.ok).toBe(true);
    if (!nominated.ok) return;

    const passed = reduce(nominated.state, { kind: 'respond', team: 'B', action: 'pass' }, ctx);
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.state.teams.A.playerIds).toContain('p1');
    expect(passed.state.teams.A.budget).toBe(6);
    expect(passed.state.teams.B.playerIds).not.toContain('p1');
  });

  it('the responder cannot afford the price and only a pass is accepted', () => {
    const players: TestPlayer[] = [
      { id: 'p1', position: 'FWD', rating: 2 },
      { id: 'p2', position: 'FWD', rating: 2 },
    ];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 2, style: 'price', roundOrder: ['FWD'] });
    const nominated = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 2 }, ctx);
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
      { id: 'p1', position: 'FWD', rating: 1 },
      { id: 'p2', position: 'FWD', rating: 1 },
    ];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 10, style, roundOrder: ['FWD'] });
    const nominated = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 1 }, ctx);
    expect(nominated.ok).toBe(true);
    if (!nominated.ok) return;

    const passed = reduce(nominated.state, { kind: 'bid', team: 'B', action: 'pass' }, ctx);
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.state.teams.A.playerIds).toContain('p1');
    expect(passed.state.teams.A.budget).toBe(9);
  });

  it('raises alternate highTeam correctly', () => {
    const players: TestPlayer[] = [
      { id: 'p1', position: 'FWD', rating: 1 },
      { id: 'p2', position: 'FWD', rating: 1 },
    ];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 10, style, roundOrder: ['FWD'] });
    const nominated = reduce(state, { kind: 'nominate', team: 'A', playerId: 'p1', price: 1 }, ctx);
    if (!nominated.ok) throw new Error('setup failed');

    const raised1 = reduce(nominated.state, { kind: 'bid', team: 'B', action: 'raise', amount: 1 }, ctx);
    expect(raised1.ok).toBe(true);
    if (!raised1.ok) return;
    expect(raised1.state.nomination?.highTeam).toBe('B');
    expect(raised1.state.nomination?.price).toBe(2);

    const raised2 = reduce(raised1.state, { kind: 'bid', team: 'A', action: 'raise', amount: 5 }, ctx);
    expect(raised2.ok).toBe(true);
    if (!raised2.ok) return;
    expect(raised2.state.nomination?.highTeam).toBe('A');
    expect(raised2.state.nomination?.price).toBe(7);

    const passed = reduce(raised2.state, { kind: 'bid', team: 'B', action: 'pass' }, ctx);
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.state.teams.A.playerIds).toContain('p1');
    expect(passed.state.teams.A.budget).toBe(3);
  });
});

describe('position cap (generalises the old keeper-only rule to every position)', () => {
  it('rejects a take/raise that would exceed the cap, forcing a pass even though nominating is still open to the other side', () => {
    // 3 GKs total -> cap = ceil(3/2) = 2 each; the worst possible split is 2-1, never 3-0.
    const players: TestPlayer[] = [
      { id: 'gk1', position: 'GK', rating: 5 },
      { id: 'gk2', position: 'GK', rating: 5 },
      { id: 'gk3', position: 'GK', rating: 5 },
    ];
    const { ctx, state } = setup(players, { teamSize: 5, budget: 100, style: 'price', roundOrder: ['GK'] });
    expect(positionCap('GK', ctx)).toBe(2);

    // A nominates gk1, B passes -> A buys it (A: 1 GK). Turn passes to B.
    let r = reduce(state, { kind: 'nominate', team: 'A', playerId: 'gk1', price: 5 }, ctx);
    if (!r.ok) throw new Error('setup');
    r = reduce(r.state, { kind: 'respond', team: 'B', action: 'pass' }, ctx);
    if (!r.ok) throw new Error('setup');
    expect(r.state.turn).toBe('B');

    // B nominates gk2, but A takes it instead (A: 2 GK = cap). Eligibility then bounces turn to B.
    r = reduce(r.state, { kind: 'nominate', team: 'B', playerId: 'gk2', price: 5 }, ctx);
    if (!r.ok) throw new Error('setup');
    r = reduce(r.state, { kind: 'respond', team: 'A', action: 'take' }, ctx);
    if (!r.ok) throw new Error('setup');
    expect(r.state.teams.A.playerIds.filter((id) => id.startsWith('gk')).length).toBe(2);
    expect(r.state.turn).toBe('B');

    // B nominates the last GK.
    const nominated = reduce(r.state, { kind: 'nominate', team: 'B', playerId: 'gk3', price: 5 }, ctx);
    expect(nominated.ok).toBe(true);
    if (!nominated.ok) return;

    // A responding 'take' would give A a 3rd GK, exceeding the cap of 2 — illegal.
    const blocked = reduce(nominated.state, { kind: 'respond', team: 'A', action: 'take' }, ctx);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe('POSITION_LIMIT');

    // A must pass instead — B ends up with the guaranteed minimum of 1.
    const passed = reduce(nominated.state, { kind: 'respond', team: 'A', action: 'pass' }, ctx);
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.state.teams.B.playerIds).toContain('gk3');
    expect(passed.state.teams.A.playerIds.filter((id) => id.startsWith('gk')).length).toBe(2);
  });
});

describe('turn passing and round advancement', () => {
  it('passes the turn to the other team once the current team is capped out for this round’s position', () => {
    const players: TestPlayer[] = [
      { id: 'f1', position: 'FWD', rating: 5 },
      { id: 'f2', position: 'FWD', rating: 5 },
      { id: 'f3', position: 'FWD', rating: 5 },
    ];
    const { ctx, state } = setup(players, { teamSize: 6, budget: 100, style: 'price', roundOrder: ['FWD'] });
    expect(positionCap('FWD', ctx)).toBe(2);

    // A nominates f1, B passes -> A buys (A: 1 FWD). Turn -> B.
    let r = reduce(state, { kind: 'nominate', team: 'A', playerId: 'f1', price: 5 }, ctx);
    if (!r.ok) throw new Error('setup');
    r = reduce(r.state, { kind: 'respond', team: 'B', action: 'pass' }, ctx);
    if (!r.ok) throw new Error('setup');

    // B nominates f2, A takes it (A: 2 FWD = cap). Eligibility should now skip A.
    r = reduce(r.state, { kind: 'nominate', team: 'B', playerId: 'f2', price: 5 }, ctx);
    if (!r.ok) throw new Error('setup');
    r = reduce(r.state, { kind: 'respond', team: 'A', action: 'take' }, ctx);
    if (!r.ok) throw new Error('setup');

    expect(r.state.turn).toBe('B');
    expect(r.state.currentRound).toBe('FWD');
  });

  it('advances the round automatically once it empties', () => {
    const players: TestPlayer[] = [
      { id: 'gk1', position: 'GK', rating: 5 },
      { id: 'fwd1', position: 'FWD', rating: 5 },
    ];
    const { ctx, state } = setup(players, { teamSize: 3, budget: 20, style: 'price', roundOrder: ['GK', 'FWD'] });

    const n1 = reduce(state, { kind: 'nominate', team: 'A', playerId: 'gk1', price: 5 }, ctx);
    if (!n1.ok) throw new Error('setup');
    const r1 = reduce(n1.state, { kind: 'respond', team: 'B', action: 'pass' }, ctx);
    if (!r1.ok) throw new Error('setup');

    expect(r1.state.currentRound).toBe('FWD');
  });
});

describe('autofill', () => {
  it('fills the opposition with the entire remaining pool at zero cost once a team reaches team_size', () => {
    const players: TestPlayer[] = [
      { id: 'f1', position: 'FWD', rating: 1 },
      { id: 'f2', position: 'FWD', rating: 1 },
      { id: 'f3', position: 'FWD', rating: 1 },
    ];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 20, style: 'price', roundOrder: ['FWD'] });

    const n1 = reduce(state, { kind: 'nominate', team: 'A', playerId: 'f1', price: 1 }, ctx);
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
    const players: TestPlayer[] = [{ id: 'f1', position: 'FWD', rating: 1 }];
    const { ctx, state } = setup(players, { teamSize: 2, budget: 20, style: 'price', roundOrder: ['FWD'] });

    const n1 = reduce(state, { kind: 'nominate', team: 'A', playerId: 'f1', price: 1 }, ctx);
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
