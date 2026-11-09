---
read_if:
  - you start a feature branch, push, take in main, or clean up after a merge
  - you wonder why skelly never rebases or force-pushes a published branch
  - you check the framework refactor gate before opening a draft PR
  - you bump the shared asset release pin and submodule
---

# Git workflow

Skelly uses plain git with one topic branch per feature, merged into `main` through a
reviewed PR. The steps from spec to merge, and who may merge, are in `PROCESS.md`.

Skelly is a public repository, so anyone who clones it, and CI, must be able to follow its
workflow with stock git and GitHub alone. The workflow is therefore written out here in
full and depends on no private tooling. Many agents work in parallel: separate branches
and worktrees keep them from blocking each other, and review and CI on every push catch
defects before they reach `main`.

## Start a feature

1. `git fetch origin`, then `git worktree add .claude/worktrees/<name> -b <branch> origin/main`.
   Worktrees live inside the repo (the directory is in `.gitignore`), so every agent's
   checkouts sit in one known place.
2. Run the installs under "Installing check dependencies" in `AGENTS.md` before the first
   push. The pre-push hook runs checks across every subproject, and a fresh worktree has
   no `node_modules`, so without them even the push that publishes the branch fails.
3. `git push -u origin <branch>`, and open a draft PR only when permitted by
   `docs/decisions/0009-content-defined-products.md`, "Refactor gate". CI then checks
   every later push, so no agent has to repeat the full matrix locally.

## While working

- **Commit in coherent chunks** whose messages say what changed and why, so a review or a
  bisect can follow one change at a time and the commit keeps the reason behind it.
- **Push as you go.** Pushed work is visible to the team and checked by CI, and branching
  from `origin/main` keeps one feature from blocking another.
- **Take in main by merging:** `git fetch origin && git merge origin/main`. Never rebase
  or force-push a published branch. Reviews, CI runs and BR's looks are tied to exact head
  SHAs, and rewriting history would invalidate them and lose what others built on.
- **Don't bypass the pre-push hook** with `--no-verify` to get past a real failure. The
  hook runs CI's shared root checks, while CI also checks generated content. A bypass only
  moves a shared-check failure to CI; content drift is caught there to keep the hook fast.

## Shared asset pin bumps

Skelly always uses the latest published skelly-assets release. One linear release
line exposes consumer gaps at each pin bump instead of accumulating them. Keep the
release pin and `packages/skelly-assets` gitlink together in one commit with the
content changes the release needs: source and released bytes must come from the
same revision. See `tools/skelly-assets/setup.mjs`, `pinRelease` and
`assertGitlinkMatchesRelease`.

Run Deadvox's `validate`, root `content:check` and Deadvox's `digest:simulation` at the
base and proposed head, and report both digest values. Selected assets and pack
declarations must agree without an unexplained simulation change; report any digest
difference to the lead before merging.

Declare released files without requiring the game to consume every model row:
skelly-assets will always contain models that skelly is not actively using.
Catalogue growth must not break content compilation. Admit only rows named by
content consumers, before assigning presentation; retain missing named references
as validation errors. See `tools/jsonnet/lib/used-models.libsonnet`, `references`,
and `packages/deadvox/src/core/content.ts`, `referenceIssues`. Content imports its
consumer documents rather than maintaining a second list of model IDs.

Pack file declarations remain independent of model consumption so installed files
are owned even when unused. See
`docs/decisions/0010-asset-pipelines-in-skelly-assets.md`, "Staged admission".
Consumed rows must still match the pinned exports; see `test/model-export-sync.mjs`,
`readCutOver` and `assertCutOver`. The asset owns its emissive material selection,
so the glow tag and material names change together in one released model row,
not in a consumer mapping. See
`packages/mods/skelly.light-sources/models-light-sources.jsonnet`.

Asset-move PRs target `framework/refactor` and take it in by merging
`origin/framework/refactor`, not `main`, so the extraction stays on its reviewed base.

## Merge and clean up

- **PRs merge with a merge commit,** so each feature's commits and their review trail stay
  intact in history.
- **After the merge:** remove the worktree (`git worktree remove`), stop any dev server
  it ran, and delete the branch locally and on the remote. A merged branch's worktree and
  server keep holding disk and a port, and a leftover branch or worktree reads as live work
  to the next agent.
