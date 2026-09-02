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
10. After both deployments, test the home page, a hash-route refresh, static assets, `/api/v1/health`, and Access login/logout.

The deployment workflow is intentionally manual until the real repository, custom domain, and protected GitHub environment are configured and reviewed.
