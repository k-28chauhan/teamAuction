/**
 * Shared wire types. Backend owns this file; frontend reads it and does not edit it.
 * Snake case lives in the database; everything here is camel case, as sent over HTTP.
 * See /Users/karanindersingh/Downloads/00-shared-contract.md for the source of truth.
 */

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export type Team = 'A' | 'B';

export type MatchdayStatus =
  | 'setup'
  | 'drafting'
  | 'teams_set'
  | 'completed'
  | 'cancelled';

export type DraftMethod = 'auction' | 'shuffle';

export type AuctionStyle = 'price' | 'open';

export type Player = {
  id: string;
  username: string;
  displayName: string;
  position: Position;
  rating: number;
  isMaster: boolean;
  isGuest: boolean;
  isActive: boolean;
};

/** A player's goal tally for one matchday. Omitted (not zero-filled) for anyone who didn't score. */
export type MatchdayScorer = {
  userId: string;
  goals: number;
};

/** What a player was won for at auction (credits). 0 = auto-filled at no cost. Omitted for captains and shuffle matches. */
export type MatchdayPrice = {
  userId: string;
  price: number;
};

export type Matchday = {
  id: string;
  status: MatchdayStatus;
  method: DraftMethod;
  style: AuctionStyle | null;
  budget: number | null;
  roundOrder: Position[];
  teamSize: number;
  leaderA: Player | null;
  leaderB: Player | null;
  teams: { A: Player[]; B: Player[] };
  scoreA: number | null;
  scoreB: number | null;
  scorers: MatchdayScorer[];
  prices: MatchdayPrice[];
  createdAt: string;
  playedAt: string | null;
};

export type PlayerStats = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  winRate: number;
};

export type LeaderboardRow = {
  player: Player;
  stats: PlayerStats;
};

/** Live draft state, stored as matchdays.state (jsonb). */
export type DraftPhase = 'nominate' | 'respond' | 'bidding' | 'complete';

export type DraftLogEntry = { text: string; at: string };

export type DraftNomination = {
  playerId: string;
  price: number;
  nominatedBy: Team;
  highTeam: Team;
};

export type DraftTeamState = {
  leaderId: string;
  budget: number;
  playerIds: string[];
};

export type DraftState = {
  phase: DraftPhase;
  turn: Team;
  currentRound: Position | null;
  poolIds: string[];
  teams: Record<Team, DraftTeamState>;
  nomination: DraftNomination | null;
  log: DraftLogEntry[];
  /** Shuffle-only: the most recently generated candidate split, redeemable via /lock. */
  pendingSplit?: {
    splitId: string;
    teamAIds: string[];
    teamBIds: string[];
  } | null;
};

export type Permissions = {
  isMaster: boolean;
  isLeader: boolean;
  team: Team | null;
  canAct: boolean;
};

export type DraftEventType =
  | 'nominate'
  | 'take'
  | 'pass'
  | 'raise'
  | 'autofill'
  | 'shuffle'
  | 'lock';

/** Standard error shape returned by every failing API call. */
export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'USERNAME_TAKEN'
  | 'UNKNOWN_USERNAME'
  | 'PIN_REQUIRED'
  | 'BAD_PIN'
  | 'ACTIVE_MATCHDAY_EXISTS'
  | 'STALE_VERSION'
  | 'NOT_YOUR_TURN'
  | 'EXCEEDS_MAX_BID'
  | 'BELOW_BASE_PRICE'
  | 'INELIGIBLE_PLAYER'
  | 'POSITION_LIMIT'
  | 'ODD_PLAYER_COUNT'
  | 'NO_LEGAL_SPLIT'
  | 'WRONG_PHASE'
  | 'VALIDATION_ERROR';

export type ApiError = {
  error: { code: ApiErrorCode; message: string };
};
