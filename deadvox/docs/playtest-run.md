---
read_if:
  - you're preparing or joining the self-serve Slice 3 playtest
  - you're starting, ending, or operating the playtest's Pages deployment freeze
  - you're changing the playtest feedback process or tester metrics export
  - you're using playtest feedback to update the game plan
---

# Playtest organiser's sheet

The Slice 3 playtest is self-serve. The organiser shares the landing-page link
with a few people; each tester plays on their own until they want to stop. The
organiser may invite them to share feedback and any metrics through the playtest
feedback form. Testers without GitHub can email the organiser using the address
provided with the link. The Round 1 page asks testers to survive and find the
military camp, and its play link opens the authored map; see [EPIC.md](../EPIC.md),
"Playtest plan", and [#181](https://github.com/roobie/skelly/issues/181).

## Deployment freeze

Set the Pages deployment freeze when sharing the Round 1 landing page
(`site/deadvox/playtest/round1/`) and clear it when the playtest window closes.
Testers enter the authored map through that page's play link. Keep the deployed
game unchanged while testers play: their saves are tied to that deployed code.
Set and clear the repository variable with:

```sh
gh variable set PAGES_FREEZE --body true
gh variable delete PAGES_FREEZE
```

The `build` and `deploy` jobs in `.github/workflows/pages.yml` skip automatic Pages
publishing during the freeze, while manual dispatches remain available. After setting
the freeze, wait until no Pages run is queued or in progress. Use the head SHA from
the latest successful run only after confirming its `deploy` job succeeded; do not
use the current `main` head:

```sh
gh run list --workflow pages.yml --status success --limit 1 --json databaseId,headSha --jq '.[0]'
gh run view <run id> --json jobs --jq '.jobs[] | select(.name == "deploy") | .conclusion'
```

Tag that deployed commit `playtest-1-deployed` to give a hotfix a fixed base. For a
fix BR approves during the freeze, branch `pages-hotfix/<name>` from that tag and
commit only the fix.
Dispatch the Pages workflow from that branch:

```sh
gh workflow run pages.yml --ref pages-hotfix/<name>
```

The `github-pages` environment must allow `pages-hotfix/*` as a deployment branch in
addition to `main`; without that policy the hotfix run cannot deploy. With custom
branch policies enabled, add the rule with:

```sh
gh api --method POST repos/{owner}/{repo}/environments/github-pages/deployment-branch-policies -f name='pages-hotfix/*' -f type=branch
```

After the hotfix run's deployment succeeds, move `playtest-1-deployed` to the
hotfix branch head. Send the same fix to `main` through a normal PR. A dispatch
from `main` publishes all of `main`, not only the approved fix; during the freeze,
approving a dispatch means approving every merge since freeze start for save
compatibility. Clearing the variable does not replay skipped pushes; after the
playtest window closes, manually dispatch from
`main` to publish code merged during the freeze.

## Session format

There is no fixed play time or number of sittings. Testers may stop whenever
they like and use Continue to resume later. Each person plays in their own
browser from the Round 1 landing page, using its play link.

There is no wristwatch in playtest 1, although #181's beat 2 lists one; it comes
with version 1.

## Tester number

The organiser gives each tester a number with the link and asks them to put it
in the title of any public feedback issue or the subject of an email. This keeps
feedback consistent without using the tester's real name. A public GitHub issue
is not anonymous and requires an account. Testers without GitHub may email their
metrics and feedback to the organiser; provide the address separately with the
link, not in project files.

## Consent

The localized Round 1 brief is the testers' consent; there is no separate
consent step because it gives the task and terms before play. Its wording is
authored in both languages in `site/playtest.jsonnet`, and
`site/deadvox/playtest/round1/round1.js`, `text`, renders it before the play link.

## Saving and sending metrics

The F9 menu can save playtest metrics and a replay of recent play as files. A
tester with GitHub may attach either or both to feedback through the [playtest
feedback form](../../.github/ISSUE_TEMPLATE/playtest-feedback.md); sending them
is their choice. Testers without GitHub can email metrics and feedback to the
organiser using the address provided with the link. Review files before posting
them in a public issue or sending them by email.

## What the metrics export records

The export keeps the existing detailed per-container loot timings, including
handling and UI seconds (`containersLooted`), and per-pocket use counts
(`pocketUses`), alongside its other aggregated play-time, death, compression and
interruption figures (`src/game/playtestTools.ts`, `SessionMetricsV1`). The map
adds only high-level records for the first time each beat is reached and each
key item is looted or read. A read counts for any copy of a key item, wherever
the tester found it; a loot counts only when the item leaves its own anchored
furniture. Playtest 1 adds no further detailed metric collection.

The beats are `beat` areas in the playtest map (`maps/playtest.tmj`), and the
key items are its fixed loot marked `key`
(`src/content/base/layouts-playtest.json`). `AuthoredSite`
(`src/core/authoredSite.ts`) and `PlaytestObserver`
(`src/game/playtestObserver.ts`) read these marks only to feed the export.
Nothing in the simulation reads either.

## Findings

Use testers' feedback issues or emails, and any metrics they choose to share, to
assess the playtest questions in [EPIC.md](../EPIC.md), "Playtest plan". Record
the resulting findings in EPIC, DESIGN and CHALLENGES before planning Slice 4
([SLICE-3.md](../SLICE-3.md), 3.11, "Done when").
