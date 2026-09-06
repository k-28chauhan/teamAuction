import type { ApiErrorCode } from '@/lib/contract/types';

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  /** Extra top-level fields merged into the response body, e.g. STALE_VERSION's current `state`/`version`. */
  readonly extra?: Record<string, unknown>;

  constructor(code: ApiErrorCode, message: string, status: number, extra?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  USERNAME_TAKEN: 409,
  UNKNOWN_USERNAME: 401,
  PIN_REQUIRED: 401,
  BAD_PIN: 401,
  ACTIVE_MATCHDAY_EXISTS: 409,
  STALE_VERSION: 409,
  NOT_YOUR_TURN: 403,
  EXCEEDS_MAX_BID: 422,
  BELOW_BASE_PRICE: 422,
  INELIGIBLE_PLAYER: 422,
  POSITION_LIMIT: 422,
  ODD_PLAYER_COUNT: 422,
  NO_LEGAL_SPLIT: 409,
  WRONG_PHASE: 422,
  VALIDATION_ERROR: 422,
};

/** Every message here is shown to the player verbatim — keep it plain and blame-free. */
export function appError(code: ApiErrorCode, message: string, extra?: Record<string, unknown>): AppError {
  return new AppError(code, message, STATUS_BY_CODE[code], extra);
}
