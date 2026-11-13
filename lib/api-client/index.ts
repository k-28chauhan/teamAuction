import type {
  Player,
  Matchday,
  DraftState,
  Position,
  PlayerStats,
  LeaderboardRow,
  Permissions,
  ApiErrorCode,
} from '@/lib/contract/types';
import { mockHandlers, MockApiError } from '@/mocks/handlers';

export class ApiClientError extends Error {
  code: ApiErrorCode | string;
  status: number;
  data?: any;

  constructor(code: ApiErrorCode | string, message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 304) {
    return { notModified: true } as any;
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = json?.error;
    throw new ApiClientError(
      error?.code || 'UNKNOWN_ERROR',
      error?.message || 'Something went wrong. Please try again.',
      res.status,
      error
    );
  }

  return json as T;
}

// ---------------- AUTH ----------------

export async function login(username: string, pin?: string): Promise<{ user: Player }> {
  if (USE_MOCKS) {
    try {
      return await mockHandlers.login(username, pin);
    } catch (err: any) {
      throw new ApiClientError(err.code, err.message, err.status);
    }
  }
  return request<{ user: Player }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, pin }),
  });
}

export async function logout(): Promise<{ ok: boolean }> {
  if (USE_MOCKS) {
    return mockHandlers.logout();
  }
  return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<{ user: Player; permissions: Permissions }> {
  if (USE_MOCKS) {
    try {
      return await mockHandlers.getMe();
    } catch (err: any) {
      throw new ApiClientError(err.code, err.message, err.status);
    }
  }
  return request<{ user: Player; permissions: Permissions }>('/api/auth/me');
}

// ---------------- PLAYERS ----------------

export async function getPlayers(includeGuests = false): Promise<{ players: Player[] }> {
  if (USE_MOCKS) {
    return mockHandlers.getPlayers(includeGuests);
  }
  return request<{ players: Player[] }>(`/api/players?includeGuests=${includeGuests}`);
}

export async function createPlayer(data: {
  displayName: string;
  username?: string;
  position: Position;
  rating?: number;
  isGuest?: boolean;
}): Promise<{ player: Player }> {
  if (USE_MOCKS) {
    try {
      return await mockHandlers.createPlayer(data);
    } catch (err: any) {
      throw new ApiClientError(err.code, err.message, err.status);
    }
  }
  return request<{ player: Player }>('/api/players', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePlayer(
  id: string,
  patch: { displayName?: string; position?: Position; rating?: number; isGuest?: boolean }
): Promise<{ player: Player }> {
  if (USE_MOCKS) {
    try {
      return await mockHandlers.updatePlayer(id, patch);
    } catch (err: any) {
      throw new ApiClientError(err.code, err.message, err.status);
    }
  }
  return request<{ player: Player }>(`/api/players/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deletePlayer(id: string): Promise<{ ok: boolean }> {
  if (USE_MOCKS) {
    return mockHandlers.deletePlayer(id);
  }
  return request<{ ok: boolean }>(`/api/players/${id}`, { method: 'DELETE' });
}

export async function transferMaster(id: string, pin?: string): Promise<{ ok: boolean }> {
  if (USE_MOCKS) {
    return mockHandlers.transferMaster(id, pin);
  }
  return request<{ ok: boolean }>(`/api/players/${id}/master`, {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

export async function getPlayerStats(id: string): Promise<{
  stats: PlayerStats;
  matches: {
    matchdayId: string;
    playedAt: string | null;
    team: 'A' | 'B';
    scoreA: number | null;
    scoreB: number | null;
  }[];
}> {
  if (USE_MOCKS) {
    return mockHandlers.getPlayerStats(id);
  }
  return request(`/api/players/${id}/stats`);
}

// ---------------- MATCHDAYS ----------------

export async function getMatchdays(
  limit = 20,
  cursor?: string
): Promise<{ matchdays: Matchday[]; nextCursor: string | null }> {
  if (USE_MOCKS) {
    return mockHandlers.getMatchdays(limit, cursor);
  }
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return request(`/api/matchdays?${params.toString()}`);
}

export async function getCurrentMatchday(): Promise<{ matchday: Matchday | null }> {
  if (USE_MOCKS) {
    return mockHandlers.getCurrentMatchday();
  }
  return request<{ matchday: Matchday | null }>('/api/matchdays/current');
}

export async function getMatchdayById(id: string): Promise<{ matchday: Matchday }> {
  if (USE_MOCKS) {
    return mockHandlers.getMatchdayById(id);
  }
  return request<{ matchday: Matchday }>(`/api/matchdays/${id}`);
}

export async function createMatchday(data: {
  playerIds: string[];
  leaderAId: string;
  leaderBId: string;
  method: 'auction' | 'shuffle';
  style?: 'price' | 'open';
  budget?: number;
  roundOrder?: Position[];
  /** The role each player will fill for this matchday, keyed by player id. */
  positions?: Record<string, Position>;
}): Promise<{ matchday: Matchday }> {
  if (USE_MOCKS) {
    try {
      return await mockHandlers.createMatchday(data);
    } catch (err: any) {
      throw new ApiClientError(err.code, err.message, err.status);
    }
  }
  return request<{ matchday: Matchday }>('/api/matchdays', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function startMatchday(id: string): Promise<{ matchday: Matchday }> {
  if (USE_MOCKS) {
    return mockHandlers.startMatchday(id);
  }
  return request<{ matchday: Matchday }>(`/api/matchdays/${id}/start`, { method: 'POST' });
}

export async function cancelMatchday(id: string): Promise<{ ok: boolean }> {
  if (USE_MOCKS) {
    return mockHandlers.cancelMatchday(id);
  }
  return request<{ ok: boolean }>(`/api/matchdays/${id}/cancel`, { method: 'POST' });
}

export async function deleteMatchday(id: string): Promise<{ ok: boolean }> {
  if (USE_MOCKS) {
    return mockHandlers.deleteMatchday(id);
  }
  return request<{ ok: boolean }>(`/api/matchdays/${id}`, { method: 'DELETE' });
}

// ---------------- DRAFT & LIVE ----------------

export async function getMatchdayState(
  id: string,
  lastVersion?: number
): Promise<{ state: DraftState; version: number; permissions: Permissions; roster: Player[]; prices?: Record<string, number>; notModified?: boolean }> {
  if (USE_MOCKS) {
    return mockHandlers.getMatchdayState(id);
  }
  const headers: Record<string, string> = {};
  if (lastVersion !== undefined) {
    headers['If-None-Match'] = `"${lastVersion}"`;
  }
  return request(`/api/matchdays/${id}/state`, { headers });
}

export async function nominate(
  id: string,
  version: number,
  playerId: string,
  price: number
): Promise<{ state: DraftState; version: number }> {
  if (USE_MOCKS) {
    try {
      return await mockHandlers.nominate(id, version, playerId, price);
    } catch (err: any) {
      throw new ApiClientError(err.code, err.message, err.status, err.data);
    }
  }
  return request<{ state: DraftState; version: number }>(`/api/matchdays/${id}/nominate`, {
    method: 'POST',
    body: JSON.stringify({ version, playerId, price }),
  });
}

export async function respond(
  id: string,
  version: number,
  action: 'take' | 'pass'
): Promise<{ state: DraftState; version: number }> {
  if (USE_MOCKS) {
    try {
      return await mockHandlers.respond(id, version, action);
    } catch (err: any) {
      throw new ApiClientError(err.code, err.message, err.status, err.data);
    }
  }
  return request<{ state: DraftState; version: number }>(`/api/matchdays/${id}/respond`, {
    method: 'POST',
    body: JSON.stringify({ version, action }),
  });
}

export async function bid(
  id: string,
  version: number,
  action: 'raise' | 'pass',
  amount?: 1 | 5
): Promise<{ state: DraftState; version: number }> {
  if (USE_MOCKS) {
    try {
      return await mockHandlers.bid(id, version, action, amount);
    } catch (err: any) {
      throw new ApiClientError(err.code, err.message, err.status, err.data);
    }
  }
  return request<{ state: DraftState; version: number }>(`/api/matchdays/${id}/bid`, {
    method: 'POST',
    body: JSON.stringify({ version, action, amount }),
  });
}

export async function shuffle(id: string): Promise<{
  split: { teamAIds: string[]; teamBIds: string[]; ratingGap: number };
  splitId: string;
  diff: number;
  legalCount: number;
}> {
  if (USE_MOCKS) {
    return mockHandlers.shuffle(id);
  }
  return request(`/api/matchdays/${id}/shuffle`, { method: 'POST' });
}

export async function lock(id: string, splitId: string): Promise<{ matchday: Matchday }> {
  if (USE_MOCKS) {
    try {
      return await mockHandlers.lock(id, splitId);
    } catch (err: any) {
      throw new ApiClientError(err.code, err.message, err.status);
    }
  }
  return request<{ matchday: Matchday }>(`/api/matchdays/${id}/lock`, {
    method: 'POST',
    body: JSON.stringify({ splitId }),
  });
}

export async function recordResult(
  id: string,
  scoreA: number,
  scoreB: number,
  scorers?: { userId: string; goals: number }[]
): Promise<{ matchday: Matchday }> {
  if (USE_MOCKS) {
    return mockHandlers.recordResult(id, scoreA, scoreB);
  }
  return request<{ matchday: Matchday }>(`/api/matchdays/${id}/result`, {
    method: 'POST',
    body: JSON.stringify({ scoreA, scoreB, scorers }),
  });
}

export async function getLeaderboard(): Promise<{ rows: LeaderboardRow[] }> {
  if (USE_MOCKS) {
    return mockHandlers.getLeaderboard();
  }
  return request<{ rows: LeaderboardRow[] }>('/api/leaderboard');
}
