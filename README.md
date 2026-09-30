# Family Game Night

Family Game Night is a private, asynchronous collection of family games. The first game is the original-styled **Card Lines**, a Sequence-style card-and-chip game.

This repository contains the pure Card Lines rules engine, authenticated D1-backed command API, dashboard, lobby, responsive game interface, and desktop/mobile browser suite. The remaining pre-launch work is manual accessibility/security verification and owner-controlled Cloudflare/GitHub staging and production setup.

## Requirements

- Node.js 24.13.0 or newer in the Node 24 line
- pnpm 11.25.0 (pinned through the `packageManager` field)

## Start locally

```powershell
corepack pnpm install --frozen-lockfile
Copy-Item .dev.vars.example apps\worker\.dev.vars
.\scripts\dev.ps1
```

The launcher creates repository-local Corepack shims without Administrator access, verifies the exact lockfile, applies local D1 migrations, and starts both services. If the shims are already on `PATH`, `pnpm dev` starts the same services without reinstalling or migrating.

The web app runs at `http://127.0.0.1:5173` and proxies `/api/*` to the Worker at `http://127.0.0.1:8787`. Local authenticated requests use only the development email in `apps/worker/.dev.vars`; hosted environments reject that bypass. Keep `APP_ORIGIN` exactly equal to the URL in the browser, including `127.0.0.1` versus `localhost` and the port.

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
