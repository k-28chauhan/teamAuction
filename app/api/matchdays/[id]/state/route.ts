import { NextRequest, NextResponse } from 'next/server';
import { AppError, appError } from '@/lib/api/errors';
import { computePermissions, serializePlayer } from '@/lib/api/serialize';
import { requireUser, leaderTeamOf } from '@/lib/auth/guards';
import { getMatchdayById, getMatchdayPlayers } from '@/lib/db/repo';
import { isTeamsTurn } from '@/lib/draft/engine';

/**
 * The hot path: polled every 2s while a draft is open. Deliberately skips the
 * shared error-boundary wrapper (no logging, no transaction) per backend PRD
 * section 4 — this is a single indexed read and must stay fast.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const row = await getMatchdayById(id);
    if (!row) throw appError('NOT_FOUND', "That matchday doesn't exist.");

    // Freshness here is driven entirely by our own version-based ETag check
    // below — never by the browser's own implicit HTTP cache. Without
    // no-store, a browser that already has a 200 for this URL+ETag cached
    // will silently keep reusing that old body on every future poll (even
    // across full page reloads) for as long as the version doesn't change,
    // which would hide any change to what this route returns.
    const noCacheHeaders = { 'Cache-Control': 'no-store' };
    const etag = `"${row.version}"`;
    if (req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, ...noCacheHeaders } });
    }

    const team = leaderTeamOf(row, user.id);
    const canAct = user.isMaster
      ? row.status === 'drafting' && row.state.phase !== 'complete'
      : team !== null && row.status === 'drafting' && isTeamsTurn(row.state, team);

    // Every player's role for THIS matchday (may differ from their profile
    // position — see matchdayPlayers.position) so the client never has to
    // fall back to profile data and show the wrong role mid-draft.
    const playersByUser = await getMatchdayPlayers(id);
    const roster = [...playersByUser.values()].map((entry) => serializePlayer(entry.user, entry.position));
    // What each already-sold player went for, so the live decks can show the record as it builds.
    const prices: Record<string, number> = {};
    for (const [userId, entry] of playersByUser) {
      if (entry.price !== null) prices[userId] = entry.price;
    }

    return NextResponse.json(
      {
        state: row.state,
        version: row.version,
        permissions: computePermissions({ isMaster: user.isMaster, team, canAct }),
        roster,
        prices,
      },
      { headers: { ETag: etag, ...noCacheHeaders } }
    );
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    console.error('[matchday state] unhandled error', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Something went wrong on our end. Try again in a moment.' } },
      { status: 500 }
    );
  }
}
