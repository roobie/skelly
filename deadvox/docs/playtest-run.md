---
read_if:
  - you're preparing or joining the self-serve Slice 3 playtest
  - you're changing the playtest feedback process or tester metrics export
  - you're using playtest feedback to update the game plan
---

# Playtest organiser's sheet

The Slice 3 playtest is self-serve. The organiser shares the landing-page link
with a few people; each tester plays on their own until they want to stop. The
organiser may invite them to share feedback and any metrics through the playtest
feedback form. Testers without GitHub can email the organiser using the address
provided with the link. The game starts the authored map with the prompt to find
the military camp; see [EPIC.md](../EPIC.md),
"Playtest plan", and [#181](https://github.com/roobie/skelly/issues/181).

## Session format

There is no fixed play time or number of sittings. Testers may stop whenever
they like and use Continue to resume later. Each person plays in their own
browser from the Pages landing page, using its Playtest link.

There is no wristwatch in playtest 1, although #181's beat 2 lists one; it comes
with version 1.

## Tester number

If a tester number is provided with the link, use it in the public feedback
issue's title or the subject of an email instead of adding the tester's real
name. The number helps refer to feedback consistently; a public GitHub issue is
not anonymous and requires an account. A tester without GitHub can email their
metrics and feedback to the organiser; provide the email address separately with
the link, not in project files.

## Consent

The tester brief at the top of the landing page is the testers' consent. They
read it before following the Playtest link; there is no separate consent step.
The brief's wording lives only in `site/launcher.js`, `playtestBrief`.

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
furniture. Playtest 1 adds no further detailed metric collection. The beats are the `beat` areas in the playtest map
(`maps/playtest.tmj`), and the key items are its fixed loot marked `key`
(`src/content/base/layouts-playtest.json`). Nothing in the simulation reads
either; they only feed the metrics.

## Findings

Use testers' feedback issues or emails, and any metrics they choose to share, to
assess the playtest questions in [EPIC.md](../EPIC.md), "Playtest plan". Record
the resulting findings in EPIC, DESIGN and CHALLENGES before planning Slice 4
([SLICE-3.md](../SLICE-3.md), 3.11, "Done when").
