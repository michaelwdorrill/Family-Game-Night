# Cloudflare setup

No Cloudflare resource is created automatically by the repository. Complete these steps with an account that controls the intended hostname. Use separate staging and production resources; staging is where migrations, Access policy, routing, and a complete two-user game are proven before production changes.

## Environment separation

Create two D1 databases and two Worker environments:

- `family-game-night-staging` with a staging hostname and test-only allowlist;
- `family-game-night` with the production hostname and family allowlist.

Never point staging at the production D1 database. Use different GitHub environments and deployment approvals. Promote the same reviewed commit from staging to production rather than testing uncommitted code in production. GitHub Pages supplies one site per repository, so the owner must either use the final static site as the prelaunch staging origin and later switch its custom hostname, or supply a separately reviewed staging static origin. Do not silently deploy an additional hosting product.

## Domain, D1, and Worker

1. Add or select the production domain in Cloudflare DNS.
2. Finish the GitHub Pages custom-domain setup before enabling the proxied DNS record.
3. Create D1 databases named `family-game-night-staging` and `family-game-night`, and record their database IDs.
4. Replace the all-zero staging and production placeholders in `apps/worker/wrangler.toml`. Database IDs are identifiers, not credentials; do not commit account tokens or real email values.
5. From a trusted workstation, authenticate Wrangler and run the staging migration first. Run the production migration only after the staging smoke test passes and its backup/rollback checkpoint is recorded.
6. Create/deploy the Worker and bind the D1 database as `DB`.
7. Add a Worker route for only `games.example.com/api/*`, replacing the example hostname.
8. Configure production Worker values for `ENVIRONMENT=production`, `APP_ORIGIN`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUDIENCE`, and `ADMIN_EMAIL`. Do not configure `DEV_AUTH_EMAIL` in production.

## Access

1. In Cloudflare Zero Trust, go to **Settings → Authentication → Login methods**, add **One-time PIN**, and save it. New organizations do not necessarily enable OTP automatically; confirm it appears as an available method. See Cloudflare's [current OTP setup and behavior](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).
2. Go to **Access controls → Applications → Add an application**, choose **Self-hosted and private**, and add the public hostname covering the entire site (`games.example.com/*`). See Cloudflare's [self-hosted application procedure](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/).
3. Create an Allow policy that names only the approved family email addresses, or a tightly controlled Access email list containing only those addresses.
4. Do not use **Include → Everyone** or **Include → Login Methods → One-time PIN** as the only rule; Cloudflare documents that either configuration can admit any valid email. Use exact **Emails** entries or a tightly controlled email list. See [Access policy misconfiguration guidance](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/).
5. Record the application audience tag and Access team domain in Worker configuration.
6. Confirm the Access logout URL for the hostname (`/cdn-cgi/access/logout`) before launch.

## Static response security headers

The production build contains a CSP meta policy, but `frame-ancestors` and several defense-in-depth headers require an HTTP response header. GitHub Pages cannot configure these headers, so add one Cloudflare Response Header Transform Rule after the hostname is proxied.

1. In the zone dashboard, open **Rules → Overview**.
2. Select **Create rule → Response Header Transform Rule**.
3. Name it `Family Game Night security headers`.
4. Match only the exact staging or production hostname being configured.
5. Use **Set static** (not **Add static**) for each header so duplicate policies are not accumulated:
   - `Content-Security-Policy`: `default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'; upgrade-insecure-requests`
   - `Permissions-Policy`: `camera=(), geolocation=(), microphone=()`
   - `Referrer-Policy`: `no-referrer`
   - `X-Content-Type-Options`: `nosniff`
   - `X-Frame-Options`: `DENY`
6. Save as draft until the staging hostname is ready, then deploy it there first.
7. Inspect the document and `/api/v1/me` responses in browser developer tools. Confirm there is one effective CSP, scripts/styles/API calls still load, and no third-party request is made.

Cloudflare's current dashboard procedure is documented under [Response Header Transform Rules](https://developers.cloudflare.com/rules/transform/response-header-modification/create-dashboard/). A proxied DNS record is required, and Cloudflare recommends **Set** when another feature or origin may already emit the same header.

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
- The document response includes the security-header rule, the API remains `Cache-Control: no-store`, and no CSP violation blocks first-party assets.
- A valid Access JWT maps to the correct normalized application identity.
- At least two approved accounts can create and finish a persisted game before general family use.
