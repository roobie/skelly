---
read_if:
  - the dependency-age check failed on your PR
  - you're changing the dependency-age check or its CI trigger
  - you wonder which dependencies the age rule is enforced on mechanically
  - you're adding or bumping a GitHub Action or a pinned Python requirement
---

# Dependency-age check

`AGENTS.md`, "Dependency age" owns the rule. This document says why the check that
enforces it is shaped as it is. See `tools/dependency-age/check.mjs`, `tooYoungEntries`,
and `.github/workflows/dependency-age.yml`.

## What it measures

Only entries a change adds or bumps are checked, because the rule is about the moment a
version is added: an entry that passed when it landed stays acceptable, wherever else it is
used later. Comparing against the merge base keeps changes that landed on `main` meanwhile
out of a PR's verdict.

The age is measured at the head commit's committer time, not when CI runs. A re-run then
gives the same verdict for the same commits, and an old PR does not start passing or
failing because time went by. Taking in main makes a new head and so a later reference
time; that matches the rule, since the version is added when the PR merges.

A version with no release time fails, because an unproven age is not an old one.

## GitHub Actions

An action ref's release time is the first published, non-prerelease GitHub release it
names; see `tools/dependency-age/actions.mjs`, `refReleasedAt`. A tag can move, so its
current commit is no stable answer: judging it would fail an old line whenever upstream
ships a patch, and would change the verdict of a re-run. What a moving major tag such as
`v4` adopts is a release line, so it counts from the line's first release. Patches that
reach the line later run without a check anyway, so an exact tag or a commit SHA is the way
to have one exact version judged. A SHA counts from the first release of a tag pointing at
it, since a bare commit is not a release. A branch names no release and fails.

Local actions are code in this repository, reviewed in the PR that changes them, so they
carry no release to date. Docker refs name images, which GitHub releases cannot date, so
the check leaves them out rather than guess, and adding one is a review matter.

## Python requirements

A pinned requirement counts from the first upload of any of its files to PyPI, the moment
the version became installable. A Python tool CI installs takes its whole dependency tree
from a hash-pinned requirements file, so every version that can enter a run is named
exactly and checked when it is added; see `tools/reuse/requirements.txt`. A requirement
without an exact pin names no version to date, and hash pinning refuses it anyway.

## When it runs

The check runs on pull requests that touch a lockfile, a requirements file, a workflow or
the check itself. It needs the registries, so it stays out of the default run and the
pre-push hook, which must work offline and fast; its decision logic is unit-tested on
fixtures instead. It reads manifests from git and uses only Node built-ins, so CI skips the
install and the job takes seconds.

## What it does not cover

Cargo crates enter only through the pinned Rapier f64 build, which is upgraded only on
maintainer demand and judged against the rule at that moment; see
`packages/deadvox/docs/decisions/0009-rapier-f64-build.md`, "Decision". A mechanical gate
would guard a file that changes only under that review. Project-work CLIs carry no
manifest to read, so the rule stays a manual check for them.
