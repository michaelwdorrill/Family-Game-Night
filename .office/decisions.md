# Decisions

## 2026-09-30 · Review the project inventory {#onboarding-onboard-13a6a1ec-9024-4732-991c-5da3aebea24e-inventory-526576696577}

> This project appears to be the local “Family Game Night” folder. The recent conversations refer to Sequence inside it, but the supplied inventory lists no other clone, former location, or GitHub repository. The project folder itself is not a Git repository, so its Git metadata is missing or broken. There is no Git status or remote comparison available; I can’t tell whether the files are behind GitHub or contain uncommitted work. There is no home repository proposal recorded in the available facts. Recent work focused on Sequence, including local setup and fixing its app origin setting. One conversation refers to a Sequence spec in the folder. The supplied information does not confirm any other plans, to-do lists, or release documents.
> 
> **Earlier conversations in Claude cloud?** Answer in your own words and paste their links (claude.ai/code/…). Each costs one short Claude read, which you approve first; then this step is redone with what they say.
> 
> Options offered:
> - Inventory is correct (Recommended) — Continue onboarding with low management usage.
> - Correct it — Keep this stage unchanged and run it again with your note.

**Answer:** https://github.com/michaelwdorrill/Family-Game-Night This is the GitHub repo for it

## 2026-09-30 · Which folder is this project's home? {#onboarding-onboard-f7e82288-0ec8-407a-ad35-abeb62c35fe9-inventory-home-204e69676874}

> **C:\Users\Michael\Documents\Codex\Family Game Night** isn't a git repository; it holds these:
> 
> - **Family-Game-Night**: https://github.com/michaelwdorrill/Family-Game-Night (clean)
> - **Sequence**: https://github.com/michaelwdorrill/Family-Game-Night (changes)
> 
> Choose the one this project lives in. The Office uses it for git and for the project's records; conversations you had in **Family Game Night** still count for this project.
> 
> Options offered:
> - Family-Game-Night (Recommended) — Use Family-Game-Night as the project's repository.
> - Sequence — Use Sequence as the project's repository.
> - None of these — Keep the folder as it is; steps that need git will ask again.

**Answer:** Family-Game-Night

## 2026-09-30 · Review the project inventory {#onboarding-onboard-f7e82288-0ec8-407a-ad35-abeb62c35fe9-inventory-526576696577}

> Family Game Night is the workspace at `C:\Users\Michael\Documents\Codex\Family Game Night`. Its home repository is `Family-Game-Night`, linked to `michaelwdorrill/Family-Game-Night`; that copy is clean. `Sequence` is a second clone of the same GitHub repository and has local changes. The workspace itself is not a Git repository, so it has no project-level Git history. Based on the supplied facts, the home copy is not reported behind GitHub; the changed Sequence copy needs review before its work is reconciled. Recent work focused on Sequence setup and correcting its local app origin. A Sequence specification was mentioned, but the supplied inventory does not confirm where it is. No other former locations, plans, to-do lists, or release documents are confirmed.
> 
> **Earlier conversations in Claude cloud?** Answer in your own words and paste their links (claude.ai/code/…). Each costs one short Claude read, which you approve first; then this step is redone with what they say.
> 
> Options offered:
> - Inventory is correct (Recommended) — Continue onboarding with low management usage.
> - Correct it — Keep this stage unchanged and run it again with your note.

**Answer:** Family Game Night is a hub for asynchronous games. Sequence is the first game; its work is in progress in the Sequence folder and needs to be merged into the main repo. The first release is the hub plus Sequence.

## 2026-09-30 · Which folder is this project's home? {#onboarding-onboard-c41005d6-5611-4bce-8d01-5e3b248ca6c3-inventory-home-204e69676874}

> **C:\Users\Michael\Documents\Codex\Family Game Night** isn't a git repository; it holds these:
> 
> - **Family-Game-Night**: https://github.com/michaelwdorrill/Family-Game-Night (clean)
> - **Sequence**: https://github.com/michaelwdorrill/Family-Game-Night (changes)
> 
> Choose the one this project lives in. The Office uses it for git and for the project's records; conversations you had in **Family Game Night** still count for this project. If it isn't listed, answer with its folder name.
> 
> Options offered:
> - Family-Game-Night (Recommended) — Use Family-Game-Night as the project's repository.
> - Sequence — Use Sequence as the project's repository.
> - None of these — Carry on for now; the Office asks again before it writes its records.

**Answer:** Family-Game-Night

## 2026-09-30 · Review the project inventory {#onboarding-onboard-c41005d6-5611-4bce-8d01-5e3b248ca6c3-inventory-526576696577}

> Family Game Night is a workspace. The project repository the owner chose is Family-Game-Night at `C:\Users\Michael\Documents\Codex\Family Game Night\Family-Game-Night`, connected to GitHub’s `michaelwdorrill/Family-Game-Night`. That copy is clean. A second clone, `Sequence`, is in the same workspace and uses the same GitHub repository; it is behind, so it may need updating. The parent workspace itself is not a Git repository, but the chosen repository’s Git status is clean, so there is no indication of broken Git metadata or uncommitted work in the home copy. The supplied facts do not show any former locations. Recent notes mention Sequence setup and an app-origin fix. A Sequence spec was referenced in earlier work, but no separate plans, to-do lists, or release documents are confirmed by the inventory.
> 
> **Earlier conversations in Claude cloud?** Answer in your own words and paste their links (claude.ai/code/…). Each costs one short Claude read, which you approve first; then this step is redone with what they say.
> 
> Options offered:
> - Inventory is correct (Recommended) — Continue onboarding with low management usage.
> - Correct it — Keep this stage unchanged and run it again with your note.

**Answer:** Correct it: Correction: Sequence is not a stale copy. It held the actual Sequence game work (about 57 files, 8,600 lines: web app, worker API, tests, e2e, staging config) that had never been pushed. That work is now on the sequence-wip branch on GitHub (michaelwdorrill/Family-Game-Night). It hasn't been reviewed or merged into main yet. Family Game Night is a hub for asynchronous games, and Sequence is the first one. The Sequence folder can be retired once sequence-wip is merged; until then, keep it.

## 2026-09-30 · Review the project inventory {#onboarding-onboard-c41005d6-5611-4bce-8d01-5e3b248ca6c3-inventory-526576696577-r1}

> Family Game Night is a hub for asynchronous games, with Sequence as its first game. The chosen home repository is [Family-Game-Night](https://github.com/michaelwdorrill/Family-Game-Night) at `C:\Users\Michael\Documents\Codex\Family Game Night\Family-Game-Night`; it is clean. The `Sequence` folder is a separate working copy of the same repository. It contains the Sequence game work, now on GitHub’s `sequence-wip` branch, but that work has not been reviewed or merged into `main`. Keep this folder until the branch is merged; it can then be retired. The parent workspace itself is not a Git repository, but Git is intact in both copies. The home copy has no uncommitted work; the Sequence copy’s current status relative to GitHub is not specified. No former locations are listed. Recent notes mention Sequence setup and an app-origin fix; earlier work referenced a Sequence spec. No other plans, to-do lists, or release documents are confirmed.
> 
> **Earlier conversations in Claude cloud?** Answer in your own words and paste their links (claude.ai/code/…). Each costs one short Claude read, which you approve first; then this step is redone with what they say.
> 
> Options offered:
> - Inventory is correct (Recommended) — Continue onboarding with low management usage.
> - Correct it — Keep this stage unchanged and run it again with your note.

**Answer:** Inventory is correct

## 2026-09-30 · Review the security baseline {#onboarding-onboard-c41005d6-5611-4bce-8d01-5e3b248ca6c3-security-526576696577}

> I reviewed the Sequence working branch because the chosen Family Game Night home repository has no committed project files. I found no exposed secrets or Salesforce references in the tracked files. A local Worker configuration file, `apps/worker/.dev.vars`, exists and is ignored by Git; I did not open it. No dependency vulnerability was confirmed, but I could not complete a vulnerability audit in this read-only environment, and the branch has no dependency scan in its CI checks. Run a full dependency audit before release. The Sequence branch also needs review before it is merged into the home repository.
> 
> Options offered:
> - Baseline is correct (Recommended) — Continue onboarding with low management usage.
> - Correct it — Keep this stage unchanged and run it again with your note.

**Answer:** Baseline is correct

## 2026-09-30 · Hire this manager? {#onboarding-onboard-c41005d6-5611-4bce-8d01-5e3b248ca6c3-hire-manager-486972652074}

> **Proposed manager**
> 
> - Mei Iyer (already on staff), Codex gpt-6-astra at high effort (top model, about 5× the usage of a mid-size one)
> 
> **Notes**
> 
> Choose Mei Iyer as the lasting manager, using Codex gpt-6-astra at high effort. Family Game Night is a hub for asynchronous games, and the project’s current work centers on Sequence. The recent work is a good fit for a Codex manager: it covers repository setup, app configuration, and ongoing implementation. No specialist seats have been approved, so I’m proposing only the manager.
> 
> Options offered:
> - Hire manager (Recommended) — Continue onboarding with low management usage.
> - Revise — Keep this stage unchanged and run it again with your note.

**Answer:** Hire manager

## 2026-09-30 · Approve the project interview? {#onboarding-onboard-c41005d6-5611-4bce-8d01-5e3b248ca6c3-interview-417070726f76}

> **Proposed answers (check these before approving)**
> 
> - **Finish line:** Release Family Game Night with Card Lines so approved family members can complete two-team and three-team games over multiple days, on phones and computers, without anyone manually repairing saved games. Review and merge the existing work into the chosen home repository, pass release checks, and verify restricted sign-in and a complete game with real family accounts.
> - **Why the project exists:** Give family members a private place to enjoy games together whenever their schedules allow, starting with Card Lines and leaving room for other games later.
> - **Must work at release:** Approved family members can sign in, manage invitations, create equal teams, and play multiple games. Card Lines follows the specified rules, including Jacks, dead-card exchanges, protected sequences, and winning conditions. Hands stay private, illegal moves are rejected, and repeated clicks or outdated tabs cannot corrupt a game. Progress survives refreshes, device changes, and long breaks. Play works on phones and computers, with keyboard access and clear labels.
> - **Risks you accept:** The first release deliberately includes only Card Lines. Turn reminders, chat, spectators, computer opponents, offline moves, and native mobile apps are deferred. Updates may take a short time to appear between turns. The final game name and repository license remain deferred decisions. No acceptance of unresolved security, accessibility, or saved-game reliability problems is recorded.
> - **Lead team:** Codex
> - **Priority:** P2
> 
> **Notes**
> 
> Family Game Night’s first game is Card Lines, a Sequence-style game. Project notes mark the rules, saved games, dashboard, invitations, phone and desktop play, and automated tests as built. Recent work also fixed a local startup setting; successful retesting is not recorded. The game work still needs review and merging into the chosen Family-Game-Night home repository. Launch still needs manual accessibility checks, a dependency security check, hosting setup, restricted family sign-in, and a completed game with real family accounts across devices. Mei Iyer is the approved manager; no specialists are approved. No out-of-office dates are recorded; please confirm any dates that would affect setup or family testing. No decisions file was found in the checked project locations.
> 
> Priority recommendation: Recommend P2: Family Game Night is close enough to release to warrant steady attention, but no urgent deadline or active incident is recorded to justify P1. Reserve time for review and merging, startup retesting, accessibility and dependency security checks, hosting, restricted sign-in, and a complete game with real family accounts across devices before declaring the approved finish line met. No other projects are listed, so there is no identified delay to another project; raising this to P1 would commit more available capacity and review time without a documented urgency.
> 
> **Earlier conversations in Claude cloud?** Answer in your own words and paste their links (claude.ai/code/…). Each costs one short Claude read, which you approve first; then this step is redone with what they say.
> 
> Options offered:
> - Approve interview (Recommended) — Continue onboarding with low management usage.
> - Revise — Keep this stage unchanged and run it again with your note.

**Answer:** Approve interview

## 2026-09-30 · Staff this project? {#onboarding-onboard-c41005d6-5611-4bce-8d01-5e3b248ca6c3-staff-537461666620}

> **Proposed team**
> 
> - **Game quality and release review**: Someone new (new hire), Claude claude-sonnet-5-5 at high effort (mid-size model, about 1× the usage of a mid-size one; can also work in the cloud from GitHub)
> 
> **Notes**
> 
> The approved team includes Mei Iyer as manager, and no specialist seats are approved. Recent work centers on building and configuring Card Lines, the project’s first game. I recommend one specialist seat for independent game quality and release checks, including reviewing the existing work, retesting startup, and checking game behavior before merge. This work can run in the cloud from GitHub. The bench has no unassigned Codex employee, so this seat would need a new hire.
> 
> Options offered:
> - Approve staff (Recommended) — Continue onboarding with low management usage.
> - Revise — Keep this stage unchanged and run it again with your note.

**Answer:** Approve staff

## 2026-09-30 · Approve the onboarding records? {#onboarding-onboard-c41005d6-5611-4bce-8d01-5e3b248ca6c3-write-417070726f76}

> The records go to **https://github.com/michaelwdorrill/Family-Game-Night.git**.
> 
> One commit will preserve every existing file and make only these approved changes:
> 
> - .office/office.json: new
> - .office/charter.md: new
> - .office/release-contract.md: new
> - .office/decisions.md: new
> - .office/parking-lot.md: new
> - .office/changes.md: new
> - AGENTS.md: new
> - CLAUDE.md: new
> 
> **Charter preview**
> \# Family Game Night charter
> 
> \## Finish line
> 
> Release Family Game Night with Card Lines so approved family members can complete two-team and three-team games over multiple days, on phones and computers, without anyone manually repairing saved games. Review and merge the existing work into the chosen home repository, pass release checks, and verify restricted sign-in and a complete game with real family accounts.
> 
> **Release contract preview**
> \# Release contract: Family Game Night
> 
> \## Purpose
> 
> Give family members a private place to enjoy games together whenever their schedules allow, starting with Card Lines and leaving room for other games later.
> 
> \## Must work
> 
> Approved family members can sign in, manage invitations, create equal teams, and play multiple games. Card Lines follows the specified rules, including Jacks, dead-card exchanges, protected sequences, and winning conditions. Hands stay private, illegal moves are rejected, and repeated clicks or outdated tabs cannot corrupt a game. Progress survives refreshes, device changes,
> 
> Existing project-owned Office documents are never replaced.
> 
> Options offered:
> - Approve and write (Recommended) — Write only the approved Office records and push them.
> - Revise — Re-run the interview with your note before rebuilding the records.

**Answer:** Approve and write

## 2026-09-30 · Approve the onboarding records? {#onboarding-onboard-c41005d6-5611-4bce-8d01-5e3b248ca6c3-write-417070726f76-r1}

> The records go to **https://github.com/michaelwdorrill/Family-Game-Night.git**.
> 
> One commit will preserve every existing file and make only these approved changes:
> 
> - .office/office.json: new
> - .office/charter.md: new
> - .office/release-contract.md: new
> - .office/decisions.md: new
> - .office/parking-lot.md: new
> - .office/changes.md: new
> - AGENTS.md: new
> - CLAUDE.md: new
> 
> **Charter preview**
> \# Family Game Night charter
> 
> \## Finish line
> 
> Release Family Game Night with Card Lines so approved family members can complete two-team and three-team games over multiple days, on phones and computers, without anyone manually repairing saved games. Review and merge the existing work into the chosen home repository, pass release checks, and verify restricted sign-in and a complete game with real family accounts.
> 
> **Release contract preview**
> \# Release contract: Family Game Night
> 
> \## Purpose
> 
> Give family members a private place to enjoy games together whenever their schedules allow, starting with Card Lines and leaving room for other games later.
> 
> \## Must work
> 
> Approved family members can sign in, manage invitations, create equal teams, and play multiple games. Card Lines follows the specified rules, including Jacks, dead-card exchanges, protected sequences, and winning conditions. Hands stay private, illegal moves are rejected, and repeated clicks or outdated tabs cannot corrupt a game. Progress survives refreshes, device changes,
> 
> Existing project-owned Office documents are never replaced.
> 
> Options offered:
> - Approve and write (Recommended) — Write only the approved Office records and push them.
> - Revise — Re-run the interview with your note before rebuilding the records.

**Answer:** Approve and write
