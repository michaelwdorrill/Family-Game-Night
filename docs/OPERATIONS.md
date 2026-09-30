# Operations

## Local startup

The local environment is the first sandbox. It uses a local Worker, an ignored local D1 database, and a single test-only identity; it cannot reach the hosted staging or production databases.

1. Open PowerShell in the repository root.
2. If `apps\worker\.dev.vars` does not exist, copy `.dev.vars.example` there and keep only test-domain addresses in it.
3. Set `APP_ORIGIN` to the exact browser origin, normally `http://127.0.0.1:5173`. `localhost` and `127.0.0.1` are different origins.
4. Run `scripts\dev.ps1`. The script installs from the exact lockfile, applies local D1 migrations, and starts Vite plus Wrangler through repository-local Corepack shims.
5. Open `http://127.0.0.1:5173` and confirm that the dashboard loads.
6. Stop both services with `Ctrl+C` in the PowerShell window.

The development identity bypass is accepted only when `ENVIRONMENT` is `development` or `test`. Worker startup fails closed if `DEV_AUTH_EMAIL` is configured in staging or production. Never use a real family address in `.dev.vars`.

If ports 5173 or 8787 are already occupied, stop the program using them before running the standard launcher. When deliberately using alternate ports, the Vite proxy target, Wrangler port, browser URL, and `APP_ORIGIN` must be changed together.

## Local D1 migrations and reset

Apply forward migrations without resetting data:

```powershell
pnpm --filter '@family-game-night/worker' db:migrate:local
```

Wrangler stores local state below `apps\worker\.wrangler`, which Git ignores. For a recoverable reset:

1. Stop the local Worker.
2. Resolve and verify the exact `apps\worker\.wrangler\state` path.
3. Move that directory to a dated backup directory outside the repository; do not recursively delete a calculated or broad path.
4. Run the local migration command again.
5. Start the app and create a disposable game to verify the reset.

## Staging release

Staging must use its own D1 database, Worker environment, hostname/origin, Access application, allowlist, and protected GitHub environment. It must never bind production D1.

1. Export or checkpoint the staging D1 database.
2. Review the exact commit and every unapplied file in `migrations/`.
3. Run the **Deploy Worker to Staging** workflow. It runs the full quality gate, refuses the placeholder D1 ID, applies staging migrations, and deploys the same checked-in Worker commit.
4. Deploy the matching static build to the approved staging web origin.
5. Run the accessibility checklist and a two-account create/invite/start/play/refresh/cancel smoke test.
6. Inspect response headers and confirm that browser responses never contain another player's cards, `state_json`, draw-deck order, or command hashes.
7. Record the commit, migration output, test identities, findings, and rollback checkpoint.

Do not promote a different unreviewed commit. Production should receive the exact commit that passed staging.

## Production migrations and deployment

The production Worker workflow intentionally does not run migrations. Schema changes are a separate, deliberate operation.

1. Verify that staging passed and record the release commit.
2. Export production D1 and protect the export as sensitive data.
3. Review `wrangler d1 --help` and `wrangler d1 migrations apply --help` on the trusted release workstation because CLI flags can change.
4. Preview/list unapplied migrations if the installed Wrangler version supports it.
5. Run `pnpm --filter '@family-game-night/worker' db:migrate:remote` once, from the reviewed commit.
6. Record the migration result and validate non-sensitive row counts.
7. Run the **Deploy Worker** workflow for that same commit.
8. Run the **Deploy GitHub Pages** workflow for that same commit.
9. Complete the production smoke tests in `docs/CLOUDFLARE_SETUP.md`.

If migration or verification fails, stop. Do not repeatedly rerun uncertain writes or deploy code that expects the failed schema.

## Family access and administrators

Cloudflare Access controls admission to the hostname; the application `users` table does not grant site access.

To add a family member:

1. Add exactly one normalized address to the explicit Access allowlist.
2. Have that person complete an OTP login and choose a display name.
3. Confirm that `/api/v1/me` identifies only that address and that the directory exposes no email to ordinary members.

To remove access, remove the address from the Access policy first. Existing game history may retain the user's minimal identity and public actions.

To change an application administrator:

1. Export D1 and identify the target by normalized email without listing the full user table.
2. Confirm exactly one row matches before changing it.
3. In the D1 console or a reviewed one-purpose SQL file, update only that row's `role` and `updated_at` fields.
4. Query that same normalized address and verify exactly one row now has the intended role.
5. Record the operator, address, timestamp, and reason in the private operations log.

The `ADMIN_EMAIL` configuration provisions the matching first user as an admin; changing the variable does not demote an existing administrator automatically.

## Cancelling a corrupted or abandoned game

Prefer the authenticated UI **Cancel lobby** / **Cancel game** action or `POST /api/v1/games/{gameId}/cancel`. The request must contain a new command ID and the current expected version. The Worker performs the permission check, versions the snapshot, and records one public `GAME_CANCELLED` event.

Before cancellation, resolve exactly one game ID from non-hidden metadata and export D1 if corruption is suspected. Do not edit `state_json`, hands, chips, or deck order manually. If the normal cancellation path cannot parse the game, stop and preserve the database for code-assisted recovery rather than improvising SQL against hidden state.

## Export and restore

D1 exports contain emails, every private hand, and deck order. Treat them as secrets: encrypt them, restrict access, avoid consumer file-sharing links, and delete them only under the agreed retention policy.

Before export or import, run the installed Wrangler version's `wrangler d1 export --help` and `wrangler d1 execute --help`. Export to a new, explicitly named file. Restore into a newly created database first, apply migrations, compare table and game/event counts, and run a disposable two-user game. Switch a binding only during a controlled maintenance window with a recorded rollback database ID.

## Safe logs and incident checks

Application logs contain request ID, method, route, status, and duration only. They deliberately exclude Access assertions, cookies, authorization headers, emails, request bodies, `state_json`, hands, deck order, and random state.

Use Wrangler tail or the Cloudflare dashboard to investigate by time and request ID. Do not add temporary logging of complete requests or snapshots. For an incident, preserve the relevant request IDs and database export, rotate exposed credentials, revoke unintended Access entries, and verify the same commit in staging before a production fix.

## Secret rotation and quota review

- Replace the GitHub Actions API token with another narrowly scoped token, update the protected GitHub environments, test staging, then revoke the old token.
- Rotate Worker/Access values through Cloudflare configuration, deploy and smoke-test the replacement before removing an old value when overlap is supported.
- Never put account tokens, OTPs, Access JWTs, real family addresses, or production configuration in source, Actions logs, issue text, screenshots, or the frontend bundle.
- Check current Workers, D1, Access, DNS, GitHub Pages, and Actions limits in the provider dashboards before launch and at a recorded monthly cadence. Quota numbers are intentionally not copied into this repository because they change.
