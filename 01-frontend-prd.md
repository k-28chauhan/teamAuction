# Turf — Frontend PRD

For the agent building the client. Read `00-shared-contract.md` first — this document assumes it.

You own `/app/(auth)`, `/app/(app)`, `/components`, `/lib/api-client`, `/mocks`. You do not edit `/app/api`, `/lib/db`, `/lib/draft` or `/drizzle`. You read `/lib/contract/types.ts` and never modify it.

---

## 1. Build against mocks first

The backend is being built in parallel. Do not wait for it and do not stub with inline fake data scattered through components.

Set up MSW in `/mocks` with a handler for every endpoint in section 8 of the contract, backed by an in-memory store that actually enforces the draft rules. This matters more than it sounds: if your mock lets a leader bid past their budget cap, you will not build the error state, and the real backend will reject it in front of your users. Mock the failures too — `STALE_VERSION`, `EXCEEDS_MAX_BID`, `NOT_YOUR_TURN` — and make sure each has a visible UI response.

All network calls go through typed wrappers in `/lib/api-client`. No component calls `fetch` directly. Swapping mocks for the real API should be one environment variable.

---

## 2. Design direction

The brief is "modern and simplistic". That phrase produces the same page every time — white background, a grey card grid, one rounded-blue accent, a tracked-out caps label over each section. Do not build that page.

Ground it in the actual subject instead. This is football on turf, after dark, under floodlights, on a phone held in one hand while someone shouts about who gets the good keeper. The reference is a **team sheet under stadium light**: dark, high contrast, numbers that read at arm's length, two team colours that never get confused.

### Tokens

```
--pitch      #0F1521   base, a blue-black rather than a grey-black
--panel      #182234
--panel-2    #1F2C42
--line       #2E3E58
--chalk      #EDF2F8   primary text
--muted      #8FA2BE   secondary text
--flood      #FFB020   the single accent: amber floodlight
--team-a     #E5484D
--team-b     #3B9EFF
--good       #3DD68C
```

One accent only. Amber marks the thing the user must act on next and nothing else — not headings, not borders, not decoration. If amber appears twice on a screen, one of them is wrong.

### Type

Two faces, clearly distinct in role:

- **Barlow Condensed** (600/700) for headings, team names, scores, credit amounts, ratings. It is the vernacular of kit numbers and scoreboards, and condensed type lets a big number stay big on a 380px screen.
- **Barlow** (400/500/600) for body, labels and buttons.

Scale: 30 / 22 / 17 / 15 / 13. Sentence case everywhere. Do not use all-caps labels, do not put an eyebrow label above sections, and do not accent one word of a heading in a different colour.

### Layout

Mobile is the primary target, not a responsive afterthought — assume 380px wide and design up. Single column, max width 780px on desktop, fixed bottom tab bar with four items: **Matchday · Squad · Results · You**.

Give the draft screen the whole viewport hierarchy. Two team panels sit at the top, distinguished by a coloured top border rather than tinted backgrounds, so the panels stay readable. The action zone sits below them and is the only place with an amber element.

### Restraint

- Motion only in response to a tap: a button confirming, a panel expanding, a player sliding into a team list when sold. No entrance animations on page load, no hover transitions on every card. Respect `prefers-reduced-motion`.
- One border radius (8px) for panels, one (6px) for controls. Do not vary it per element.
- No drop shadows. Separation comes from the 1px `--line` border.
- Empty states are an instruction, not a mood: "The squad is empty. Ask whoever has master access to add everyone." Never "Nothing here yet 🙁".

---

## 3. Screens

### Login — `/login`

One field: username. A single button that says **Continue**. Below it, quiet text: "Ask the organiser to add you if your name isn't set up yet."

If the username belongs to the master, the server returns `PIN_REQUIRED`; reveal a four-digit PIN field in place and keep the username filled. Do not show the PIN field speculatively — most people never see it.

Unknown username shows the server's message inline under the field, not a toast.

Everything below requires a session. Unauthenticated visits redirect to `/login` with a `?next=` param.

### Matchday — `/` (default tab)

This tab is a router based on `GET /api/matchdays/current`, and its content is entirely dependent on state:

**Nothing active, viewer is not master.** Quiet screen: no draft running, plus the date and score of the last match. One line telling them who has master access, so they know who to nudge.

**Nothing active, viewer is master.** The setup flow, three steps with a visible step indicator (this is a genuine sequence, so numbering is justified here — it is not justified anywhere else in the app).

1. *Who's playing?* The squad as a tappable list, each row showing position chip, name, rating, and a selection state. A running count pinned at the bottom: "8 selected · 4 a side". An **Add a guest** panel takes name, position and rating, creates the account and pre-selects them. Block continuing on an odd count with plain text explaining why.
2. *Pick the leaders.* Two panels, A and B, each with a picker over the selected players. Selecting someone in one removes them from the other's list.
3. *How are you splitting?* Two options as full-width choices with a sentence of explanation each — the credit auction ("takes a few minutes, and it's the fun one") and the balanced shuffle ("instant, uses ratings to find the evenest split"). Choosing the auction reveals its settings: bidding style, credits per leader, round order. Default to name-your-price, 100 credits, keepers first.

**Draft running.** The live screen, section 4.

**Teams set, no score yet.** Both lineups, and a score entry visible to leaders and master only. Everyone else sees the lineups and a note that the score goes in after the game.

### Squad — `/squad`

Everyone sees the roster grouped by position, sorted by rating within each group. Master additionally gets inline editing, an add-player form, deactivate, and master transfer. Non-master users see no edit affordances at all — no greyed-out buttons.

Guests are listed in a separate collapsed group at the bottom labelled by what they are, with a control to make one a regular.

### Results — `/results`

Reverse-chronological list. Each row: date, the score in condensed numerals, and which team won. Tapping expands both lineups and, for auction matches, what each player went for. Auction prices are the most re-read thing in the whole app after the score, so make them easy to scan.

Infinite scroll off the cursor, twenty at a time.

### You — `/you`

The signed-in player's record: played, won, drawn, lost as four large condensed numbers; goals for and against; win rate. Below, their match history with their own team's score first and the result colour-coded. Sign out at the bottom.

---

## 4. The live draft screen

The hardest screen in the app and the one that decides whether this thing gets used. Everyone in the group has it open at once; only two of them can act.

### Structure

Top: the two team panels side by side, stacking on narrow screens. Each shows the team letter, remaining credits, a thin spent-budget bar, the players signed so far with their price, and empty slots rendered as visible placeholders so the shape of what's left is obvious.

Middle: the action zone, which changes with `state.phase`.

Bottom: the sold log, newest first, six entries visible.

Header shows the current round and how many players remain: "Keeper round · 7 left".

### Action zone by phase

**`nominate`.** The eligible players for the current round, filtered by the keeper rule. For name-your-price, each row carries a price input and an **Offer** button. For open bidding, a **Nominate** button. Show the nominating team's max bid as a chip and clamp the input to it client-side, while still handling the server's rejection.

**`respond`.** The player's name large, the price larger, and two buttons for the responding leader: take him at that price, or pass and let the other team keep him. When the price exceeds the responder's max bid, disable take and state plainly that they cannot afford him and have to pass.

**`bidding`.** Current price large, who leads, and for the other leader: raise by 1, raise by 5, or pass. Passing sells at the current price, so label that button with the outcome — "Pass — Team A gets him for 14" — not just "Pass".

**Anyone who cannot act** sees the same information with the buttons replaced by a single line: "Waiting for Team B." Never show a disabled button to someone who will never be able to press it.

### Polling

Poll `/state` every 2 seconds with `If-None-Match: <version>`. Pause on `document.hidden`, resume and fetch immediately on focus. Stop when the phase is `complete`.

When a mutation returns `409 STALE_VERSION`, replace local state with the returned state and show a brief inline note rather than a modal. This will happen regularly and must feel like nothing.

Mutations are optimistic only for the local button's pressed state. Never optimistically move a player into a team — an auction reversal is far more confusing than 300ms of latency.

### Interruptions

The screen is used on flaky phone signal. A failed poll retries with backoff and after three failures shows a persistent but unobtrusive "reconnecting" strip. It does not clear the screen or throw the user back to a loading spinner — the last known state stays visible, because a leader looking at slightly stale teams is far better off than a leader looking at nothing.

---

## 5. Technical requirements

- Next.js App Router, TypeScript strict, React Server Components for the static shells (squad, results, profile) and client components for anything interactive.
- Server-side session read in a root layout so an unauthenticated user never sees a flash of the app.
- TanStack Query for the polling and mutation lifecycle. It handles ETags, background refetch, focus behaviour and retry cleanly, and hand-rolling this will go wrong.
- Tailwind with the tokens above defined as CSS variables in the theme. No arbitrary colour values in components.
- No global state manager. Server state is TanStack Query, UI state is `useState`.
- Every interactive element reachable by keyboard with a visible focus ring. Text contrast at least 4.5:1 against its panel — check the muted colour, it is the one that will fail.
- Loading states are skeletons matching the final layout, not spinners, except for button-level pending states.

## 6. Definition of done

- A full matchday can be run end to end against mocks: create, select ten players, add a guest, appoint leaders, run a name-your-price auction to completion, enter a score, and see it in results and in a player's profile.
- The same flow works with the open bidding style and with the shuffle method.
- Two browser windows logged in as the two leaders can run an auction against each other, each seeing the other's actions within two seconds.
- A third window logged in as an ordinary player watches the whole thing without ever seeing an action button.
- Every error code in the contract has a designed UI response that has been visually confirmed.
- Usable one-handed on a 380px viewport with no horizontal scroll on any screen.
