import type {
  ApiErrorCode,
  DraftEventType,
  DraftLogEntry,
  DraftState,
  DraftTeamState,
  Team,
} from '@/lib/contract/types';

/** Immutable facts the engine needs. It never reads or writes anything itself. */
export type DraftContext = {
  teamSize: number;
  style: 'price' | 'open';
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

/** Every player's opening/reserve bid — flat, regardless of rating. */
export const STARTING_BID = 5;

/**
 * A leader may never bid so much that they can't complete their squad: the
 * reserve is one starting bid (STARTING_BID) for every slot still empty after
 * this pick, capped by how many pool players actually remain. Any pool player
 * can go to either team, so there are no per-position limits — only credits.
 * It is re-derived fresh on every action, so nothing needs to recompute it.
 */
export function maxBid(
  team: DraftTeamState,
  ctx: DraftContext,
  poolIds: string[],
  excludePlayerId?: string
): number {
  const remainingSlotsAfterThisPick = ctx.teamSize - team.playerIds.length - 1;
  if (remainingSlotsAfterThisPick <= 0) return team.budget;

  const available = poolIds.filter((id) => id !== excludePlayerId).length;
  const reservedSlots = Math.min(remainingSlotsAfterThisPick, available);
  // A shortfall (fewer pool players than remaining slots) should never happen
  // — autofill closes the draft before it could — but reserve a floor of one
  // starting bid per unaccounted slot rather than assume 0.
  const shortfall = remainingSlotsAfterThisPick - reservedSlots;
  const reserve = (reservedSlots + shortfall) * STARTING_BID;

  return team.budget - reserve;
}

function pushLog(state: DraftState, text: string): DraftLogEntry[] {
  return [{ text, at: new Date().toISOString() }, ...state.log].slice(0, 50);
}

/** Can `team` afford to put at least one pool player up for bid at the starting price? */
function teamCanNominate(state: DraftState, ctx: DraftContext, team: Team): boolean {
  const acquirer = state.teams[team];
  if (acquirer.playerIds.length >= ctx.teamSize) return false;
  return state.poolIds.some((id) => STARTING_BID <= maxBid(acquirer, ctx, state.poolIds, id));
}

/** Keep `turn` on a team that can actually nominate, alternating first. */
function settleTurn(state: DraftState, ctx: DraftContext): DraftState {
  if (teamCanNominate(state, ctx, state.turn)) return state;
  if (teamCanNominate(state, ctx, other(state.turn))) return { ...state, turn: other(state.turn) };
  return state;
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
  const settled = settleTurn(resolved, ctx);
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

  const acquirer = state.teams[action.team];
  const basePrice = STARTING_BID;
  const price = ctx.style === 'open' ? basePrice : Math.trunc(action.price);
  if (!Number.isFinite(price) || price < basePrice) {
    return fail('BELOW_BASE_PRICE', `The starting price for every player is ${basePrice} credit(s).`);
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
}): DraftState {
  const ctx: DraftContext = { teamSize: args.teamSize, style: 'price' };
  const base: DraftState = {
    phase: 'nominate',
    turn: 'A',
    currentRound: null,
    poolIds: args.poolIds,
    teams: {
      A: { leaderId: args.leaderAId, budget: args.budget, playerIds: [args.leaderAId] },
      B: { leaderId: args.leaderBId, budget: args.budget, playerIds: [args.leaderBId] },
    },
    nomination: null,
    log: [{ text: 'Draft started.', at: new Date().toISOString() }],
  };
  return settleTurn(base, ctx);
}
