---
read_if:
  - you start a feature branch, push, take in main, or clean up after a merge
  - you wonder why skelly never rebases or force-pushes a published branch
---

# Git workflow

Skelly uses plain git with one topic branch per feature, merged into `main` through a
reviewed PR. The steps from dispatch to merge, and who may merge, are in `PROCESS.md`.

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
3. `git push -u origin <branch>`, and open a draft PR titled with the feature's ID
   ("Work item IDs" in `AGENTS.md`). CI then checks every later push, so no agent has to
   repeat the full matrix locally.

## While working

- **Commit in coherent chunks** whose messages say what changed and why, so a review or a
  bisect can follow one change at a time and the commit keeps the reason behind it.
- **Push as you go.** Pushed work is visible to the team and checked by CI, and branching
  from `origin/main` keeps one feature from blocking another.
- **Take in main by merging:** `git fetch origin && git merge origin/main`. Never rebase
  or force-push a published branch. Reviews, CI runs and BR's looks are tied to exact head
  SHAs, and rewriting history would invalidate them and lose what others built on.
- **Don't bypass the pre-push hook** with `--no-verify` to get past a real failure. The
  hook runs the same root checks as CI, so a bypass only moves the failure to CI.

## Merge and clean up

- **PRs merge with a merge commit,** so each feature's commits and their review trail stay
  intact in history.
- **After the merge:** remove the worktree (`git worktree remove`), stop any dev server
  it ran, and delete the branch locally and on the remote. A merged branch's worktree and
  server keep holding disk and a port, and a leftover branch or worktree reads as live work
  to the next agent.
