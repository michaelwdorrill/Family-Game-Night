# Cloudflare setup

No Cloudflare resource is created automatically by the repository. Complete these steps with an account that controls the intended hostname.

## Domain, D1, and Worker

1. Add or select the production domain in Cloudflare DNS.
2. Finish the GitHub Pages custom-domain setup before enabling the proxied DNS record.
3. Create a D1 database named `family-game-night` and record its database ID.
4. Replace the all-zero local placeholder in `apps/worker/wrangler.toml` during production configuration. Do not commit account tokens.
5. From a trusted workstation, authenticate Wrangler and run `pnpm --filter @family-game-night/worker db:migrate:remote`.
6. Create/deploy the Worker and bind the D1 database as `DB`.
7. Add a Worker route for only `games.example.com/api/*`, replacing the example hostname.
8. Configure production Worker values for `ENVIRONMENT=production`, `APP_ORIGIN`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUDIENCE`, and `ADMIN_EMAIL`. Do not configure `DEV_AUTH_EMAIL` in production.

## Access

1. In Cloudflare Zero Trust, enable email one-time PIN as an identity provider.
2. Create a self-hosted Access application covering the entire production hostname (`games.example.com/*`).
3. Create an Allow policy that names only the approved family email addresses, or a tightly controlled Access email list containing only those addresses.
4. Do not add a broad “emails ending in” rule or unrestricted OTP rule.
5. Record the application audience tag and Access team domain in Worker configuration.
6. Confirm the Access logout URL for the hostname (`/cdn-cgi/access/logout`) before launch.

## GitHub Actions secrets

Create a protected `production` environment and add narrowly scoped values:

- `CLOUDFLARE_API_TOKEN`: Worker/D1 deployment permissions only.
- `CLOUDFLARE_ACCOUNT_ID`: the owning account ID.

Protect the environment with required reviewers if the account supports them. Keep application configuration in Wrangler variables/secrets as appropriate; never put Access tokens, API tokens, or real `.dev.vars` values in the frontend bundle.

## Launch checks

- Visiting the hostname while signed out redirects to Access.
- An approved address receives OTP and reaches the app.
- An unapproved address is rejected.
- `/api/v1/health` resolves through the Worker route, not Pages.
- A valid Access JWT maps to the correct normalized application identity once Milestone 2 lands.
- At least two approved accounts can create and finish a persisted game before general family use.
