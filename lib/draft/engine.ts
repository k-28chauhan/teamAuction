import type {
  ApiErrorCode,
  DraftEventType,
  DraftLogEntry,
  DraftState,
  DraftTeamState,
  Position,
  Team,
} from '@/lib/contract/types';

/** Immutable facts the engine needs. It never reads or writes anything itself. */
export type DraftContext = {
  teamSize: number;
  roundOrder: Position[];
  style: 'price' | 'open';
  positionOf: Record<string, Position>;
  ratingOf: Record<string, number>;
};

export type DraftAction =
  | { kind: 'nominate'; team: Team; playerId: string; price: number }
  | { kind: 'respond'; team: Team; action: 'take' | 'pass' }
  | { kind: 'bid'; team: Team; action: 'raise' | 'pass'; amount?: number };

export type DraftEventInput = {
  type: DraftEventType;
  team: Team;
  payload: Record<string, unknown>;
};

export type DraftResult =
  | { ok: true; state: DraftState; events: DraftEventInput[] }
  | { ok: false; code: ApiErrorCode; message: string };

function fail(code: ApiErrorCode, message: string): DraftResult {
  return { ok: false, code, message };
}

function other(team: Team): Team {
  return team === 'A' ? 'B' : 'A';
}

/** A player's opening/reserve price, set from their rating rather than left to guesswork. */
export function basePriceForRating(rating: number): number {
  return Math.max(1, Math.round(rating));
}

/**
 * No side may hold more than half (rounded up) of the whole squad's supply of
 * any one position — the generalised form of "only one team can hoard the
 * keepers." An odd supply (e.g. 5 forwards) still splits fairly: cap 3 and 2,
 * never 4 and 1, because both sides share the same ceil(n/2) cap and can
 * never simultaneously reach it while player n remains unclaimed.
 */
export function positionCap(position: Position, ctx: DraftContext): number {
  const total = Object.values(ctx.positionOf).filter((p) => p === position).length;
  return Math.ceil(total / 2);
}

function countOfPosition(team: DraftTeamState, position: Position, positionOf: Record<string, Position>): number {
  return team.playerIds.filter((id) => positionOf[id] === position).length;
}

function wouldExceedPositionCap(position: Position, team: DraftTeamState, ctx: DraftContext): boolean {
  return countOfPosition(team, position, ctx.positionOf) >= positionCap(position, ctx);
}

function positionCapMessage(position: Position, ctx: DraftContext): string {
  const cap = positionCap(position, ctx);
  return `Your team can only have ${cap} ${position} player${cap === 1 ? '' : 's'} — that's already filled.`;
}

/**
 * A leader may never bid so much that they can't complete their squad. The
 * reserve isn't a flat 1 credit per empty slot — it's the combined starting
 * price (see basePriceForRating) of the cheapest players still legally
 * available to this team, one per remaining slot. As the cheap end of the
 * pool sells, the cap tightens on its own; nothing needs to recompute it
 * outside of this call because it is re-derived fresh on every action.
 */
export function maxBid(
  team: DraftTeamState,
  ctx: DraftContext,
  poolIds: string[],
  excludePlayerId?: string
): number {
  const remainingSlotsAfterThisPick = ctx.teamSize - team.playerIds.length - 1;
  if (remainingSlotsAfterThisPick <= 0) return team.budget;

  const eligiblePrices = poolIds
    .filter((id) => id !== excludePlayerId)
    .filter((id) => !wouldExceedPositionCap(ctx.positionOf[id], team, ctx))
    .map((id) => basePriceForRating(ctx.ratingOf[id] ?? 1))
    .sort((a, b) => a - b);

  const reserved = eligiblePrices.slice(0, remainingSlotsAfterThisPick);
  // A shortfall (fewer legally-eligible pool players than remaining slots)
  // should never happen — autofill closes the draft before it could — but
  // reserve a floor of 1 credit per unaccounted slot rather than assume 0.
  const shortfall = remainingSlotsAfterThisPick - reserved.length;
  const reserve = reserved.reduce((sum, price) => sum + price, 0) + shortfall * 1;

  return team.budget - reserve;
}

function pushLog(state: DraftState, text: string): DraftLogEntry[] {
  return [{ text, at: new Date().toISOString() }, ...state.log].slice(0, 50);
}

/** Is `team` able to nominate at least one player from the pool at the current round? */
function teamHasEligibleNomination(state: DraftState, ctx: DraftContext, team: Team): boolean {
  if (!state.currentRound) return false;
  const acquirer = state.teams[team];
  if (wouldExceedPositionCap(state.currentRound, acquirer, ctx)) return false;

  return state.poolIds.some((id) => {
    if (ctx.positionOf[id] !== state.currentRound) return false;
    const base = basePriceForRating(ctx.ratingOf[id] ?? 1);
    return base <= maxBid(acquirer, ctx, state.poolIds, id);
  });
}

function firstRoundWithPoolPlayers(state: DraftState, ctx: DraftContext): Position | null {
  for (const position of ctx.roundOrder) {
    if (state.poolIds.some((id) => ctx.positionOf[id] === position)) return position;
  }
  return null;
}

/**
 * Advance currentRound past empty rounds, then land `turn` on a team that
 * actually has an eligible nomination, alternating first. If neither team is
 * eligible for the current round, the round is exhausted and we advance again.
 */
function settleRoundAndTurn(state: DraftState, ctx: DraftContext): DraftState {
  let next = state;

  for (;;) {
    const round = firstRoundWithPoolPlayers(next, ctx);
    if (round === null) {
      return { ...next, currentRound: null };
    }
    next = { ...next, currentRound: round };

    if (teamHasEligibleNomination(next, ctx, next.turn)) {
      return next;
    }
    if (teamHasEligibleNomination(next, ctx, other(next.turn))) {
      return { ...next, turn: other(next.turn) };
    }

    // Neither team can act on this round's remaining players right now (cap
    // reached on both sides, or neither can afford the cheapest one left).
    // Mathematically at most one side can be capped out while supply of a
    // position remains, so this is unreachable in practice — bail out rather
    // than loop forever if it ever is.
    return next;
  }
}

function assignPlayer(
  state: DraftState,
  ctx: DraftContext,
  team: Team,
  playerId: string,
  price: number
): DraftState {
  const teamState = state.teams[team];
  return {
    ...state,
    poolIds: state.poolIds.filter((id) => id !== playerId),
    teams: {
      ...state.teams,
      [team]: {
        ...teamState,
        budget: teamState.budget - price,
        playerIds: [...teamState.playerIds, playerId],
      },
    },
  };
}

/** After a player is assigned: autofill if a team just filled up, else settle turn/round. */
function afterAssignment(
  state: DraftState,
  ctx: DraftContext,
  winner: Team,
  nominatedBy: Team,
  events: DraftEventInput[]
): DraftResult {
  const winnerTeam = state.teams[winner];

  if (winnerTeam.playerIds.length >= ctx.teamSize) {
    const loser = other(winner);
    const remaining = state.poolIds;
    const filledState: DraftState = {
      ...state,
      poolIds: [],
      teams: {
        ...state.teams,
        [loser]: {
          ...state.teams[loser],
          playerIds: [...state.teams[loser].playerIds, ...remaining],
        },
      },
      nomination: null,
      currentRound: null,
      phase: 'complete',
    };
    return {
      ok: true,
      state: {
        ...filledState,
        log: pushLog(filledState, `Autofill: remaining players assigned to team ${loser}.`),
      },
      events: [
        ...events,
        { type: 'autofill', team: loser, payload: { playerIds: remaining } },
      ],
    };
  }

  if (state.poolIds.length === 0) {
    return {
      ok: true,
      state: { ...state, nomination: null, currentRound: null, phase: 'complete' },
      events,
    };
  }

  const resolved: DraftState = { ...state, nomination: null, turn: other(nominatedBy), phase: 'nominate' };
  const settled = settleRoundAndTurn(resolved, ctx);
  return { ok: true, state: settled, events };
}

export function reduce(state: DraftState, action: DraftAction, ctx: DraftContext): DraftResult {
  switch (action.kind) {
    case 'nominate':
      return nominate(state, action, ctx);
    case 'respond':
      return respond(state, action, ctx);
    case 'bid':
      return bid(state, action, ctx);
    default:
      return fail('WRONG_PHASE', "That action isn't recognised.");
  }
}

function nominate(
  state: DraftState,
  action: Extract<DraftAction, { kind: 'nominate' }>,
  ctx: DraftContext
): DraftResult {
  if (state.phase !== 'nominate') {
    return fail('WRONG_PHASE', 'A nomination is already in progress.');
  }
  if (action.team !== state.turn) {
    return fail('NOT_YOUR_TURN', "It isn't your turn to nominate.");
  }
  if (!state.poolIds.includes(action.playerId)) {
    return fail('INELIGIBLE_PLAYER', 'That player is not available to nominate.');
  }
  const position = ctx.positionOf[action.playerId];
  if (position !== state.currentRound) {
    return fail('INELIGIBLE_PLAYER', `This round is for ${state.currentRound} players only.`);
  }

  const acquirer = state.teams[action.team];
  if (wouldExceedPositionCap(position, acquirer, ctx)) {
    return fail('POSITION_LIMIT', positionCapMessage(position, ctx));
  }

  const basePrice = basePriceForRating(ctx.ratingOf[action.playerId] ?? 1);
  const price = ctx.style === 'open' ? basePrice : Math.trunc(action.price);
  if (!Number.isFinite(price) || price < basePrice) {
    return fail('BELOW_BASE_PRICE', `The starting price for this player is ${basePrice} credit(s), based on their rating.`);
  }
  const cap = maxBid(acquirer, ctx, state.poolIds, action.playerId);
  if (price > cap) {
    return fail('EXCEEDS_MAX_BID', `You need to keep enough credits to fill your remaining slots — the most you can offer here is ${cap}.`);
  }

  const nextState: DraftState = {
    ...state,
    phase: ctx.style === 'price' ? 'respond' : 'bidding',
    nomination: { playerId: action.playerId, price, nominatedBy: action.team, highTeam: action.team },
  };

  return {
    ok: true,
    state: {
      ...nextState,
      log: pushLog(nextState, `Team ${action.team} nominated a player for ${price} credit(s).`),
    },
    events: [{ type: 'nominate', team: action.team, payload: { playerId: action.playerId, price } }],
  };
}

function respond(
  state: DraftState,
  action: Extract<DraftAction, { kind: 'respond' }>,
  ctx: DraftContext
): DraftResult {
  if (state.phase !== 'respond' || !state.nomination) {
    return fail('WRONG_PHASE', 'There is nothing to respond to right now.');
  }
  const { nomination } = state;
  const responder = other(nomination.nominatedBy);
  if (action.team !== responder) {
    return fail('NOT_YOUR_TURN', "It isn't your turn to respond.");
  }

  if (action.action === 'pass') {
    const nominatorTeam = nomination.nominatedBy;
    const withLog: DraftState = {
      ...state,
      log: pushLog(state, `Team ${responder} passed — team ${nominatorTeam} buys at ${nomination.price}.`),
    };
    const assigned = assignPlayer(withLog, ctx, nominatorTeam, nomination.playerId, nomination.price);
    return afterAssignment(assigned, ctx, nominatorTeam, nomination.nominatedBy, [
      { type: 'pass', team: responder, payload: { playerId: nomination.playerId } },
    ]);
  }

  // action.action === 'take'
  const acquirer = state.teams[responder];
  const position = ctx.positionOf[nomination.playerId];
  if (wouldExceedPositionCap(position, acquirer, ctx)) {
    return fail('POSITION_LIMIT', positionCapMessage(position, ctx));
  }
  const cap = maxBid(acquirer, ctx, state.poolIds, nomination.playerId);
  if (nomination.price > cap) {
    return fail('EXCEEDS_MAX_BID', `You need to keep enough credits to fill your remaining slots — the most you can offer here is ${cap}.`);
  }

  const withLog: DraftState = {
    ...state,
    log: pushLog(state, `Team ${responder} took the player for ${nomination.price}.`),
  };
  const assigned = assignPlayer(withLog, ctx, responder, nomination.playerId, nomination.price);
  return afterAssignment(assigned, ctx, responder, nomination.nominatedBy, [
    { type: 'take', team: responder, payload: { playerId: nomination.playerId, price: nomination.price } },
  ]);
}

function bid(
  state: DraftState,
  action: Extract<DraftAction, { kind: 'bid' }>,
  ctx: DraftContext
): DraftResult {
  if (state.phase !== 'bidding' || !state.nomination) {
    return fail('WRONG_PHASE', 'There is no live bidding right now.');
  }
  const { nomination } = state;
  const responder = other(nomination.highTeam);
  if (action.team !== responder) {
    return fail('NOT_YOUR_TURN', "It isn't your turn to bid.");
  }

  if (action.action === 'pass') {
    const winner = nomination.highTeam;
    const withLog: DraftState = {
      ...state,
      log: pushLog(state, `Team ${responder} passed — team ${winner} wins at ${nomination.price}.`),
    };
    const assigned = assignPlayer(withLog, ctx, winner, nomination.playerId, nomination.price);
    return afterAssignment(assigned, ctx, winner, nomination.nominatedBy, [
      { type: 'pass', team: responder, payload: { playerId: nomination.playerId } },
    ]);
  }

  // action.action === 'raise'
  if (action.amount !== 1 && action.amount !== 5) {
    return fail('EXCEEDS_MAX_BID', 'Raise by 1 or 5 credits.');
  }
  const acquirer = state.teams[responder];
  const position = ctx.positionOf[nomination.playerId];
  if (wouldExceedPositionCap(position, acquirer, ctx)) {
    return fail('POSITION_LIMIT', positionCapMessage(position, ctx));
  }

  const newPrice = nomination.price + action.amount;
  const cap = maxBid(acquirer, ctx, state.poolIds, nomination.playerId);
  if (newPrice > cap) {
    return fail('EXCEEDS_MAX_BID', `You need to keep enough credits to fill your remaining slots — the most you can offer here is ${cap}.`);
  }

  const nextState: DraftState = {
    ...state,
    nomination: { ...nomination, price: newPrice, highTeam: responder },
  };
  return {
    ok: true,
    state: {
      ...nextState,
      log: pushLog(nextState, `Team ${responder} raised to ${newPrice}.`),
    },
    events: [{ type: 'raise', team: responder, payload: { playerId: nomination.playerId, price: newPrice } }],
  };
}

/** Is it this team's turn to act right now — to nominate, respond, or bid? Used to compute `Permissions.canAct`. */
export function isTeamsTurn(state: DraftState, team: Team): boolean {
  if (state.phase === 'nominate') return state.turn === team;
  if (state.phase === 'respond' && state.nomination) return other(state.nomination.nominatedBy) === team;
  if (state.phase === 'bidding' && state.nomination) return other(state.nomination.highTeam) === team;
  return false;
}

/** Which team is expected to act right now, regardless of phase — lets the master act on a leader's behalf. */
export function currentActor(state: DraftState): Team | null {
  if (isTeamsTurn(state, 'A')) return 'A';
  if (isTeamsTurn(state, 'B')) return 'B';
  return null;
}

/** Build the state a fresh auction starts from: both leaders on their own teams, full budget, everyone else in the pool. */
export function createInitialAuctionState(args: {
  leaderAId: string;
  leaderBId: string;
  poolIds: string[];
  budget: number;
  teamSize: number;
  roundOrder: Position[];
  positionOf: Record<string, Position>;
  ratingOf: Record<string, number>;
}): DraftState {
  const ctx: DraftContext = {
    teamSize: args.teamSize,
    roundOrder: args.roundOrder,
    style: 'price',
    positionOf: args.positionOf,
    ratingOf: args.ratingOf,
  };
  const base: DraftState = {
    phase: 'nominate',
    turn: 'A',
    currentRound: args.roundOrder[0] ?? null,
    poolIds: args.poolIds,
    teams: {
      A: { leaderId: args.leaderAId, budget: args.budget, playerIds: [args.leaderAId] },
      B: { leaderId: args.leaderBId, budget: args.budget, playerIds: [args.leaderBId] },
    },
    nomination: null,
    log: [{ text: 'Draft started.', at: new Date().toISOString() }],
  };
  return settleRoundAndTurn(base, ctx);
}
