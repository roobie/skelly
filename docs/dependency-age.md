---
read_if:
  - the dependency-age check failed on your PR
  - you're changing the dependency-age check or its CI trigger
  - you wonder which dependencies the age rule is enforced on mechanically
---

# Dependency-age check

`AGENTS.md`, "Dependency age" owns the rule. This document says why the check that
enforces it for npm lockfiles is shaped as it is. See `tools/dependency-age.mjs`,
`tooYoungEntries`, and `.github/workflows/dependency-age.yml`.

## What it measures

Only entries a change adds or bumps are checked, because the rule is about the moment a
version is added: an entry that passed when it landed stays acceptable. Comparing against
the merge base keeps changes that landed on `main` meanwhile out of a PR's verdict.

The age is measured at the head commit's committer time, not when CI runs. A re-run then
gives the same verdict for the same commits, and an old PR does not start passing or
failing because time went by. Taking in main makes a new head and so a later reference
time; that matches the rule, since the version is added when the PR merges.

A version with no registry release time fails, because an unproven age is not an old one.

## When it runs

The check runs on pull requests that touch a lockfile or the check itself. It needs the
registry, so it stays out of the default run and the pre-push hook, which must work
offline and fast; its decision logic is unit-tested on fixtures instead. It reads lockfiles
from git and uses only Node built-ins, so CI skips the install and the job takes seconds.

## What it does not cover

GitHub Actions versions, Python packages, Cargo crates and project-work CLIs carry no npm
lockfile entry, so the rule stays a manual check for them.
