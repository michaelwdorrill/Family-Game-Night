# Family Game Night

Family Game Night is a link-only, asynchronous game hub. Family members choose their name and play Card Lines, partnership Euchre, Phase Rummy (the ten-phase game), or Lantern Rummy. Mexican Train Dominoes is waiting for the family ruleset.

Hosts can open a table to everyone or invite selected players, choose whether a full table starts automatically, and set a turn timer. A Cloudflare Worker plays a random legal turn when time expires. Open the [family hub guide](docs/FAMILY_TABLES.md) for game rules, local play and Cloudflare deployment.

## Requirements

- Node.js 24.15.0 or newer in the Node 24 line (CI uses the version in `.node-version`)
- pnpm 11.25.0 (pinned through the `packageManager` field)

## Start locally

```powershell
corepack pnpm install --frozen-lockfile
Copy-Item .dev.vars.example apps\worker\.dev.vars
.\scripts\dev.ps1
```

The launcher creates repository-local Corepack shims without Administrator access, verifies the exact lockfile, applies local D1 migrations, and starts both services. If the shims are already on `PATH`, `pnpm dev` starts the same services without reinstalling or migrating.

With the example local configuration, open `http://127.0.0.1:5173/#/?family=local-family-preview`. Vite proxies the API to the Worker on port 8787. Keep `APP_ORIGIN` equal to the browser origin. Earlier Access-backed Card Lines games use `/#/classic`.

## Try Euchre and Lantern Rummy locally

Run either command from the workspace root after installing dependencies. Players take turns at one terminal. Press Enter to reveal your hand, enter a numbered action, and pass the terminal when prompted. Enter `q` at the action prompt to end the session. Games run in memory for this playtest.

```sh
pnpm playtest euchre
pnpm playtest lantern 3
```

**Euchre** seats four players in opposite partnerships. The jack of trump ranks first, followed by the other jack of the same color, which counts as trump for following suit. An order in the first bidding round requires the dealer to pick up the upcard and discard. In round two, players can name any other suit. Eight passes rotate the dealer and start a fresh hand. Makers earn one point for three or four tricks, two for a sweep, or four for a lone sweep. Defenders earn two for euchring the makers. First partnership to ten wins.

**Lantern Rummy** seats two to four players and uses a standard deck with aces low. Start with six cards. Draw from the stock or take the visible discard. You can bank one goal per turn, then discard. Your three goals, in order, are a trio of one rank, a suited run of three, and two pairs of adjacent ranks. Banking either of the first two replenishes your hand to seven before your discard. The stock recycles banked cards and buried discards. The first player to bank all three goals wins immediately.

## Quality gate

```sh
corepack pnpm lint
corepack pnpm format:check
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
```

`test:e2e` uses installed Microsoft Edge on Windows. CI installs Playwright's pinned Chromium build and runs the same desktop and mobile projects. The suite includes mocked deterministic edge cases plus a two-browser journey through the real Worker and a fresh local D1 database; it never requires or mutates hosted Cloudflare resources.

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for honest milestone status, [docs/ACCESSIBILITY_CHECKLIST.md](docs/ACCESSIBILITY_CHECKLIST.md) for the manual audit, and the setup/runbook documents under `docs/` before configuring external infrastructure.

No license has been added because license selection is an explicitly deferred product decision.
