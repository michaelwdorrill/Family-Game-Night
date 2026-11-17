# Family Game Night: progress and reorganization handoff

Checkpoint: **2026-11-06 (America/New_York)**. Prepared for the next Codex session, Claude Code session, and review bot.

## Start here

The project is a private asynchronous game hub. Its first game is **Card Lines**, internally `sequence`. The owner selected `Family-Game-Night/` as the home repository. Most later game work is still on the separate `sequence-wip` branch and in the sibling `Sequence/` clone. Preserve that clone until the reviewed work is merged and verified.

The owner now intends to bring Codex and Claude Code work together, retaining some data on C:\ and using D:\ more for archives and storage. This checkpoint records the existing project state and a migration checklist. Exact destination directories are undecided; no relocation, game-code merge, deployment, or bot launch was performed.

Read these records in order:

1. [Charter](../charter.md) and [release contract](../release-contract.md): the approved finish line.
2. [Decisions](../decisions.md): the chosen home repository, the requirement to preserve Sequence, and the approved team.
3. [Approved task plan](../tasks.json): milestones M1-M4 and tasks T1-T11, with owners.
4. This handoff: current evidence, corrections to older inventory statements, and next actions.
5. [Game specification](../../family-game-night-sequence-codex-spec.md) and the implementation plan on the branch under review.

Do not confuse the Office plan's M1-M4 delivery milestones with the implementation checklist's Milestones 0-5. The main branch's [implementation plan](../../docs/IMPLEMENTATION_PLAN.md) describes the earlier scaffold and engine; the [Sequence implementation plan](../../../Sequence/docs/IMPLEMENTATION_PLAN.md) records the later work awaiting review.

## Repository evidence

Workspace at the time of inspection: `C:\Users\Michael\Documents\Codex\Family Game Night`. This parent directory is not a Git repository. All three child repositories had clean working trees before this documentation work.

| Repository                      | Observed revision and branch                                                                  | Meaning                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Family-Game-Night/` on arrival | `main`, `8ee14cd5174ed9e40e617eefd3705c39d5b6b5f7`                                            | Onboarding records present, but three commits behind the verified GitHub main branch.                                                     |
| GitHub `Family-Game-Night` main | `a5f063b6c30defa512f5433e728a4a14baa98290`                                                    | Includes approved records and `.office/tasks.json`.                                                                                       |
| Home checkout after preparation | `docs/reorganization-handoff-2026-11-06`, based on `a5f063b6c30defa512f5433e728a4a14baa98290` | Makes the already approved plan available locally and holds these documentation edits. Local `main` was not advanced.                     |
| `Sequence/`                     | `sequence-wip`, `57991a69158059828d93049cd528300b0e762f49`                                    | Exactly matches the live GitHub branch; later game work remains unmerged.                                                                 |
| Nested `The-Office/`            | `claude/sharp-cerf-oe4njs`, `13b4fdce258c476939514685c5ae7f25a32feb21`                        | Separate repository and old checkout. Cached upstream branch was 75 commits ahead; this was not a fresh remote comparison for The Office. |

Live GitHub checks confirmed:

- [PR #1: Office onboarding records](https://github.com/michaelwdorrill/Family-Game-Night/pull/1) and [PR #2: Office first project plan](https://github.com/michaelwdorrill/Family-Game-Night/pull/2) are merged.
- [Main compared with sequence-wip](https://github.com/michaelwdorrill/Family-Game-Night/compare/main...sequence-wip) is diverged: the game branch is one commit ahead and six behind main. It is neither a disposable duplicate nor simply a stale copy.
- The game change contains **57 files, 8,636 insertions, and 285 deletions** from common ancestor `6b6a8cbfc19871c17f797a038a4ca548d686ade1`.
- The repository PR search returned the two merged onboarding PRs and no game-work PR. Recheck before opening a new PR.

The approved task plan's T1 text says the home checkout has no local HEAD; that is historical and no longer accurate. The home repository has valid Git history, the onboarding PRs are merged, and the approved plan is available in this documentation branch. Keep the approved plan intact and use this dated evidence to interpret it.

These handoff edits are **local, uncommitted, and unpushed** at this checkpoint. A remote-only reviewer or fresh clone cannot see them yet. Preserve them in a verified workspace copy, then commit and deliver them through the normal review process when publishing the checkpoint. Update this statement after publication.

## Progress already recorded

The following is supported by checked-in plans and corresponding source/test files. It is not a fresh functional certification: the application quality gates were not rerun during this documentation task.

| Area                                | Recorded progress                                                                                                                                                                            | Evidence location                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Scaffold and deployment skeleton    | Implemented in main: TypeScript/pnpm workspace, React/Vite shell, Hono Worker, initial D1 schema, CI and deployment workflows.                                                               | Home `docs/IMPLEMENTATION_PLAN.md`, Milestone 0; `apps/`, `migrations/`, `.github/workflows/`.                       |
| Pure Card Lines engine              | Implemented in main: board/deck, teams/seating, legal moves, Jacks, exchange/pass, sequence claims, wins, redacted views, and rules tests.                                                   | Home `packages/sequence-engine/`; implementation Milestone 1.                                                        |
| Authentication and persistence API  | Recorded as implemented on `sequence-wip`: Access JWT validation, user/profile/directory, invitations/lobbies, versioned/idempotent commands, persistence and privacy checks.                | Sequence `apps/worker/`, `packages/shared/`, `migrations/0002_profile_confirmation.sql`; implementation Milestone 2. |
| Dashboard and lobby                 | Recorded as implemented on `sequence-wip`: game creation, invitation handling, team assignment, seat preview, start/cancel, and UI states.                                                   | Sequence `apps/web/src/features/dashboard/` and `features/lobby/`; implementation Milestone 3.                       |
| Game interface and browser coverage | Recorded as implemented on `sequence-wip`: responsive board, card/move/sequence controls, history, turn refresh, desktop/mobile cases, and real Worker/D1 two-player flow.                   | Sequence `apps/web/src/features/game/`, `e2e/`, and `playwright.config.ts`; implementation Milestone 4.              |
| Hardening                           | Partial: automated accessibility checks, CSP/security headers, request-ID logging, operational runbooks, and staging workflow are recorded. Manual checks and launch acceptance remain open. | Sequence implementation Milestone 5 and `docs/ACCESSIBILITY_CHECKLIST.md`.                                           |
| Project governance                  | Approved charter, release contract, decisions, staff, and 11-task plan are present on GitHub main.                                                                                           | Home `.office/`; merged PRs #1 and #2.                                                                               |

The existing startup documentation requires `APP_ORIGIN` to exactly match the browser origin, including hostname and port. Successful independent retesting of the earlier startup/origin fix is still required. Do not infer success from the existence of `scripts/dev.ps1` or old test-output directories.

## Remaining project work

The approved plan names **Mei** as manager/implementation owner and **Uriel** as the independent game-quality/release reviewer. These are recorded roles, not newly launched agents or active claims.

| Task                                 | Status at this checkpoint                                                                                                                          | Evidence needed to finish                                                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1: reconcile records and repository | Original missing-HEAD/records problem is resolved by inspected Git history and merged PRs. Current home working branch includes the approved plan. | Retain the Git/PR references above; reconcile any bot task-state record with this evidence.                                                                                                       |
| T2: review existing game             | Pending independent verification.                                                                                                                  | Review the exact game candidate against the specification and release contract; record severity, reproduction, affected requirement, and closure evidence for each finding.                       |
| T3: startup and reviewed merge       | Pending.                                                                                                                                           | Retest startup and origin behavior, resolve blockers, run the full quality gate, merge through a reviewed PR, and verify the home checkout contains all game work. Preserve Sequence until then.  |
| T4: forecast and blockers            | Pending T2/T3.                                                                                                                                     | Estimate remaining effort from findings; name hosting/account/family-participation dependencies and allow several calendar days for asynchronous trials.                                          |
| T5: game behavior                    | Pending independent verification.                                                                                                                  | Cover two and three teams, equal teams, invitations, simultaneous games, Jacks, exchange/pass, protected sequences, illegal actions, and wins.                                                    |
| T6: privacy and durable progress     | Pending independent verification.                                                                                                                  | Verify membership boundaries, private hands, duplicate/simultaneous requests, stale tabs, refreshes, device changes, and long breaks without manual saved-game repair.                            |
| T7: accessibility and dependencies   | Open.                                                                                                                                              | Complete the manual checklist on staging and production, rerun automated checks, perform the dependency vulnerability audit, assess findings, and recheck fixes.                                  |
| T8: hosting and restricted sign-in   | Open; deployment state not verified here.                                                                                                          | Validate Cloudflare/D1/GitHub configuration, apply migrations deliberately, deploy the reviewed candidate, configure the explicit family allowlist, and check allowed/denied/signed-out behavior. |
| T9: hosted readiness and recovery    | Open.                                                                                                                                              | Test the exact hosted candidate on phones/computers and record backup, restore, rollback, and hosted-only defect evidence.                                                                        |
| T10: family trials                   | Open.                                                                                                                                              | Complete at least one two-team and one three-team game across multiple days and devices with real approved family accounts.                                                                       |
| T11: release gate                    | Open; depends on preceding evidence.                                                                                                               | Map every release requirement to passing evidence, resolve blockers, verify the released version, and record the release decision.                                                                |

Manual accessibility checklist: [Sequence/docs/ACCESSIBILITY_CHECKLIST.md](../../../Sequence/docs/ACCESSIBILITY_CHECKLIST.md). Every checkbox remains open in the inspected copy. Hosting and recovery references are [Cloudflare setup](../../../Sequence/docs/CLOUDFLARE_SETUP.md), [GitHub Pages setup](../../../Sequence/docs/GITHUB_PAGES_SETUP.md), and [operations](../../../Sequence/docs/OPERATIONS.md).

Deferred scope remains unchanged: additional games and the other product decisions listed in the implementation plan are not prerequisites invented by this handoff. The approved first release is the hub plus Card Lines.

## Review-bot starting instructions

1. Refresh repository and PR status before relying on this dated snapshot. Resolve the exact candidate SHA; initially the game candidate is `57991a69158059828d93049cd528300b0e762f49`.
2. Read the approved records and T2/T3 scope. Review the game branch's files, not only the earlier implementation present on main. Preserve main's `.office/`, `AGENTS.md`, and `CLAUDE.md` when integrating game work.
3. Use the game's documented Node 24 requirement (24.13.0 or newer in that line) and pinned pnpm 11.25.0. From the game candidate checkout, install with `corepack pnpm install --frozen-lockfile`, then run:

   ```text
   corepack pnpm lint
   corepack pnpm format:check
   corepack pnpm typecheck
   corepack pnpm test
   corepack pnpm build
   corepack pnpm test:e2e
   ```

4. Run the dependency audit required by T7, for example `corepack pnpm audit`, and assess rather than silently dismiss findings. Browser tests use installed Microsoft Edge on Windows; CI uses Playwright Chromium. Record environment limitations and missing checks explicitly.
5. Record each command's result against the exact commit, date, runtime, and environment. Include startup/origin results and manual or hosted evidence separately. Use severity, requirement, reproduction, fix, and retest evidence for findings.
6. Follow the existing reviewed-PR rule for default-branch changes. This handoff neither accepts the game work nor records a release approval.

The connected Office MCP service's project inventory did **not** include Family Game Night on 2026-11-06, although this repository has `.office/office.json` with project ID `family-game-night-155976`. Local records and service enrollment are distinct. Verify the intended review bot's registration and path mapping before expecting automatic discovery; no service task state or enrollment was changed here.

## C:\ / D:\ reorganization checklist

### Decisions still open

- Exact shared project root for Codex and Claude Code, and the destination of the Family Game Night home repository.
- Exact D:\ archive/storage root, retention scheme, and which data needs to stay active on C:\.
- Whether the redundant Sequence clone will be archived after merge or retained as a deliberate working copy.
- Which Office checkout is authoritative for the reorganization. The connected service reports `C:\Users\Michael\Documents\ChatGPT\The Office` as its active Office development repository, outside this workspace. The nested `The-Office/` clone must be compared before retirement.
- Where the review bot will read this checkpoint and how relocated project paths will be registered.

Suggested allocation, pending those decisions:

| Data class                                                                                         | Suggested placement                                                           | Preservation requirement                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Active source checkout, `.git`, `.office/`, specs, plans, review evidence                          | One shared active project location on C:\, unless the owner chooses otherwise | Both tools use the same chosen repository; preserve branch/worktree relationships and local changes.                                                                     |
| Archived snapshots, retired clones, large completed reports/artifacts, backup exports              | D:\ archive/storage root                                                      | Record original path, revision, date, and checksums where applicable; verify restore before retiring an original.                                                        |
| Local D1/application state and required local configuration                                        | Explicitly assigned active or protected backup location                       | Git does not preserve ignored data. Inventory by path/metadata; do not read or publish secret contents. Copy databases using an appropriate consistent backup procedure. |
| `node_modules`, `.pnpm-store`, `.corepack`, `.npm-cache`, build outputs and disposable test output | Regenerate or assign to a tooling/cache location                              | Distinguish reproducible caches from unique state. Preserve review evidence separately if test output is needed.                                                         |

The Sequence checkout visibly contains ignored/generated directories such as `.wrangler`, `.corepack`, `.npm-cache`, `node_modules`, and `test-results`. Do not assume every ignored file is disposable: `.wrangler` can include local application state. No credential files or local secret values were opened for this checkpoint.

Migration sequence:

- [x] Identify the chosen home repository and the separate game/Office clones.
- [x] Record exact local revisions, current GitHub game/main state, existing plans, and outstanding release work.
- [x] Make the approved task plan available in the local home checkout and add this review handoff.
- [ ] Select exact destinations and write an old-path to new-path map for every repository, archive, and required local-state location.
- [ ] Record branches, remotes, worktrees, tracked changes, untracked files, and ignored state at migration time. Include these currently uncommitted handoff edits and the parent README.
- [ ] Quiesce active writers as needed and make verified copies/backups of unique data. Do not overwrite an existing destination or retire an original before validation.
- [ ] Copy/relocate using the agreed map. Preserve Git metadata and any linked-worktree references; avoid blind whole-tree copies into a populated repository.
- [ ] Update project registrations, both coding tools' project paths, review-bot mappings, and affected scripts/shortcuts. Retain former-path aliases or notes where supported so older sessions remain attributable.
- [ ] Verify Git status, branch revisions, uncommitted files, `.office/` records, local state, startup, and the game quality gate from the new location.
- [ ] Verify both coding tools and the review bot resolve the same project and can read the progress/remaining-work records.
- [ ] Retire or archive Sequence only after its reviewed merge and preservation checks. Evaluate the old nested Office clone separately against the active Office repository.
- [ ] Update this handoff with final locations, backup/restore evidence, commit/PR references, and remaining blockers.

Vendor-managed session/configuration directories were not inventoried or relocated. If those are included in the later reorganization, treat them as a separate explicitly mapped migration with the relevant application's supported procedure; the project-folder move alone does not establish that their references still work.

## Verification boundary

This checkpoint verified filesystem layout, local Git state/history, existing project records and implementation checklists, current GitHub main/game branch comparisons, merged onboarding PRs, and the connected Office project's enrollment list. It prepared documentation only. Application tests, dependency audit, startup, hosted access, manual accessibility, family trials, archive integrity, and post-move bot operation remain to be evidenced by the corresponding tasks above.
