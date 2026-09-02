# Family Game Night — Sequence-Style Game MVP
## Codex Build Specification

**Project status:** Greenfield  
**Primary repository name:** `family-game-night`  
**Initial game:** Working title **Card Lines** (a Sequence-style card-and-chip game)  
**Target deployment:** GitHub Pages static frontend + Cloudflare Worker API + Cloudflare D1 + Cloudflare Access  
**Primary mode:** Private, asynchronous play among an allowlisted family group  
**Specification date:** 2026-09-02

---

## 0. Instructions to Codex

Read this document completely before changing code. Treat it as the implementation authority for the first release.

1. Begin by creating `docs/IMPLEMENTATION_PLAN.md`, translating the milestones in this specification into concrete tasks and checkboxes.
2. Build in vertical slices, but implement and thoroughly test the pure game engine before relying on it from the API or UI.
3. Do not replace the fixed board map with a generated or randomized layout.
4. Do not simplify or omit the Jack rules, dead-card exchange, corner behavior, sequence overlap rule, protected sequence chips, hidden hands, or optimistic concurrency.
5. The server is authoritative. Never accept a move merely because the browser says it is legal.
6. Never return another player's hand, the deck order, a shuffle seed, or any other hidden state to the client.
7. Use strict TypeScript. Avoid `any`, unvalidated JSON, and unchecked casts at trust boundaries.
8. Every accepted state-changing request must be idempotent and guarded by an expected game version.
9. Do not commit secrets. Include `.dev.vars.example`, environment-variable documentation, and exact manual Cloudflare/GitHub setup instructions.
10. At the end of every milestone, run the complete applicable test, typecheck, lint, and build commands. Fix failures rather than suppressing them.
11. Do not leave game-rule TODOs or placeholder logic in a milestone marked complete.
12. When external dashboard configuration is required, create a precise checklist instead of pretending it was configured.

A milestone is complete only when its acceptance checks pass.

---

## 1. Product Vision

**Family Game Night** is a private website where family members sign in, create multiple simultaneous games, and take turns asynchronously. The site will eventually contain several board and card games. This first release implements one complete Sequence-style game and the minimum reusable shell needed to support more games later.

The intended experience is:

1. A family member visits the site and authenticates by email.
2. The dashboard shows games in which it is their turn, games waiting on someone else, invitations, and finished games.
3. A user creates a Card Lines game, invites family members, assigns equal teams, and starts once the lobby is valid.
4. Players take turns whenever convenient. State survives refreshes, device changes, and long gaps between turns.
5. Each player sees only their own hand. The server validates every action and records a public move history.
6. The game ends automatically when a team completes the required number of sequences.

### 1.1 Success criteria for the MVP

The MVP succeeds when a real family group can complete a two-team or three-team game, over multiple days and devices, without an administrator repairing state manually.

### 1.2 Deliberate non-goals for the MVP

Do **not** build the following yet:

- additional games;
- public matchmaking;
- anonymous play;
- spectators;
- AI opponents;
- real-time sockets, voice, or chat;
- email or push turn notifications;
- tournaments, ratings, achievements, or leaderboards;
- house-rule editors;
- offline move submission;
- native mobile apps;
- a general-purpose dynamic plugin system;
- automated modification of the Cloudflare Access allowlist.

The architecture should leave room for future games, but the first release must stay small and reliable.

---

## 2. Naming and Asset Policy

The code may use the internal identifier `sequence`, but the public game tile should use an original working name such as **Card Lines** or **Five in a Row** unless the project owner deliberately chooses otherwise.

Do not include:

- the commercial game's logo;
- box art;
- scans or photographs of the supplied board;
- copied card illustrations;
- copied instruction-booklet prose;
- other protected branding or trade dress.

Render the game with original styling. Playing cards should be lightweight HTML/CSS or original SVG showing rank and suit. Face cards may be represented simply as `J`, `Q`, or `K` plus the suit symbol; illustrated court figures are unnecessary.

The mechanics, fixed card map, and paraphrased rules in this specification are the product reference for the implementation.

---

## 3. Architecture Decision

### 3.1 Production topology

Use a same-origin architecture on a Cloudflare-managed custom hostname, for example `games.example.com`:

- **Static frontend:** built from the GitHub repository and published by GitHub Pages.
- **Static origin:** the custom hostname points to the GitHub Pages site through Cloudflare DNS.
- **API:** a Cloudflare Worker route handles `games.example.com/api/*`.
- **Database:** Cloudflare D1, bound to the Worker.
- **Authentication gate:** Cloudflare Access protects `games.example.com/*`.
- **Login method:** Cloudflare Access email one-time PIN for a specifically allowlisted set of family email addresses.
- **Application identity:** the Worker validates the Access JWT on every API request and derives the user's normalized email from verified claims.

All browser API calls therefore use relative URLs such as `/api/v1/games`; no production CORS configuration should be necessary.

### 3.2 Why this topology

- GitHub Pages remains the static host requested for the project.
- Cloudflare handles authentication, API execution, and persistence without a continuously running server.
- Same-origin requests avoid the awkward Access-cookie and preflight behavior of a split frontend/API origin.
- D1 is sufficient for turn-based family traffic; Durable Objects are not required for the MVP.
- A version column plus conditional writes prevents double moves and stale-tab overwrites.

### 3.3 Important deployment reality

The frontend JavaScript and static assets are not secrets. A public GitHub Pages repository exposes source code and the browser necessarily receives the built bundle. Security must come from protecting the API and database, not from hiding frontend code.

The production topology assumes the project owner controls a domain or subdomain in Cloudflare DNS. If no domain is available during early development, use local development only; do not redesign production around a cross-origin `workers.dev` API unless explicitly directed.

### 3.4 Current free-tier guardrails

Design for the current Cloudflare free plan:

- keep Worker handlers small and CPU-light;
- poll only while a tab is visible;
- index every common D1 filter;
- do not perform table scans for dashboard refreshes;
- store one compact game snapshot plus a modest public event log;
- log metrics without logging hidden cards or authentication tokens.

Current quotas are ample for a small family group, but they are external platform policy and must be rechecked before launch. Do not hardcode quota numbers into application logic.

---

## 4. Technology Stack

Use current stable releases at implementation time and commit exact versions in the lockfile.

### 4.1 Repository and package management

- `pnpm` workspaces
- TypeScript with `strict: true`
- Node version pinned in `.nvmrc` or `.node-version`
- ESLint and Prettier

### 4.2 Frontend

- React
- Vite
- React Router using **hash routing** for robust GitHub Pages deep links
- TanStack Query for API cache, refetch-on-focus, and conditional polling
- Plain CSS, CSS Modules, or another locally owned styling layer
- No large component framework for the MVP

### 4.3 Worker API

- Cloudflare Workers, module syntax
- Hono for routing and middleware
- Zod or an equivalently strict runtime schema validator for request bodies, environment variables, persisted state, and API responses
- D1 prepared statements and SQL migrations
- A lightweight standards-compliant JWT verifier using Web Crypto; cache the Access JWKS safely within the Worker isolate

### 4.4 Testing

- Vitest for unit tests
- React Testing Library for components
- Cloudflare-compatible Worker/D1 integration tests using the currently supported Wrangler/Miniflare test environment
- Playwright for end-to-end tests
- Optional `fast-check` for engine invariants and property tests

### 4.5 Avoid for the MVP

- a heavyweight ORM;
- Redux unless a concrete need emerges;
- WebSockets or Durable Objects;
- external fonts, analytics, ad scripts, or trackers;
- any backend framework that requires a Node server runtime.

---

## 5. Repository Layout

Use this shape unless a small adjustment is justified in `docs/IMPLEMENTATION_PLAN.md`:

```text
family-game-night/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  │  ├─ app/
│  │  │  ├─ components/
│  │  │  ├─ features/auth/
│  │  │  ├─ features/dashboard/
│  │  │  ├─ features/games/
│  │  │  └─ features/sequence/
│  │  ├─ public/
│  │  └─ vite.config.ts
│  └─ worker/
│     ├─ src/
│     │  ├─ auth/
│     │  ├─ db/
│     │  ├─ games/
│     │  ├─ routes/
│     │  └─ index.ts
│     └─ wrangler.toml
├─ packages/
│  ├─ shared/
│  │  └─ src/          # Public DTOs, command schemas, common utilities
│  └─ sequence-engine/
│     ├─ src/          # Pure internal rules engine
│     └─ test/
├─ migrations/
├─ docs/
│  ├─ IMPLEMENTATION_PLAN.md
│  ├─ ARCHITECTURE.md
│  ├─ RULES_CARD_LINES.md
│  ├─ CLOUDFLARE_SETUP.md
│  ├─ GITHUB_PAGES_SETUP.md
│  └─ OPERATIONS.md
├─ scripts/
├─ .github/workflows/
│  ├─ ci.yml
│  ├─ deploy-pages.yml
│  └─ deploy-worker.yml
├─ .dev.vars.example
├─ package.json
├─ pnpm-workspace.yaml
├─ README.md
└─ LICENSE             # Add only after the project owner chooses a license
```

Keep internal game state types inside `sequence-engine`. Shared browser DTOs must not expose internal state merely because the types are convenient.

---

## 6. Minimal Multi-Game Foundation

Do not build a dynamic plugin marketplace. Implement only a small typed registry so future games do not require rewriting authentication, persistence, and the dashboard.

A game module should conceptually provide:

```ts
interface GameModule<TConfig, TState, TCommand, TView> {
  readonly gameType: string;
  readonly stateSchemaVersion: number;

  validateConfig(input: unknown): TConfig;
  createGame(input: CreateGameInput<TConfig>, random: RandomSource): TState;
  parseState(input: unknown): TState;
  applyCommand(input: ApplyCommandInput<TState, TCommand>): ApplyCommandResult<TState>;
  toPlayerView(state: TState, viewerUserId: string): TView;
  getDashboardSummary(state: TState, viewerUserId: string): GameSummary;
}
```

Requirements:

- Persist `game_type` and `state_schema_version` with every game.
- Register only the Sequence-style module in the MVP.
- The dashboard and generic game metadata must not assume Sequence-specific fields.
- Sequence routes and UI may still be explicitly implemented; runtime-loaded plugins are not needed.

---

## 7. Authentication and User Model

### 7.1 Cloudflare Access

Protect the entire production hostname with Cloudflare Access.

- Use one-time PIN login.
- Restrict the policy to explicit approved family email addresses or a tightly controlled email list.
- Never configure unrestricted OTP access.
- Configure Access before inviting real users.
- Provide a logout link targeting the Access logout path for the application hostname.

### 7.2 Worker authentication middleware

For every `/api/*` request:

1. Read `Cf-Access-Jwt-Assertion`.
2. Verify signature against the account's Access JWKS.
3. Verify issuer, audience, expiration, and not-before claims.
4. Extract and normalize the email address using lowercase and trimmed whitespace.
5. Reject absent or invalid tokens with `401`.
6. Auto-provision a `users` row on the first valid request.
7. Never trust a browser-supplied email header or request-body user ID.

### 7.3 Local development

Support a clearly isolated development identity mechanism, for example `DEV_AUTH_EMAIL`, only when `ENVIRONMENT=development`.

Production requirements:

- production startup must fail if development auth bypass is enabled;
- do not honor `X-User-Email` or similar headers in production;
- `.dev.vars` is gitignored;
- `.dev.vars.example` contains placeholders only.

### 7.4 User profile

Persist:

- immutable internal user ID;
- normalized email;
- display name;
- role: `admin` or `member`;
- created, updated, and last-seen timestamps.

On first login, derive a safe default display name from the email prefix and prompt the user to confirm or change it. Email addresses should not be displayed broadly when a display name is sufficient.

The first configured `ADMIN_EMAIL` may be auto-promoted to admin.

---

## 8. Database Schema

Use SQL migrations and foreign keys. Store UTC timestamps as ISO-8601 text.

### 8.1 `users`

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT
);
```

### 8.2 `games`

```sql
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL,
  state_schema_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('lobby', 'active', 'finished', 'cancelled')
  ),
  host_user_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  turn_number INTEGER NOT NULL DEFAULT 0,
  current_player_id TEXT,
  winner_team_index INTEGER,
  state_json TEXT NOT NULL,
  last_command_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY (host_user_id) REFERENCES users(id),
  FOREIGN KEY (current_player_id) REFERENCES users(id)
);
```

`state_json` is server-only internal state. Never return it directly.

### 8.3 `game_members`

```sql
CREATE TABLE game_members (
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seat_index INTEGER,
  team_index INTEGER,
  membership_status TEXT NOT NULL CHECK (
    membership_status IN ('invited', 'accepted', 'declined', 'left')
  ),
  joined_at TEXT,
  PRIMARY KEY (game_id, user_id),
  UNIQUE (game_id, seat_index),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 8.4 `game_invites`

Support invitations to an approved email before that person has registered.

```sql
CREATE TABLE game_invites (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  invited_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'accepted', 'declined', 'cancelled')
  ),
  created_at TEXT NOT NULL,
  responded_at TEXT,
  UNIQUE (game_id, email),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id)
);
```

Because Access is the identity gate, no bearer invite token is required. A signed-in user's verified email determines whether an invitation belongs to them.

### 8.5 `game_events`

Store one public history record per accepted command.

```sql
CREATE TABLE game_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  turn_number INTEGER NOT NULL,
  actor_user_id TEXT,
  command_id TEXT NOT NULL,
  command_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  public_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (game_id, command_id),
  UNIQUE (game_id, version),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);
```

The public payload may reveal played/discarded cards and board effects, because those are public in physical play. It must never reveal a drawn card, another hand, or deck order.

### 8.6 Required indexes

```sql
CREATE INDEX idx_game_members_user
  ON game_members(user_id, game_id);

CREATE INDEX idx_games_status_updated
  ON games(status, updated_at DESC);

CREATE INDEX idx_games_current_player
  ON games(current_player_id, status, updated_at DESC);

CREATE INDEX idx_game_invites_email_status
  ON game_invites(email, status, created_at DESC);

CREATE INDEX idx_game_events_game_version
  ON game_events(game_id, version);
```

Verify query plans for dashboard queries. Do not use unbounded `SELECT *` scans.

---

## 9. Lobby and Game Lifecycle

### 9.1 Status state machine

```text
lobby ──start──> active ──win──> finished
  │                  │
  └────cancel────────┴────cancel/admin archive──> cancelled
```

Finished and cancelled games are read-only.

### 9.2 Lobby behavior

- The creator is the host and an accepted participant by default.
- The host may invite registered users or enter an approved family email.
- Invitees may accept or decline.
- Accepted players may leave before the game starts.
- The host chooses two or three teams and assigns accepted players.
- Teams must be equal in size.
- The app automatically computes alternating seat order by interleaving team rosters.
- Show a seat-order preview before start.
- Once started, players, teams, and seats are immutable.
- No one may join an active game.

### 9.3 Valid player/team combinations

Supported total player counts are:

```text
2, 3, 4, 6, 8, 9, 10, 12
```

Rules:

- Two players: two teams of one.
- Three players: three teams of one.
- More than three players must use teams.
- Two-team games require an even number of players.
- Three-team games require a number divisible by three.
- No more than three teams.

Examples:

- 4 players: two teams of 2.
- 6 players: either two teams of 3 or three teams of 2.
- 9 players: three teams of 3.
- 10 players: two teams of 5.
- 12 players: either two teams of 6 or three teams of 4.

### 9.4 Seat order

If team rosters are:

```text
Blue:  B1, B2, B3
Green: G1, G2, G3
```

seat order is:

```text
B1, G1, B2, G2, B3, G3
```

For three teams, interleave Blue, Green, Red in the same fashion.

### 9.5 Dealer and first turn

The physical card-cut procedure is replaced digitally:

- choose a dealer seat using a cryptographically secure random source;
- deal in seat order;
- the next seat after the dealer takes the first turn;
- record the dealer and first player in the `GAME_STARTED` public event.

---

## 10. Card and Board Model

### 10.1 Card deck

Use two complete standard 52-card decks with no jokers, for 104 physical card instances.

```ts
type Suit = 'S' | 'H' | 'D' | 'C';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
type CardCode = `${Rank}${Suit}`;

interface CardInstance {
  id: string;       // Distinguishes the two copies, e.g. "0-7D" and "1-7D"
  code: CardCode;
  rank: Rank;
  suit: Suit;
}
```

Every card instance ID must remain unique across deck, hands, and discard pile for the life of the game.

### 10.2 Hand sizes

Use the printed hand-size table exactly:

| Players | Cards per player |
|---:|---:|
| 2 | 7 |
| 3 | 6 |
| 4 | 6 |
| 6 | 5 |
| 8 | 4 |
| 9 | 4 |
| 10 | 3 |
| 12 | 3 |

### 10.3 Board coordinates

- Board size: 10 rows by 10 columns.
- Internal coordinates are zero-based: `row 0..9`, `col 0..9`.
- UI and history may display one-based human-readable coordinates.
- Internal flat index: `row * 10 + col`.

### 10.4 Canonical board map

Use this exact map. `FREE` marks the four corner spaces. Jacks do not appear on the board.

```ts
export const BOARD_LAYOUT = [
  ['FREE', '2S',  '3S',  '4S',  '5S',  '6S',  '7S',  '8S',  '9S',  'FREE'],
  ['6C',   '5C',  '4C',  '3C',  '2C',  'AH',  'KH',  'QH',  '10H', '10S'],
  ['7C',   'AS',  '2D',  '3D',  '4D',  '5D',  '6D',  '7D',  '9H',  'QS'],
  ['8C',   'KS',  '6C',  '5C',  '4C',  '3C',  '2C',  '8D',  '8H',  'KS'],
  ['9C',   'QS',  '7C',  '6H',  '5H',  '4H',  'AH',  '9D',  '7H',  'AS'],
  ['10C',  '10S', '8C',  '7H',  '2H',  '3H',  'KH',  '10D', '6H',  '2D'],
  ['QC',   '9S',  '9C',  '8H',  '9H',  '10H', 'QH',  'QD',  '5H',  '3D'],
  ['KC',   '8S',  '10C', 'QC',  'KC',  'AC',  'AD',  'KD',  '4H',  '4D'],
  ['AC',   '7S',  '6S',  '5S',  '4S',  '3S',  '2S',  '2H',  '3H',  '5D'],
  ['FREE', 'AD',  'KD',  'QD',  '10D', '9D',  '8D',  '7D',  '6D',  'FREE'],
] as const;
```

Required invariant tests:

- exactly 100 spaces;
- exactly four `FREE` spaces, all in corners;
- no Jack on the board;
- every one of the 48 non-Jack card codes appears exactly twice;
- reverse lookup for every non-Jack card returns exactly two distinct cells.

### 10.5 Board occupancy

Corners never hold chips. All other cells hold either no chip or exactly one team index.

```ts
type TeamIndex = 0 | 1 | 2;
type Occupant = TeamIndex | null;
```

Use Blue and Green for two-team games. Use Blue, Green, and Red for three-team games. Color is presentation, not identity; always pair it with a team name, icon, pattern, or abbreviation.

Do not model finite physical chip inventory in the MVP. It is component inventory rather than an intended digital resource, and omitting it avoids a poorly specified chip-exhaustion state.

---

## 11. Internal Sequence Game State

A representative model is below. Codex may refine names, but not semantics.

```ts
interface ClaimedSequence {
  id: string;                // Stable line ID: direction + starting coordinate
  teamIndex: TeamIndex;
  cells: readonly number[];  // Exactly five flat indices, in line order
  createdTurn: number;
}

interface SequencePlayer {
  userId: string;
  seatIndex: number;
  teamIndex: TeamIndex;
  hand: CardInstance[];
}

interface SequenceGameState {
  schemaVersion: number;
  phase: 'lobby' | 'active' | 'finished' | 'cancelled';

  teamCount: 2 | 3;
  targetSequences: 1 | 2;
  players: SequencePlayer[];
  dealerSeatIndex: number | null;
  currentSeatIndex: number | null;

  board: Occupant[];                 // Length 100; corners remain null
  claimedSequences: ClaimedSequence[];
  sequenceCounts: number[];

  deck: CardInstance[];
  discard: CardInstance[];

  turnNumber: number;
  deadCardExchangeUsed: boolean;
  lastChangedCell: number | null;
  winnerTeamIndex: TeamIndex | null;
}
```

Requirements:

- Validate `state_json` against a runtime schema every time it is loaded.
- Never mutate an input state object in place; the engine returns a new state.
- Include a state schema version and a migration hook from the beginning.
- Derive protected chips from `claimedSequences`; do not maintain a second source of truth that can drift.

---

## 12. Rules of Play

### 12.1 Objective

A sequence is five spaces in a straight horizontal, vertical, or diagonal line, where every non-corner space contains a chip belonging to the same team. A corner counts as a valid space for every team.

Winning target:

- two-team game: first team to claim **two** sequences;
- three-team game: first team to claim **one** sequence.

### 12.2 Normal turn

On the current player's turn:

1. Select one card from that player's hand.
2. Play it to one legal board target.
3. Move the card to the discard pile.
4. Resolve and claim any newly completed sequence or sequences.
5. If the move did not end the game, draw one replacement card.
6. Advance to the next seat.
7. Reset `deadCardExchangeUsed` for the next player.

The application draws automatically; the physical “forgot to draw a card” penalty is intentionally omitted.

### 12.3 Normal non-Jack card

A non-Jack card may place one chip on either of the two matching board spaces, provided the selected space:

- matches the card code;
- is not a corner;
- is currently empty.

If one matching space is occupied and the other is empty, only the empty one is legal. If both are occupied, the card is dead.

### 12.4 Two-eyed Jacks

`JC` and `JD` are two-eyed Jacks.

They may place one chip on any empty non-corner space. They may not overwrite a chip or place a chip on a free corner.

### 12.5 One-eyed Jacks

`JS` and `JH` are one-eyed Jacks.

They remove one chip from any opposing team, provided that chip is not part of a claimed sequence.

A one-eyed Jack turn only removes a chip; it does not also place the current team's chip. The removed space becomes empty. The played Jack is discarded, a replacement is drawn, and the turn advances.

Legal-target rules:

- target must contain a chip;
- target must belong to another team;
- target must not be protected by any claimed sequence;
- a corner is never a target;
- in a three-team game, either opposing team's removable chip is legal.

### 12.6 Free corners

The four corners:

- are permanently free;
- count as part of a sequence for every team;
- cannot receive or lose a chip;
- may be used by multiple teams in different sequences;
- mean that a sequence touching a corner requires only four actual team chips.

### 12.7 Dead-card exchange

A non-Jack card is dead when both of its matching board spaces are occupied by any chips.

Before the player completes the normal play for that turn, the player may exchange at most one dead card:

1. reveal and discard the dead card;
2. draw one replacement;
3. remain the current player;
4. set `deadCardExchangeUsed = true`;
5. continue the normal turn.

Jacks are never dead cards.

The exchange is a separate persisted command so a player may refresh or leave after exchanging and still resume the same turn correctly.

### 12.8 No-legal-move safety rule

The printed rules do not fully define the rare case in which a player has no legal play after using the one allowed dead-card exchange. The digital game must not soft-lock.

Allow `PASS_NO_LEGAL_MOVE` only when the server verifies that:

- no card in the current hand has any legal target; and
- either the dead-card exchange has already been used this turn or no exchangeable dead card exists.

Passing draws no card, advances the seat, and creates a public history event. The UI must never show a general-purpose Pass button.

### 12.9 Exhausted draw deck

Whenever a draw is required and the draw deck is empty:

1. cryptographically shuffle the entire discard pile;
2. make it the new draw deck;
3. clear the discard pile;
4. draw the replacement card.

Card instance IDs remain unchanged through reshuffles.

### 12.10 Hidden information and table talk

- A player sees only their own hand.
- Teammates do not see one another's hands.
- Other players see only hand counts.
- The deck order is never exposed.
- The move history may show cards that were played or exchanged.
- Do not add team chat in the MVP. The physical no-table-talk rule is documented but cannot be enforced outside the application.

---

## 13. Sequence Detection and Claiming

This section is critical. Implement it as pure, heavily tested logic.

### 13.1 Candidate lines

After a chip placement, enumerate every length-five line that:

- is horizontal, vertical, diagonal down-right, or diagonal down-left;
- contains the newly placed cell;
- stays within the 10×10 board;
- consists only of the moving team's chips and/or free corners.

A straightforward enumeration is:

```ts
const DIRECTIONS = [
  [0, 1],   // horizontal
  [1, 0],   // vertical
  [1, 1],   // diagonal down-right
  [1, -1],  // diagonal down-left
] as const;

for (const direction of DIRECTIONS) {
  for (let offset = -4; offset <= 0; offset += 1) {
    // Build the five-cell window whose start is offset from the new cell.
    // Keep it only if in bounds, contains the new cell, and all cells match.
  }
}
```

Normalize and deduplicate candidates by a stable line ID containing direction and start coordinate.

### 13.2 Existing sequence overlap rule

A new sequence may share at most one board space with each sequence already claimed by that same team.

- Count coordinate overlap, including a free corner.
- An identical five-cell line cannot be claimed twice.
- A run of nine may count as two sequences using windows `0–4` and `4–8`.
- Two crossing sequences may share the newly placed chip.
- Windows sharing two or more spaces are not simultaneously claimable.

### 13.3 Multiple sequences created by one move

One placement may create more than one legal sequence. Claim the maximum number of mutually compatible new sequences, capped by the number still needed to win.

Because a team can need at most two total sequences in this ruleset, do not use an expensive general subset search:

1. filter candidates against existing claims;
2. if only one further sequence is needed, each candidate is a possible choice;
3. if two are needed, evaluate all candidate pairs and retain pairs whose intersection contains at most one cell;
4. prefer a two-sequence set over any one-sequence set;
5. if no compatible pair exists, use the legal single candidates.

### 13.4 Ambiguous claim selection

If more than one equally maximal claim set is possible, preserve player choice.

Protocol:

1. The client submits `PLAY_CARD` without a sequence selection.
2. The server simulates but does not mutate state.
3. The server returns `422` with code `SEQUENCE_SELECTION_REQUIRED` and the legal maximal alternatives.
4. The UI overlays each alternative on the board and asks the player to choose.
5. The client resubmits the same proposed play with the selected line IDs and the same expected game version.
6. The server recomputes the alternatives and accepts only an exact allowed set.

If there is zero or one maximal claim set, the server resolves it automatically.

### 13.5 Protected chips

Every non-corner chip contained in a claimed sequence is protected from a one-eyed Jack. Protection lasts for the rest of the game, even if the chip participates in two sequences.

Compute a protected-cell set from all claimed sequences whenever validating a removal. Corners need no protection because they cannot be targeted.

### 13.6 Win timing

Immediately after claims are added:

- update the team's sequence count;
- if the target is met, mark the game finished and set the winner;
- do not advance to another player;
- drawing a replacement card after the winning move is unnecessary;
- persist the winning move and `GAME_WON` information in the same atomic command event.

---

## 14. Randomness

Define an injectable interface:

```ts
interface RandomSource {
  randomInt(maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}
```

Production:

- use `crypto.getRandomValues` or another Worker-native cryptographically secure source;
- shuffle once at game start and again only when recycling the discard pile;
- persist the resulting deck order as hidden server state.

Tests:

- use a deterministic seeded implementation;
- never expose the production deck order or any test seed in a player view.

Do not use `Math.random()` or `array.sort(() => Math.random() - 0.5)`.

---

## 15. Public Player View

Construct a dedicated redacted DTO. Never create it by spreading internal state and deleting fields afterward.

Representative response:

```ts
interface SequenceGameView {
  id: string;
  title: string;
  status: 'lobby' | 'active' | 'finished' | 'cancelled';
  version: number;
  turnNumber: number;

  teams: Array<{
    teamIndex: number;
    name: string;
    chipStyle: string;
    sequenceCount: number;
    players: Array<{
      userId: string;
      displayName: string;
      seatIndex: number;
      handCount: number;
      isCurrentPlayer: boolean;
    }>;
  }>;

  currentPlayerId: string | null;
  myUserId: string;
  myHand: Array<{
    id: string;
    code: CardCode;
    rank: Rank;
    suit: Suit;
    kind: 'normal' | 'two-eyed-jack' | 'one-eyed-jack';
    legalTargetCells: number[];
    isDead: boolean;
  }>;

  board: {
    layout: readonly BoardCode[][];
    occupants: Occupant[];
    lastChangedCell: number | null;
  };

  claimedSequences: ClaimedSequenceView[];
  deckCount: number;
  discardCount: number;
  deadCardExchangeUsed: boolean;
  canPassNoLegalMove: boolean;
  winnerTeamIndex: number | null;
  recentEvents: PublicGameEvent[];
}
```

Must not appear anywhere in the JSON response:

- `state_json`;
- `deck` card objects or order;
- another player's card codes or IDs;
- shuffle state or seed;
- Access JWT;
- internal database metadata not needed by the UI.

Add automated response-shape tests that recursively search for forbidden keys and known opponent-card test values.

---

## 16. API Contract

Prefix all routes with `/api/v1`.

### 16.1 User routes

```text
GET    /api/v1/me
PATCH  /api/v1/me
GET    /api/v1/users
```

`GET /users` returns a small family directory for invitations: user ID and display name, with email exposed only when required for invitation administration.

### 16.2 Dashboard and invitation routes

```text
GET    /api/v1/games?bucket=active|waiting|finished
GET    /api/v1/invitations
POST   /api/v1/invitations/:inviteId/accept
POST   /api/v1/invitations/:inviteId/decline
```

The dashboard query should return compact summaries, not full game state.

### 16.3 Game/lobby routes

```text
POST   /api/v1/games
GET    /api/v1/games/:gameId
PATCH  /api/v1/games/:gameId/lobby
POST   /api/v1/games/:gameId/invitations
DELETE /api/v1/games/:gameId/invitations/:inviteId
POST   /api/v1/games/:gameId/start
POST   /api/v1/games/:gameId/cancel
```

Host-only operations must be enforced by the Worker.

### 16.4 Command route

```text
POST /api/v1/games/:gameId/commands
```

Use a discriminated union:

```ts
type SequenceCommand =
  | {
      type: 'PLAY_CARD';
      commandId: string;
      expectedVersion: number;
      cardId: string;
      targetCell: number;
      sequenceSelection?: string[];
    }
  | {
      type: 'EXCHANGE_DEAD_CARD';
      commandId: string;
      expectedVersion: number;
      cardId: string;
    }
  | {
      type: 'PASS_NO_LEGAL_MOVE';
      commandId: string;
      expectedVersion: number;
    };
```

A `PLAY_CARD` command covers all three card behaviors. The engine determines whether the target means normal placement, wild placement, or opponent-chip removal.

### 16.5 Event route

```text
GET /api/v1/games/:gameId/events?afterVersion=<n>&limit=<n>
```

Cap the limit. Return only public event payloads.

### 16.6 Response and error conventions

Successful state-changing responses contain the latest redacted game view.

Use structured errors:

```json
{
  "error": {
    "code": "STALE_GAME_VERSION",
    "message": "The game changed in another tab or device.",
    "details": {}
  }
}
```

Suggested statuses:

- `400` malformed request;
- `401` unauthenticated or invalid Access token;
- `403` authenticated but not permitted;
- `404` game not found **or not visible to this user**;
- `409` stale version, duplicate conflicting command, or wrong turn;
- `422` well-formed but illegal game action, including sequence-choice-required;
- `500` unexpected server error with a non-sensitive request ID.

On stale version, include the latest redacted view when safe so the client can recover immediately.

---

## 17. Atomicity, Idempotency, and Concurrency

Asynchronous games will be opened in multiple tabs and devices. Correct concurrency is mandatory.

### 17.1 Optimistic concurrency

Every state-changing command includes `expectedVersion`.

Use a conditional update equivalent to:

```sql
UPDATE games
SET
  state_json = ?,
  version = version + 1,
  turn_number = ?,
  current_player_id = ?,
  status = ?,
  winner_team_index = ?,
  last_command_id = ?,
  updated_at = ?,
  finished_at = ?
WHERE id = ? AND version = ?;
```

If zero rows change and the command was not already accepted, return `409 STALE_GAME_VERSION`.

### 17.2 Idempotent commands

- The client creates a UUID `commandId` before submission.
- Canonicalize the command payload and store a SHA-256 `command_hash` with the event.
- Before applying a command, look up `(game_id, command_id)`. An identical hash is an idempotent retry; a different hash is a conflict.
- Retrying the exact command after a timeout must not apply it twice.
- Enforce `UNIQUE(game_id, command_id)` in `game_events`.
- Store `last_command_id` on the game snapshot.
- A retry of an already accepted command returns the current game view rather than another mutation.
- Reusing a command ID with different content is a conflict and must be rejected.

### 17.3 Atomic snapshot and event write

Use a D1 batch transaction so the conditional game update and its public event either both commit or both roll back.

A robust pattern is:

1. pre-check `(game_id, command_id)` for exact retry or conflicting reuse;
2. conditional `UPDATE games ... WHERE version = expectedVersion AND NOT EXISTS (...)`, setting `last_command_id`;
3. conditional `INSERT INTO game_events ... SELECT ... FROM games WHERE id = ? AND last_command_id = ?`;
4. `ON CONFLICT(game_id, command_id) DO NOTHING` as a final race-safe guard;
5. inspect affected-row metadata;
6. if the update changed zero rows, check whether the command event already exists and compare `command_hash`; otherwise return a stale-version conflict.

Do not perform an unconditional event insert after a failed conditional update.

### 17.4 No optimistic browser mutation

The UI may preview a selected card and target, but it should not permanently alter the visible board until the server confirms the command.

---

## 18. Public Event History

At minimum, support public descriptions for:

- `GAME_CREATED`;
- `INVITATION_ACCEPTED`;
- `LOBBY_UPDATED`;
- `GAME_STARTED`;
- `DEAD_CARD_EXCHANGED`;
- `CARD_PLAYED`;
- `CHIP_PLACED`;
- `CHIP_REMOVED`;
- `SEQUENCE_CLAIMED`;
- `TURN_PASSED_NO_LEGAL_MOVE`;
- `GAME_WON`;
- `GAME_CANCELLED`.

One database row may contain a compound public event for a command, for example a card play, chip placement, two sequence claims, and game win.

History should be written in neutral language and include display name, public card code, target coordinate, sequence line(s), and timestamp. Never include the replacement card drawn.

---

## 19. Frontend Screens

### 19.1 Access login

Cloudflare provides the actual login screen. The app needs:

- an authenticated loading state;
- a first-login display-name prompt;
- a clear logout action;
- a useful error when the API rejects an expired or invalid Access session.

### 19.2 Dashboard

Group compact game cards into:

1. **Your Turn**
2. **Invitations**
3. **Waiting on Others**
4. **Finished Games** (collapsed or paginated)

Each active card shows:

- game title and game type;
- team/chip identity;
- current player;
- sequence score;
- last action time;
- a prominent “Take Turn” or “View Game” action.

Include a **Create Game** button. The game picker may contain one enabled Card Lines tile and disabled “More games later” placeholders.

### 19.3 Create-game and lobby flow

Steps:

1. Choose Card Lines.
2. Enter title.
3. Choose two or three teams.
4. Invite existing family users or enter approved emails.
5. Wait for acceptance.
6. Assign equal teams.
7. Preview automatic alternating seat order.
8. Start when all validation passes.

The UI must explain why invalid team arrangements cannot start.

### 19.4 Game screen

Desktop layout:

- top bar: game title, current turn, team sequence scores, game status;
- main area: board;
- bottom or left area: current viewer's hand;
- side panel: player/seat order, recent move history, rules/help;
- clear last-move indicator;
- clear completed-sequence overlays;
- deck/discard counts.

Mobile layout:

- sticky status header;
- horizontally scrollable board with cells at least 44 CSS pixels;
- sticky hand tray below the board;
- collapsible players/history/rules panels;
- do not shrink the 10×10 board into untappable cells merely to avoid scrolling.

### 19.5 Turn interaction

1. Player selects a card in hand.
2. Legal targets receive a high-contrast outline and an icon/shape, not color alone.
3. Player selects a target.
4. UI shows a move preview and explicit Confirm/Cancel controls.
5. If the server requires a sequence choice, overlay each legal alternative and let the player choose.
6. On success, replace cached state with the authoritative response and announce the result.
7. On `409`, show “The game changed; refreshed to the latest turn” and load the latest state.

Special states:

- Dead cards show an **Exchange** action only when eligible.
- A one-eyed Jack labels valid targets as removals.
- A two-eyed Jack labels valid targets as wild placements.
- Pass appears only when `canPassNoLegalMove` is true.
- Non-current players see a read-only board and “Waiting on [name].”

### 19.6 Card rendering

Render cards with:

- rank;
- Unicode or original SVG suit symbol;
- suit name in the accessible label;
- red/black conventional coloring as enhancement only;
- textual Jack behavior badge where helpful.

Do not use raster scans or copyrighted court-card artwork.

### 19.7 Sequence rendering

- Mark each claimed sequence with a line or outlined set of five cells.
- Distinguish multiple sequences without relying solely on hue.
- Protected chips should have a lock/ring treatment.
- Shared overlap cells must remain visually understandable.

---

## 20. Accessibility Requirements

Treat these as acceptance requirements, not polish:

- full keyboard operation;
- visible focus indicators;
- `role="grid"` or equivalent semantics for the board;
- arrow-key navigation between board cells;
- descriptive labels such as “Row 4 column 7, Queen of hearts, occupied by Green team”;
- screen-reader announcement when the turn changes or a move is accepted;
- no information conveyed only by color;
- sufficient contrast;
- touch targets at least 44×44 CSS pixels where practical;
- dialogs trap focus and restore it on close;
- respect `prefers-reduced-motion`;
- no autoplaying sound;
- rules and status available as text outside the graphical board.

Add automated accessibility checks to component or end-to-end tests, supplemented by a manual checklist.

---

## 21. Refresh and Asynchronous Behavior

Real-time transport is unnecessary.

Use TanStack Query with:

- immediate refresh on page load;
- refresh on browser focus and network reconnect;
- active game polling approximately every 30 seconds only while the document is visible;
- dashboard polling approximately every 60 seconds only while visible;
- no polling for finished/cancelled game detail;
- manual Refresh action;
- paused polling when offline or hidden.

Use game `version` as the cache freshness key. Optionally support an ETag based on game ID and version. API responses containing game state must use `Cache-Control: no-store`.

Do not implement WebSockets or Server-Sent Events in this milestone.

---

## 22. Security and Privacy Requirements

### 22.1 Authorization

For every game request:

- verify Access identity;
- verify the requester is a game member or authorized admin;
- verify host-only actions;
- verify current-turn ownership;
- return `404` rather than revealing a private game's existence to a nonmember.

### 22.2 Request security

- require `Content-Type: application/json` for mutations;
- verify the `Origin` header matches the configured app origin for browser mutations;
- use only same-origin API calls in production;
- parameterize all SQL;
- validate IDs, bounds, enums, and payload sizes;
- cap pagination limits;
- reject unknown command fields where practical.

### 22.3 Response security

- never serialize internal state directly;
- never include hidden hands or deck order;
- never log Access tokens, cookies, full state snapshots, or private hands;
- use generic unexpected-error responses with request IDs;
- set `Cache-Control: no-store` on authenticated API data;
- use a restrictive content-security policy compatible with the chosen deployment;
- do not load third-party scripts.

### 22.4 Minimal personal data

Store only what the app needs: email, display name, role, memberships, and game activity. No date of birth, address, contacts upload, or behavioral analytics.

### 22.5 Auditability

Accepted commands create immutable public events. Administrative cancellation should also record actor and timestamp.

---

## 23. Testing Plan

### 23.1 Board and deck invariant tests

- board is 10×10;
- corners are the only free cells;
- every non-Jack card appears exactly twice;
- no Jack appears on the board;
- deck contains exactly 104 unique card instance IDs;
- each card code appears exactly twice;
- shuffle does not lose or duplicate cards;
- hand sizes match every valid player count.

### 23.2 Team and lobby tests

- accept each valid player/team combination;
- reject 5, 7, or 11 players;
- reject unequal teams;
- reject more than three teams;
- alternate seats correctly for two and three teams;
- prevent start with pending invitees or invalid assignments;
- lock teams and seats after start.

### 23.3 Normal-play tests

- normal card can use either matching empty space;
- occupied target is rejected;
- nonmatching target is rejected;
- card not in hand is rejected;
- wrong player is rejected;
- card moves from hand to discard;
- exactly one replacement is drawn;
- turn advances correctly;
- input state remains unchanged.

### 23.4 Jack tests

- `JC` and `JD` place on any empty non-corner;
- two-eyed Jack cannot overwrite a chip or use a corner;
- `JS` and `JH` remove an opposing unprotected chip;
- one-eyed Jack cannot remove own chip;
- one-eyed Jack can target either opponent in a three-team game;
- one-eyed Jack cannot remove a protected chip;
- removal does not place a replacement chip;
- Jack is discarded and turn advances.

### 23.5 Dead-card tests

- card is dead only when both matching spaces are occupied;
- either team's chips can make it dead;
- Jack is never dead;
- exchange is allowed once per turn;
- exchange does not advance turn;
- exchange survives save/reload;
- second exchange in same turn is rejected;
- replacement draw reshuffles discard when required;
- Pass is rejected whenever any legal move exists;
- Pass is allowed only in the specified no-legal-move state.

### 23.6 Sequence tests

Cover all four orientations and boundaries:

- horizontal, vertical, both diagonals;
- corner-assisted sequence;
- corner cannot be occupied;
- four in a row is not a sequence;
- candidate must include newly placed chip;
- identical line cannot be claimed twice;
- claimed chips become protected;
- nine in a row can produce two sequences sharing one cell;
- crossing lines can produce two sequences sharing one cell;
- two lines sharing two or more cells cannot both be claimed;
- second sequence may overlap first in exactly one cell;
- ambiguous maximal claim sets return `SEQUENCE_SELECTION_REQUIRED`;
- invalid client sequence selection is rejected;
- two-team game wins at two sequences;
- three-team game wins at one;
- winning command does not advance turn.

### 23.7 Card conservation property

After every accepted command, the multiset of card instance IDs across all hands, draw deck, and discard pile must contain exactly the original 104 unique IDs.

### 23.8 API tests

- invalid or missing Access JWT rejected;
- authenticated user auto-provisioned;
- nonmember cannot read game;
- player cannot read another hand;
- opponent test-card values never appear in serialized response;
- stale expected version returns 409;
- exact command retry is idempotent;
- command-ID reuse with different body is rejected;
- concurrent submissions cannot both mutate the same version;
- snapshot and event remain atomic when a statement fails;
- host/admin permissions enforced;
- game list queries are scoped to requester;
- every lobby, invitation, start, cancel, and move mutation increments the game version and creates one version-matched public event.

### 23.9 End-to-end tests

At minimum:

1. two users create, accept, team, start, take alternating turns, refresh, and resume;
2. scripted deterministic game reaches two sequences and shows the winner;
3. one-eyed Jack removes a legal chip but cannot remove a protected one;
4. dead-card exchange preserves the same player's turn;
5. stale second tab recovers gracefully;
6. mobile viewport can select a hand card and board target;
7. network responses contain no opponent hand or deck order.

Use a test-only deterministic random source. It must be impossible to enable in production accidentally.

---

## 24. CI and Deployment

### 24.1 Continuous integration

For every pull request and main-branch push, run:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Run Playwright in CI once the first end-to-end slice exists.

### 24.2 GitHub Pages deployment

- Build `apps/web` with Vite.
- Use a GitHub Actions Pages deployment workflow.
- Configure the production custom domain.
- Use Vite base `/` for the custom-domain deployment.
- Use hash routes such as `/#/games/<id>`.
- Deploy only after CI passes.
- Include a simple `404.html` redirect/fallback only if still useful with hash routing.

### 24.3 Worker deployment

- Deploy from a separate GitHub Actions workflow after tests pass.
- Bind D1 through `wrangler.toml`.
- Route only `/api/*` on the production hostname.
- Store Cloudflare account ID and scoped API token as GitHub Actions secrets.
- Store Access team domain, application audience, app origin, and admin email as Worker configuration/secrets as appropriate.
- Run production migrations deliberately before deploying code that requires them.

### 24.4 Manual infrastructure checklist

Document exact steps in `docs/CLOUDFLARE_SETUP.md` and `docs/GITHUB_PAGES_SETUP.md`:

1. Create or select the domain in Cloudflare.
2. Create GitHub Pages site and configure custom hostname.
3. Allow GitHub Pages HTTPS/certificate setup to complete.
4. Proxy the hostname through Cloudflare.
5. Create D1 database and apply migrations.
6. Create Worker and D1 binding.
7. Add Worker route for `/api/*`.
8. Create Cloudflare Access self-hosted application for the hostname.
9. Configure email OTP and an explicit family allowlist.
10. Record Access audience and team domain in Worker configuration.
11. Add narrowly scoped GitHub Actions secrets.
12. Deploy Worker and frontend.
13. Test unauthenticated redirect, approved login, rejected email, API identity, and a two-user game.

### 24.5 Operations documentation

`docs/OPERATIONS.md` must explain:

- local startup;
- local D1 migrations and reset;
- production migrations;
- adding a family email to Access;
- making an app user an admin;
- cancelling a corrupted game without exposing hidden cards;
- exporting/restoring D1 data;
- viewing safe logs;
- rotating Cloudflare/GitHub secrets;
- checking current free-tier usage.

---

## 25. Implementation Milestones

### Milestone 0 — Scaffold and deployment skeleton

Deliver:

- workspace and directory structure;
- TypeScript, lint, format, test, and build commands;
- minimal React shell;
- minimal Worker health route;
- local web-to-Worker proxy;
- initial D1 migration;
- CI workflow;
- placeholder Pages and Worker deployment workflows;
- setup documentation skeleton.

Acceptance:

- clean install works;
- lint, typecheck, test, and build pass;
- local web can call local `/api/v1/health`;
- no secrets committed.

### Milestone 1 — Pure Sequence engine

Deliver:

- card/deck model;
- fixed board map and invariants;
- player/team/seat validation;
- hand dealing;
- legal target generation;
- normal card, Jack, dead-card, reshuffle, pass, and turn logic;
- sequence enumeration, overlap, ambiguity, protection, and win logic;
- deterministic test random source;
- comprehensive unit/property tests.

Acceptance:

- all engine tests in Section 23 pass;
- engine has no Cloudflare, React, or database dependency;
- no rule placeholders remain.

### Milestone 2 — Authentication, persistence, and command API

Deliver:

- Access JWT validation middleware;
- development auth isolation;
- users, games, members, invites, events migrations;
- auto-provisioning;
- game creation/lobby/start API;
- redacted player view;
- command endpoint;
- versioned conditional writes;
- idempotency and atomic event writes;
- API integration tests.

Acceptance:

- two test users can create and play through API calls;
- stale and duplicate commands behave correctly;
- hidden-state leakage tests pass;
- all writes are parameterized and authorized.

### Milestone 3 — Dashboard and lobby UI

Deliver:

- first-login profile flow;
- dashboard buckets;
- invitations;
- create-game wizard;
- equal-team assignment;
- alternating seat preview;
- start/cancel actions;
- loading, empty, error, and stale-session states.

Acceptance:

- a user can create a valid game without direct API use;
- invalid configurations explain themselves;
- dashboard distinguishes “your turn” and “waiting.”

### Milestone 4 — Full game UI

Deliver:

- responsive board;
- card hand;
- legal-target highlighting;
- confirm/cancel preview;
- Jack interactions;
- dead-card exchange;
- sequence-choice dialog;
- protected-sequence and last-move visuals;
- move history and rules panel;
- visible/hidden polling behavior;
- keyboard and screen-reader support.

Acceptance:

- complete two-team and three-team games are playable through the browser;
- mobile and desktop E2E flows pass;
- no private state appears in browser responses.

### Milestone 5 — Hardening and production launch

Deliver:

- full Playwright suite;
- accessibility audit fixes;
- secure headers/CSP appropriate to deployment;
- structured safe logging;
- migration/deployment runbooks;
- production environment validation;
- actual GitHub Pages and Worker deployment;
- smoke test with at least two real approved accounts.

Acceptance:

- all CI checks pass on main;
- unapproved email cannot access the site;
- approved accounts can finish a persisted game;
- refresh, stale tab, and device handoff work;
- current free-tier usage is documented and monitored.

---

## 26. Final MVP Acceptance Checklist

The release is not complete until every item is true:

- [ ] Site requires Cloudflare Access login.
- [ ] OTP policy is restricted to approved family emails.
- [ ] User can set a display name and log out.
- [ ] Dashboard supports multiple simultaneous games.
- [ ] Dashboard shows invitations, your-turn games, waiting games, and finished games.
- [ ] Host can create a two-team or three-team lobby.
- [ ] All printed valid player counts and hand sizes are implemented.
- [ ] Teams are equal and seats alternate by team.
- [ ] Deck has two standard decks and no jokers.
- [ ] Board uses the exact 10×10 map in this specification.
- [ ] Normal cards can use either matching empty space.
- [ ] Two-eyed Jacks place wild chips.
- [ ] One-eyed Jacks remove only legal opposing chips.
- [ ] Claimed sequence chips cannot be removed.
- [ ] Free corners behave correctly.
- [ ] Dead-card exchange works once per turn without ending the turn.
- [ ] Exhausted draw deck reshuffles the discard pile.
- [ ] Sequence overlap and simultaneous-sequence rules are correct.
- [ ] Ambiguous sequence choice preserves player agency.
- [ ] Two-team and three-team win thresholds are correct.
- [ ] Other players' hands and deck order never reach the client.
- [ ] Every move is authorized and server-validated.
- [ ] Every mutation uses expected version and command ID.
- [ ] Double submission cannot create two moves.
- [ ] State survives refresh and long gaps.
- [ ] UI is usable on phone and desktop.
- [ ] UI is keyboard accessible and does not rely only on color.
- [ ] GitHub Pages and Worker deployments are reproducible from documented workflows.
- [ ] No commercial logo, scans, or copied art are shipped.
- [ ] No secrets are present in the repository or frontend bundle.

---

## 27. Required Handoff Report From Codex

At the end of each work session, Codex should report:

1. milestone and tasks completed;
2. files created or changed;
3. database migrations added;
4. tests added and exact commands run;
5. test/build results;
6. manual setup still required;
7. known risks or unresolved decisions;
8. the single next logical task.

Do not describe a milestone as complete when its acceptance checks do not pass.

---

## 28. Copy-Paste Kickoff Prompt for Codex

```text
Build the Family Game Night project according to the attached
`family-game-night-sequence-codex-spec.md`.

Start by reading the entire specification and creating
`docs/IMPLEMENTATION_PLAN.md`. Then implement Milestone 0 and Milestone 1.
Do not begin the UI game screen before the pure Sequence engine and its rule
suite pass. Preserve the exact board map and all rules in the spec. Keep the
server authoritative, keep hidden state out of public DTOs, and do not commit
secrets.

Work until Milestones 0 and 1 meet their acceptance criteria, running the full
lint, typecheck, test, and build commands. When done, give me the required
handoff report from Section 27 and stop before Milestone 2 so I can review the
engine and architecture.
```

---

## 29. Product Decisions Intentionally Deferred

The following should become explicit later issues rather than being invented during the MVP:

- final public name for the Sequence-style game;
- repository license;
- turn-reminder email or Web Push notifications;
- rematches and game templates;
- resign/forfeit rules for active games;
- archival retention period;
- optional turn deadlines;
- sounds and animation preferences;
- additional games and their game-module interfaces;
- statistics and history beyond the per-game event log;
- automated Access allowlist onboarding;
- spectator/replay mode;
- PWA installation and offline shell caching.

