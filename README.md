# Family Game Night

Family Game Night is a private, asynchronous collection of family games. The first game is the original-styled **Card Lines**, a Sequence-style card-and-chip game.

This repository currently contains the Milestone 0 deployment skeleton and the pure Milestone 1 rules engine. Authentication, persistence-backed commands, lobby UI, and the full game UI deliberately begin in later milestones.

## Requirements

- Node.js 24.13.0 or newer in the Node 24 line
- pnpm 11.25.0 (pinned through the `packageManager` field)

## Start locally

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item .dev.vars.example apps\worker\.dev.vars
pnpm dev
```

The web app runs at `http://localhost:5173` and proxies `/api/*` to the Worker at `http://localhost:8787`. The shell calls `/api/v1/health` to verify the route.

## Quality gate

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for progress and the setup/runbook documents under `docs/` before configuring external infrastructure.

No license has been added because license selection is an explicitly deferred product decision.
