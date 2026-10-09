---
read_if:
  - you're preparing or joining the self-serve Slice 3 playtest
  - you're changing the playtest feedback process or tester metrics export
  - you're using playtest feedback to update the game plan
---

# Playtest organiser's sheet

The Slice 3 playtest is self-serve. The organiser shares the landing-page link
with a few people; each tester plays on their own until they want to stop. The
organiser may invite them to share their metrics through the playtest feedback
form. The game starts the
authored map with the prompt to find the military camp; see [EPIC.md](../EPIC.md),
"Playtest plan", and [#181](https://github.com/roobie/skelly/issues/181).

## Session format

There is no fixed play time or number of sittings. Testers may stop whenever
they like and use Continue to resume later. Each person plays in their own
browser from the Pages landing page, using its Playtest link.

There is no wristwatch in playtest 1, although #181's beat 2 lists one; it comes
with version 1.

## Tester number

If a tester number is provided with the link, use it in the public feedback
issue's title instead of adding the tester's real name. The number helps refer
to feedback consistently; a public GitHub issue is not anonymous, and posting
feedback requires a GitHub account.

## Consent wording

The tester brief beside the landing page's Playtest link (`site/launcher.js`,
`playtestBrief`) explains the playtest, local metrics and optional exports.

consent wording: pending BR (cr-r65-1 F1)

## Saving and sending metrics

The F9 menu can save playtest metrics and a replay of recent play as files. The
tester may attach either or both to feedback through the [playtest feedback
form](../../.github/ISSUE_TEMPLATE/playtest-feedback.md); sending them is their
choice. Review the files before attaching them to a public issue.

## What the metrics export records

Besides its looting, pocket and time-compression figures, the export records when
the tester first reached each beat and when they first looted or read each key
item, as game time and seconds of play (`src/game/playtestTools.ts`,
`SessionMetricsV1`). It stays high level because playtest 1 asks how far testers
get and what they find, not how each action went; a later playtest may add
detail. The beats are the `beat` areas in the playtest map (`maps/playtest.tmj`),
and the key items are its fixed loot marked `key`
(`src/content/base/layouts-playtest.json`). Nothing in the game reads either;
they only feed the metrics.

## Findings

Use the testers' feedback issues and any metrics they choose to share to assess
the playtest questions in [EPIC.md](../EPIC.md), "Playtest plan". Record the
resulting findings in EPIC, DESIGN and CHALLENGES before planning Slice 4
([SLICE-3.md](../SLICE-3.md), 3.11, "Done when").
