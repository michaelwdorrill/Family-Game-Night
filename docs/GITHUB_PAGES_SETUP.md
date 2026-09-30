# GitHub Pages setup

1. Create or select the GitHub repository that contains this project.
2. In repository Settings → Pages, choose GitHub Actions as the source.
3. Decide the production hostname and add it as the Pages custom domain.
4. Add the GitHub Pages verification DNS record if GitHub requests it.
5. Wait for GitHub's HTTPS certificate to become ready before proxying the hostname through Cloudflare.
6. Add the required DNS record for the Pages origin, then enable the Cloudflare proxy after certificate validation.
7. Keep Vite's production base at `/`; routes use `HashRouter`, so game links have the form `/#/games/<id>`.
8. Review and manually run the Pages workflow. It installs from the exact lockfile, runs the quality gate, and uploads only `apps/web/dist`.
9. Configure the Cloudflare Worker route for `hostname/api/*`; verify the static origin never handles API paths.
10. Add the Cloudflare static response-header rule from `docs/CLOUDFLARE_SETUP.md`; GitHub Pages does not provide the required custom security headers itself.
11. After both deployments, test the home page, a hash-route refresh, static assets, `/api/v1/health`, Access login/logout, and the effective document/API response headers.

The deployment workflow is intentionally manual until the real repository, custom domain, and protected GitHub environment are configured and reviewed. Because a repository has one Pages site, decide whether that site will be temporarily bound to a prelaunch staging hostname or whether a separate staging static origin will be supplied; never let the staging frontend call production D1.
