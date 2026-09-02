# Architecture

## Production topology

The production design uses one Cloudflare-managed hostname. GitHub Pages serves the static React build at `/`; a Cloudflare Worker route owns `/api/*`; D1 stores server-only snapshots and public events; and Cloudflare Access protects the entire hostname with email one-time PIN authentication restricted to an explicit family allowlist.

The browser always calls relative `/api/v1/*` URLs. This keeps API calls same-origin and avoids production CORS and split-origin Access-cookie behavior.

## Workspace boundaries

- `apps/web` contains the public React/Vite client. It receives only dedicated redacted DTOs.
- `apps/worker` is the authoritative API boundary. It will authenticate, authorize, validate, apply commands, and persist snapshots/events.
- `packages/shared` contains deliberately public API contracts and common validation—not internal snapshots.
- `packages/sequence-engine` contains pure Card Lines rules and internal state. It cannot import React, Hono, Wrangler, D1, or browser UI modules.
- `migrations` contains forward-only D1 schema migrations.

Every stored game carries `game_type` and `state_schema_version`. The MVP will register only the `sequence` module; there is no runtime plugin system.

## State and concurrency boundary

Internal state, deck order, all hands, and random state stay inside the Worker/D1 boundary. The engine returns a new state rather than mutating its input. In Milestone 2, each mutation will require a caller-generated command ID and expected game version. A conditional snapshot update and the matching public event will be written atomically, making exact retries idempotent and stale concurrent submissions safe.

## Randomness

Production shuffles and dealer selection use Web Crypto through an injectable random interface. Deterministic seeded randomness exists only under the engine test tree, which is excluded from production builds and package exports; it is never part of a player view or production configuration.

## Deployment boundary

The checked-in workflows are gated and cannot complete until the owner supplies a real domain, D1 database ID, Worker route, Access configuration, and narrowly scoped GitHub secrets. Those manual steps are documented separately; placeholders are not production configuration.
