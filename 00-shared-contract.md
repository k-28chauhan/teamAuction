# Turf — Shared Contract

**Read this before writing any code.** Both the frontend and backend are built against this document. Anything not defined here must be raised as a question, not invented. If you need to change something in this file, change it here first and flag it, because the other side is building against the same text.

Stack: Next.js (App Router) · React · TypeScript · PostgreSQL. Single repository, one Next.js app, backend lives in route handlers.

---

## 1. What the product is

A group of 15–20 friends play 5-a-side or 6-a-side football on turf. Splitting into two fair teams wastes ten minutes every session and the teams still end up lopsided. This app runs that split.

One person (the **master**) picks who has turned up and appoints two **leaders**. The leaders divide the players between them, either through a credit auction or an automatic balanced shuffle. The score gets recorded afterwards and every player can see their own record.

The app is used standing on a turf, at night, on phones, by people who want to start playing. Every screen is judged on how fast it gets out of the way.

---

## 2. Roles and access

There are three levels of access. **All of them are resolved on the server from the session. The client never sends its own role.**

| Capability | Player | Leader | Master |
|---|---|---|---|
| Log in, see squad, results, own profile | Yes | Yes | Yes |
| Watch a live draft | Yes | Yes | Yes |
| Add, edit, deactivate squad members | No | No | Yes |
| Create a matchday, pick who is available | No | No | Yes |
| Add a guest player for one match | No | No | Yes |
| Appoint the two leaders | No | No | Yes |
| Choose draft method and settings | No | No | Yes |
| Nominate, bid, take, pass in an auction | No | Own team only | Yes (override) |
| Re-roll and lock a balanced shuffle | No | Yes | Yes |
| Enter or correct a final score | No | Yes | Yes |
| Cancel or reset a draft | No | No | Yes |
| Transfer master to another user | No | No | Yes |

**Leader is not a stored role.** A user is a leader of a given matchday if and only if `matchday.leader_a_id` or `matchday.leader_b_id` equals their user id. It is scoped to that matchday and evaporates when the matchday completes. Do not add a `role` column with the value `leader`.

Master is a single boolean on `users`, and exactly one user has it at a time. Transferring it clears the old one and sets the new one inside a transaction.

---

## 3. Authentication

Login is **username only**. The user types a username, the server checks it exists on the roster and is active, and issues a session. There is no password and no registration flow — the master creates accounts by adding people to the squad.

**Be honest about what this is:** it is identification, not authentication. Anyone who knows a username can act as that person. This is an accepted trade-off for a group of friends who want zero friction, and it is bounded by three things:

1. The roster is closed. Only usernames the master has created can log in.
2. Actions are logged with the acting user id, so any abuse is visible in the draft log.
3. **The master account requires a 4-digit PIN in addition to the username.** This is the one exception, because master powers include wiping the squad and cancelling a live draft. The PIN is set by the master, stored as a bcrypt hash, and defaults to `1234` on the seeded account with a prompt to change it on first login.

Do not add passwords anywhere else. If you think a capability needs more protection than this, raise it rather than adding a login wall.

**Session mechanics:** signed, httpOnly, sameSite=lax cookie containing a JWT with `{ userId, username, isMaster, iat, exp }`. Thirty day expiry, refreshed on activity. Secret in `AUTH_SECRET`. `isMaster` in the token is a hint for the UI only — every protected route re-reads the flag from the database.

---

## 4. Data model

Postgres. Snake case in the database, camel case over the wire. The API layer does the conversion; the frontend never sees snake case.

```sql
-- one row per person who can log in, including guests
users
  id              uuid primary key default gen_random_uuid()
  username        citext unique not null           -- login handle, no spaces
  display_name    text not null
  position        text not null                    -- 'GK' | 'DEF' | 'MID' | 'FWD'
  rating          smallint not null default 5      -- 1..10, set by master
  is_master       boolean not null default false
  is_guest        boolean not null default false   -- hidden from default squad list
  is_active       boolean not null default true    -- soft delete
  master_pin_hash text                             -- only non-null when is_master
  created_at      timestamptz not null default now()

matchdays
  id              uuid primary key
  status          text not null                    -- see state machine below
  method          text not null                    -- 'auction' | 'shuffle'
  style           text                             -- 'price' | 'open', auction only
  budget          smallint                         -- credits per leader, auction only
  round_order     text[]                           -- e.g. '{GK,FWD,MID,DEF}'
  team_size       smallint not null                -- players per side, leader included
  leader_a_id     uuid references users(id)
  leader_b_id     uuid references users(id)
  state           jsonb not null                   -- live draft state, section 5
  version         integer not null default 0       -- optimistic lock
  score_a         smallint
  score_b         smallint
  created_by      uuid not null references users(id)
  created_at      timestamptz not null default now()
  played_at       timestamptz

-- who was available for this matchday, and where they ended up
matchday_players
  matchday_id     uuid references matchdays(id) on delete cascade
  user_id         uuid references users(id)
  team            text                             -- 'A' | 'B' | null until assigned
  price           smallint                         -- credits paid, null for shuffle
  primary key (matchday_id, user_id)

-- append-only audit of everything that happened during a draft
draft_events
  id              bigserial primary key
  matchday_id     uuid references matchdays(id) on delete cascade
  sequence        integer not null
  actor_id        uuid references users(id)
  type            text not null                    -- 'nominate'|'take'|'pass'|'raise'|'autofill'|'shuffle'|'lock'
  payload         jsonb not null
  created_at      timestamptz not null default now()
  unique (matchday_id, sequence)
```

Guests are ordinary `users` rows with `is_guest = true`. They can log in and see their record like anyone else, they just do not clutter the squad list. The master can promote a guest to a regular by clearing the flag.

Ratings are integers 1–10, entered manually by the master. Automatic rating updates from results are explicitly **out of scope** for v1 — leave room for it, don't build it.

---

## 5. Draft state machine

`matchdays.status` moves through:

```
setup ──start──> drafting ──complete──> teams_set ──score──> completed
  │                  │
  └──────cancel──────┴──────> cancelled
```

Only one matchday may be in `setup`, `drafting` or `teams_set` at a time. Creating a new one while another is active returns `409 ACTIVE_MATCHDAY_EXISTS`.

`matchdays.state` holds the live draft. Shape:

```ts
type Team = 'A' | 'B';
type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

type DraftState = {
  phase: 'nominate' | 'respond' | 'bidding' | 'complete';
  turn: Team;                    // whose turn it is to nominate
  currentRound: Position | null; // position being auctioned right now
  poolIds: string[];             // unsold players
  teams: Record<Team, {
    leaderId: string;
    budget: number;              // credits remaining
    playerIds: string[];         // includes the leader
  }>;
  nomination: {
    playerId: string;
    price: number;
    nominatedBy: Team;
    highTeam: Team;              // who currently holds the player, 'open' style
  } | null;
  log: { text: string; at: string }[];  // newest first, capped at 50
};
```

### Auction rules — enforce every one of these on the server

**Starting price.** Every player has a reserve price set from their rating (`basePriceForRating(rating) = max(1, round(rating))`) — a nomination price, and the opening bid in open-style auctions, may never be below it. Below-floor nominations are rejected with `422 BELOW_BASE_PRICE`.

**Budget cap.** A leader may never bid so much that they can no longer complete their squad. The reserve isn't a flat 1 credit per empty slot — it's the combined starting price of the cheapest players still legally available to that team, one per remaining slot, recomputed fresh on every action (so it tightens automatically as the cheap end of the pool sells):

```
maxBid(team) = team.budget - sum(startingPrice(p) for p in cheapest N eligible pool players)
  where N = teamSize - team.playerIds.length - 1 (after this pick)
  and "eligible" excludes any position the team is already capped on (see below)
```

Any nomination price or raise above this is rejected with `422 EXCEEDS_MAX_BID`.

**Position rounds.** `currentRound` is the first position in `round_order` that still has an unsold player. Only players of that position may be nominated. When the round empties, advance automatically.

**Position cap.** No side may hold more than half (rounded up) of the squad's whole supply of any one position — `cap(position) = ceil(totalOfPosition / 2)`. An odd supply still splits fairly (5 forwards → cap 3, worst split 3-2, never 4-1). This generalises what used to be a keeper-only rule to every position — GK included, since `ceil(n/2)` already guarantees both sides get one keeper whenever n ≥ 2. Exceeding it is rejected with `422 POSITION_LIMIT`.

**Turn.** Alternates on every resolution, regardless of who won the player. If the team whose turn it is has no eligible player this round — because of the position cap — the turn passes to the other team. If neither can act, advance the round.

**Auto-fill.** The moment one team reaches `team_size`, every remaining player in the pool is assigned to the other team at zero cost, an `autofill` event is written, and the phase becomes `complete`.

### The two bidding styles

**`price` — name your price (default).** The nominating leader picks a player *and* sets a price. The other leader either takes him at that price or passes, in which case the nominator buys him at his own price. This is deliberate: it removes the chicken-game dynamic of two-person open bidding and forces honest prices, because lowballing hands your friend a bargain and inflating leaves you paying it. Phase goes `nominate` → `respond` → resolved.

If the responding team cannot afford the price, the UI must show that they are forced to pass, and the server must still accept only a `pass` from them.

**`open` — open bidding.** The nominator opens at 1 credit and holds the player. The other leader raises by 1 or 5, or passes. Each raise flips `highTeam`. A pass sells the player to `highTeam` at the current price. Phase goes `nominate` → `bidding` → resolved.

### Shuffle method

No auction. The server enumerates every way to split the available players into two sides of `team_size`, discards illegal ones, and ranks by rating gap.

Legality: both teams have at least one keeper when two or more keepers are available; forward counts differ by at most one; midfield counts differ by at most one.

With twelve players this is 924 combinations, so brute force is correct and fast — do not reach for a heuristic. Fix player index 0 into team A to avoid enumerating each split twice.

`POST /shuffle` returns one split chosen at random from those within one rating point of the best. Re-rolling gives a different lineup each week without being unfair. `POST /lock` commits the currently shown split, which the client identifies by `splitId` returned alongside it.

---

## 6. Concurrency

Two leaders on two phones will act at the same time. Every mutating draft endpoint takes the `version` the client last saw:

```
POST /api/matchdays/:id/nominate
{ "version": 7, "playerId": "...", "price": 12 }
```

The server, inside a transaction, does `SELECT ... FOR UPDATE`, compares versions, and returns `409 STALE_VERSION` with the current state attached if they differ. The client replaces its state with the returned one and shows a brief "someone got there first" note. It does not retry automatically.

`version` increments on every successful mutation.

---

## 7. Live updates

Polling, not websockets. `GET /api/matchdays/:id/state` every 2 seconds while a draft is open, paused when the tab is hidden. The endpoint is cheap — one indexed row read — and returns `304` against an `If-None-Match` header carrying the version as an ETag.

An auction is turn-based, not continuous, so two seconds of latency is invisible. Do not add a realtime layer in v1.

---

## 8. API

All routes under `/api`. All responses JSON. Authenticated routes read the session cookie; unauthenticated requests get `401`.

### Errors

Every failure returns the same shape and a meaningful status:

```json
{ "error": { "code": "EXCEEDS_MAX_BID", "message": "You need to keep 3 credits for your remaining slots." } }
```

`message` is written for a player standing on a turf, not for a developer. The frontend displays it verbatim, so it must never contain a stack trace, a column name or the word "invalid".

Codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `USERNAME_TAKEN`, `UNKNOWN_USERNAME`, `PIN_REQUIRED`, `BAD_PIN`, `ACTIVE_MATCHDAY_EXISTS`, `STALE_VERSION`, `NOT_YOUR_TURN`, `EXCEEDS_MAX_BID`, `BELOW_BASE_PRICE`, `INELIGIBLE_PLAYER`, `POSITION_LIMIT`, `ODD_PLAYER_COUNT`, `NO_LEGAL_SPLIT`, `WRONG_PHASE`, `VALIDATION_ERROR`.

### Endpoints

```
POST   /api/auth/login          { username, pin? }        -> { user }
POST   /api/auth/logout                                   -> { ok: true }
GET    /api/auth/me                                       -> { user, permissions }

GET    /api/players?includeGuests=false                   -> { players: Player[] }
POST   /api/players             master                    -> { player }
PATCH  /api/players/:id         master                    -> { player }
DELETE /api/players/:id         master  (soft)            -> { ok: true }
POST   /api/players/:id/master  master  (transfer)        -> { ok: true }
GET    /api/players/:id/stats                             -> { stats, matches }

GET    /api/matchdays?limit=&cursor=                      -> { matchdays, nextCursor }
GET    /api/matchdays/current                             -> { matchday | null }
POST   /api/matchdays           master                    -> { matchday }
PATCH  /api/matchdays/:id       master  (setup only)      -> { matchday }
GET    /api/matchdays/:id                                 -> { matchday }
POST   /api/matchdays/:id/start   master                  -> { matchday }
POST   /api/matchdays/:id/cancel  master                  -> { ok: true }

GET    /api/matchdays/:id/state                           -> { state, version, permissions }
POST   /api/matchdays/:id/nominate  leader                -> { state, version }
POST   /api/matchdays/:id/respond   leader { action }     -> { state, version }
POST   /api/matchdays/:id/bid       leader { action, amount } -> { state, version }
POST   /api/matchdays/:id/shuffle   leader|master         -> { split, splitId, diff, legalCount }
POST   /api/matchdays/:id/lock      leader|master { splitId } -> { matchday }
POST   /api/matchdays/:id/result    leader|master { scoreA, scoreB } -> { matchday }

GET    /api/leaderboard                                   -> { rows: LeaderboardRow[] }
```

`permissions` is computed per request and tells the client what to render:

```ts
type Permissions = {
  isMaster: boolean;
  isLeader: boolean;
  team: 'A' | 'B' | null;
  canAct: boolean;      // it is this user's turn right now
};
```

**The client renders buttons from `permissions`, but the server checks again on every call.** Hiding a button is a courtesy, not a control.

### Shared types

Both sides import from `lib/contract/types.ts`. The backend agent owns that file; the frontend agent reads it and does not edit it. Core shapes:

```ts
type Player = {
  id: string; username: string; displayName: string;
  position: Position; rating: number;
  isMaster: boolean; isGuest: boolean; isActive: boolean;
};

type Matchday = {
  id: string; status: MatchdayStatus; method: 'auction' | 'shuffle';
  style: 'price' | 'open' | null; budget: number | null;
  roundOrder: Position[]; teamSize: number;
  leaderA: Player | null; leaderB: Player | null;
  teams: { A: Player[]; B: Player[] };
  scoreA: number | null; scoreB: number | null;
  createdAt: string; playedAt: string | null;
};

type PlayerStats = {
  played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; winRate: number;
};
```

---

## 9. Repository layout and ownership

One repo, one Next.js app, clear boundaries so two agents don't collide.

```
/app
  /(auth)/login              FRONTEND
  /(app)/…                   FRONTEND   all player-facing pages
  /api/…                     BACKEND    route handlers
/components                  FRONTEND
/lib
  /contract/types.ts         BACKEND owns, FRONTEND reads
  /api-client                FRONTEND   typed fetch wrappers
  /db                        BACKEND    schema, client, queries
  /draft                     BACKEND    the engine
  /auth                      BACKEND    session, guards
/drizzle                     BACKEND    migrations
/mocks                       FRONTEND   MSW handlers
```

Neither agent edits the other's directories. If the frontend needs a field that does not exist, it adds it to the mock and raises it — it does not add a column.

---

## 10. Out of scope for v1

Named here so neither agent builds them: automatic Elo rating updates, per-player goals and assists, RSVP or availability polling, push notifications, payments or subscriptions, multiple concurrent groups or tenancy, native apps, websockets, image uploads.
