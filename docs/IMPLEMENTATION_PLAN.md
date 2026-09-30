# Family Game Night implementation plan

This plan translates the authoritative Sequence-style MVP specification into reviewable milestones. The `Sequence` directory is the repository root for this greenfield implementation. The public working title remains **Card Lines**; the internal game identifier is `sequence`.

## Milestone 0 — Scaffold and deployment skeleton

- [x] Create a pnpm workspace with strict TypeScript project references.
- [x] Pin Node and pnpm versions and commit an exact lockfile.
- [x] Configure ESLint, Prettier, Vitest, and root `lint`, `format:check`, `typecheck`, `test`, and `build` commands.
- [x] Create the `apps/web`, `apps/worker`, `packages/shared`, and `packages/sequence-engine` packages.
- [x] Build a minimal React/Vite shell using hash routing and TanStack Query.
- [x] Add a same-origin `/api/v1/health` request from the web shell and a local Vite proxy to the Worker.
- [x] Build a minimal Hono Cloudflare Worker with `GET /api/v1/health`.
- [x] Add the initial D1 schema migration with users, games, memberships, invitations, events, constraints, and required indexes.
- [x] Add `.dev.vars.example`, secret-safe ignore rules, and documented environment variables.
- [x] Add CI plus gated GitHub Pages and Worker deployment workflows.
- [x] Add architecture, Cloudflare setup, GitHub Pages setup, rules, and operations documentation skeletons.
- [x] Verify a clean install and run `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [x] Verify the local web/Worker health path and scan tracked source for obvious secrets.

## Milestone 1 — Pure Sequence engine

- [x] Define strict internal card, board, player, team, command, state, event, and result types.
- [x] Implement the fixed 10×10 canonical board map and reverse card lookup without generation or randomization.
- [x] Implement the two-deck, 104-instance card model with stable unique instance IDs.
- [x] Implement cryptographic production randomness and a deterministic seeded test source without `Math.random()`.
- [x] Validate all supported player/team combinations and equal team sizes.
- [x] Interleave team rosters into alternating seat order for two- and three-team games.
- [x] Choose the dealer, deal the exact hand sizes in seat order, and select the next seat as first player.
- [x] Implement runtime state parsing, schema versioning, and an explicit state-migration hook.
- [x] Implement legal targets for normal cards, two-eyed Jacks, and one-eyed Jacks.
- [x] Implement immutable normal play, discard/draw, reshuffle, turn advance, and card conservation.
- [x] Implement once-per-turn persisted dead-card exchange.
- [x] Implement the server-verified no-legal-move pass safety rule.
- [x] Enumerate all five-cell sequence candidates through the placed chip in four orientations.
- [x] Enforce existing-claim overlap, simultaneous-claim compatibility, stable line IDs, and permanent chip protection.
- [x] Compute maximal claim alternatives, require explicit selection when ambiguous, and validate exact client selections.
- [x] Implement two-team/two-sequence and three-team/one-sequence win timing without post-win draw or turn advance.
- [x] Construct redacted player views directly, exposing only the viewer's hand and public counts/state.
- [x] Add board/deck, lobby, play, Jack, dead-card, pass, reshuffle, sequence, ambiguity, win, immutability, and conservation tests from specification Section 23.
- [x] Verify the engine has no React, Cloudflare, Worker, or database dependency and contains no game-rule placeholders.
- [x] Run the complete Milestone 0 quality gate with the engine suite included.

## Milestone 2 — Authentication, persistence, and command API

- [x] Add strict environment parsing and fail closed when development auth settings appear in production.
- [x] Validate Cloudflare Access JWT signature, issuer, audience, expiration, and not-before claims using cached JWKS.
- [x] Normalize verified email identity, auto-provision users, and support first-admin configuration.
- [x] Implement profile and allowlisted family-directory endpoints.
- [x] Implement create, invite, accept/decline, lobby assignment, seat preview, start, and cancel endpoints.
- [x] Add the typed one-entry game-module registry for `sequence`.
- [x] Parse every persisted engine snapshot at load time and build dedicated redacted DTOs.
- [x] Implement the command endpoint with strict discriminated request schemas and server-authoritative engine validation.
- [x] Require expected versions and canonical command IDs/hashes for every mutation.
- [x] Atomically persist the conditional snapshot update and one version-matched public event.
- [x] Return exact retries idempotently and reject command-ID reuse with different content.
- [x] Scope every read/write to the authenticated member; enforce host/admin/current-turn permissions.
- [x] Add API tests for authentication, authorization, privacy, concurrency, idempotency, atomicity, and all lobby mutations.
- [x] Verify query plans for dashboard filters and avoid unbounded scans.

## Milestone 3 — Dashboard and lobby UI

- [x] Implement authenticated loading, expired-session handling, logout, and first-login display-name confirmation.
- [x] Add dashboard buckets for Your Turn, Invitations, Waiting on Others, and paginated/collapsed Finished Games.
- [x] Add the Card Lines game picker and disabled future-game placeholders.
- [x] Implement the create-game flow and invitation management.
- [x] Implement equal-team assignment with precise validation messages and automatic seat-order preview.
- [x] Implement invitation acceptance/decline plus host start/cancel controls.
- [x] Add loading, empty, offline, stale-session, and recoverable error states.
- [x] Add component and API-contract tests for the complete lobby journey.

## Milestone 4 — Full game UI

- [x] Build the responsive, accessible 10×10 board with 44px mobile targets and horizontal scrolling.
- [x] Add semantic grid navigation, arrow keys, descriptive cell labels, visible focus, and non-color status cues.
- [x] Render original CSS/SVG playing cards with accessible suit and Jack behavior labels.
- [x] Implement card selection, legal-target display, move preview, explicit confirm/cancel, and authoritative response replacement.
- [x] Implement one-eyed/two-eyed Jack interactions, dead-card exchange, and conditional pass.
- [x] Implement ambiguous sequence-choice overlays and exact resubmission.
- [x] Render claimed sequences, protected chips, overlap cells, last move, scores, and winner state.
- [x] Add seat order, hand counts, move history, rules, deck/discard counts, and waiting status panels.
- [x] Poll only while visible, refresh on focus/reconnect, stop for terminal games, and recover stale tabs from `409`.
- [x] Add screen-reader announcements, focus-managed dialogs, reduced motion, and manual accessibility checklist.
- [x] Complete desktop/mobile end-to-end coverage without exposing hidden state in network responses.
  - [x] Add the first deterministic browser slice for lobby creation and confirmed play in desktop and mobile Chromium projects.
  - [x] Drive a two-user create/invite/accept/team/start/play/resume journey through the real Worker and an isolated D1 database.
  - [x] Compare real response bodies with persisted private hands and prove that neither player receives the other's card-instance IDs.

## Milestone 5 — Hardening and production launch

- [x] Complete the Playwright flows for two users, deterministic wins, Jacks, exchange, stale tabs, mobile play, and response privacy.
- [ ] Run automated and manual accessibility audits and fix failures.
  - [x] Run `axe-core` in the component suite and fix the board's required grid-row hierarchy.
  - [x] Run browser-based `axe-core` audits for the dashboard, lobby, and active board in both desktop and mobile projects.
- [x] Add restrictive deployment-compatible CSP and security headers with no third-party scripts.
- [x] Add structured request-ID logging that excludes tokens, hands, deck order, and snapshots.
- [x] Finalize migration, deployment, backup/restore, admin, cancellation, log, secret-rotation, and quota runbooks.
- [ ] Validate production configuration before deployment and run migrations deliberately.
- [ ] Deploy GitHub Pages and the `/api/*` Worker route after CI passes.
- [ ] Configure Cloudflare Access OTP with an explicit family allowlist.
- [ ] Smoke-test unauthenticated, disallowed, and approved-account behavior with at least two real accounts.
- [ ] Verify a persisted multi-device game can be completed and all final acceptance checks pass.

## Deferred product decisions

The final public game name, repository license, notifications, rematches, resign/forfeit behavior, retention, turn deadlines, sounds, additional games, expanded statistics, automated Access onboarding, spectators/replays, and PWA/offline support remain deliberately undecided for the MVP.
