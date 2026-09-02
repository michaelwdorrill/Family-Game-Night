# Operations

## Local startup

1. Install the pinned Node and pnpm versions.
2. Run `pnpm install --frozen-lockfile`.
3. Copy `.dev.vars.example` to `apps/worker/.dev.vars` and use only example/test-domain identities.
4. Run `pnpm dev`; open `http://localhost:5173`.
5. Confirm the shell reports that the proxied `/api/v1/health` service is connected.

The development identity bypass is not implemented until Milestone 2. When implemented, it must run only when `ENVIRONMENT=development`; production validation must fail if `DEV_AUTH_EMAIL` is present.

## Local D1 migrations and reset

Apply migrations with:

```sh
pnpm --filter @family-game-night/worker db:migrate:local
```

Wrangler stores local state under `apps/worker/.wrangler`, which is ignored. To reset local data, stop the Worker, move that specific `.wrangler/state` directory to a dated backup outside the repository, then reapply migrations. Do not delete broad workspace or home-directory paths.

## Production migrations

Back up/export D1 first, review every unapplied SQL migration, and deliberately run:

```sh
pnpm --filter @family-game-night/worker db:migrate:remote
```

Apply schema changes before deploying code that depends on them. Record the migration result in the release notes.

## Family access and administrators

Add or remove approved family addresses in the explicit Cloudflare Access Allow policy/email list. Access controls site admission; an application user row does not grant site access. In Milestone 2, application admins are changed through a parameterized D1 statement against a normalized email after the operator confirms the target row. Never display or log the full user table as part of routine operations.

## Cancelling a corrupted game

Prefer the authenticated admin cancellation endpoint once implemented. It must version the snapshot and add a public `GAME_CANCELLED` event without returning or logging `state_json`. Before direct database intervention, export D1, resolve exactly one game ID using non-hidden metadata, and retain an audit note. Do not edit cards or deck order by hand.

## Export and restore

Use the current official Wrangler D1 export command after checking `wrangler d1 --help`, because platform CLI syntax can change. Store exports encrypted with restricted access: they contain emails and hidden hands. Restore into a new database first, validate migrations and row counts, then update the binding during a controlled maintenance window.

## Safe logs

Use Wrangler tail or the Cloudflare dashboard to inspect request IDs, route, status, duration, game ID, version, and command outcome only. Never log Access assertions, cookies, email lists, request authorization headers, `state_json`, card hands, deck order, random state, or complete mutation bodies.

## Secret rotation and quota review

- Rotate the GitHub Actions API token by creating a replacement with the same narrow scope, updating the protected secret, testing a deployment, and revoking the old token.
- Rotate Access/Worker secrets through Wrangler or the dashboard; redeploy and test before removing old material where overlap is supported.
- Recheck current Cloudflare Workers, D1, Pages, Access, and GitHub Actions quotas in their official dashboards/docs before launch and periodically afterward. Quota numbers are intentionally not hardcoded here.
