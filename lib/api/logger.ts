type LogFields = {
  requestId: string;
  route: string;
  method: string;
  userId?: string | null;
  outcome: 'ok' | 'error';
  code?: string;
  durationMs?: number;
  [key: string]: unknown;
};

/** One structured JSON line per request/mutation. See PRD section 6: draft_events + logs answer "did the auction cheat me". */
export function logEvent(fields: LogFields): void {
  console.log(JSON.stringify({ level: fields.outcome === 'error' ? 'warn' : 'info', ...fields, at: new Date().toISOString() }));
}
