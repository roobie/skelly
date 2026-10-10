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
provided with the link. The Playtest card gives the task, find the military camp,
and its link opens the authored map; see [EPIC.md](../EPIC.md),
"Playtest plan", and [#181](https://github.com/roobie/skelly/issues/181).

## Deployment freeze

Set the Pages deployment freeze when sharing the Playtest link and clear it when the
playtest window closes. Keep the deployed game unchanged while testers play: their
saves are tied to that deployed code. Set and clear the repository variable with:

```sh
gh variable set PAGES_FREEZE --body true
gh variable delete PAGES_FREEZE
```

The `build` and `deploy` jobs in `.github/workflows/pages.yml` skip automatic Pages
publishing during the freeze. `workflow_dispatch` remains available for an approved
fix during the playtest. Clearing the variable does not replay skipped pushes; after
the window closes, manually dispatch the Pages workflow from `main` to publish code
merged during the freeze.

## Session format

There is no fixed play time or number of sittings. Testers may stop whenever
they like and use Continue to resume later. Each person plays in their own
browser from the Pages landing page, using its Playtest link.

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

The localized Playtest card is the testers' consent; there is no separate
consent step. Its wording is authored in both languages in
`site/playtest.jsonnet`, and `site/launcher.js`, `playtestBrief`, lays it out.
Testers read the card before following the Playtest link.

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
