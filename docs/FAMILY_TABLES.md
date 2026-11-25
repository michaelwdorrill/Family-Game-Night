# Family tables

## Local play

Copy the tracked example to `apps/worker/.dev.vars` on a fresh checkout, install packages, apply the local migrations, and start both services from the repository root.

```sh
pnpm install --frozen-lockfile
pnpm --filter @family-game-night/worker db:migrate:local
pnpm dev
```

Open `http://127.0.0.1:5173/#/?family=local-family-preview` with the example configuration. Confirm a name. To try another seat, use **Switch player** or a different browser profile. The family link and last confirmed name are remembered on that browser. On another device, open the family link or a shared table link and select the same name to resume.

## Lobbies and turns

A host chooses the game, seat count, open or invite-only admission, a 1-, 3-, or 7-day turn timer, and how a full table starts. Invitations appear on the recipient’s game tile and at the top of its lobby list. The host can invite replacements after a decline. Open seats go to the first successful join. A full host-controlled table stays visible to its seated players until the host starts it.

Players sit in joining order. Opposite seats are partners in four-player Euchre. At a full host-start Euchre table the host can choose their partner before dealing. Card Lines alternates teams in seat order. Hosts can select two or three equal teams when the table size supports both. In-app turn counts and invitations refresh on focus and while the page is open. Finished matches remain accessible under My Games.

D1 stores the authoritative game state. Each action carries the table version the player saw. Concurrent submissions can advance that version once. A Cron Trigger checks for expired turns every minute, even with every browser closed. Opening or acting on an expired table also processes the timeout. The Worker randomly chooses from legal actions and completes any remaining steps of the expired turn, including mandatory draws and discards. A new turn gets its full duration. Overdue tables advance one turn on recovery from an outage. Opening an old tab cannot fast-forward a match.

## Phase Rummy rules

Two to six players work through ten phases in order using a 108-card deck. Deal ten cards each. Draw from the stock or take the top discard, lay a complete phase if possible, then discard. After laying a phase, a player may add matching cards to any laid group. Going out by discarding, laying a phase, or adding the last card ends the round. Players who laid their phase advance. Others repeat it.

| Phase | Requirement                      |
| ----- | -------------------------------- |
| 1     | Two sets of three                |
| 2     | A set of three and a run of four |
| 3     | A set of four and a run of four  |
| 4     | A run of seven                   |
| 5     | A run of eight                   |
| 6     | A run of nine                    |
| 7     | Two sets of four                 |
| 8     | Seven cards of one color         |
| 9     | A set of five and a set of two   |
| 10    | A set of five and a set of three |

Sets share a number. Runs use consecutive numbers from 1 to 12 in any colors. A wild stays where it was played. This edition requires at least one numbered card in each group. Discarding a skip chooses an opponent to miss their next turn. A skip on the discard pile cannot be picked up. If the upcard is a skip when dealing, the opening player loses their turn.

Leftover cards add penalty points. Numbers 1–9 count five, 10–12 count ten, skips count fifteen, and wilds count twenty-five. Completing phase ten wins at the end of the round. Among simultaneous finishers, the lowest total wins. Tied finalists replay phase ten. If the stock runs out, shuffle buried discards to replenish it. If no draw is possible, score the round.

## Cloudflare deployment

Use a separate staging D1 database and hostname to test the family hub. The Worker serves the Vite build through Workers Static Assets and handles `/api/family/*` on the same origin. The existing Access-backed Card Lines API and old game links still work when their original configuration is supplied. Earlier email-account games remain under `/#/classic`.

1. Create the environment’s D1 database and replace its placeholder ID in `apps/worker/wrangler.toml`. Bind a custom domain to the family Worker that covers the entire hostname. The family hostname must admit visitors who have the shared link. If retaining an existing Access deployment, scope its policy to the legacy API or use a separate hostname.
2. Generate a long URL-safe random value, for example with `openssl rand -hex 32`. Store the value as the Worker secret `FAMILY_LINK_KEY` in the selected environment. Use a different value for staging and production. Add `FAMILY_ROSTER_JSON` as a second Worker secret in the same environment. Its value is a nonempty JSON array of unique display-name strings in dropdown order. Upload it from a private copy of the original roster (preserving exact spelling and order so existing tables can still be resumed), or use fictional names on a test-only environment. Never commit or print the roster, including in Wrangler vars, fixtures or build logs. An absent or malformed roster disables the family routes without changing the classic game. The local example key and names are for development. Set `APP_ORIGIN` to the exact browser origin if the Worker is behind a proxy.
3. Run the staging deployment workflow. It builds the web app, applies the D1 migrations, and deploys the Worker with its assets and cron schedule. For production, apply the reviewed migrations with `pnpm --filter @family-game-night/worker db:migrate:remote` before running the production workflow.
4. Share `https://YOUR-HOST/#/?family=YOUR-URL-SAFE-KEY`. The browser reads the fragment, removes it from the address bar, and presents the key to the family API. Anyone holding the link can select any name. A selected player receives their own hand and public table information. Rotating the shared secret invalidates old links and remembered keys.
5. On staging, use separate browsers to fill one host-start table and one automatic table. Verify private hands, turn badges and a cross-device resume. Set a staging test table’s deadline in the past, close the browsers and verify that cron increments its version once and gives the next turn a new deadline.
