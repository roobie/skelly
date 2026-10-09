---
read_if:
  - you're preparing or running a playtest session
  - you change the playtest consent step, observation notes or where findings go
  - you change what the playtest metrics export records, or the map's beats and key items
---

# Playtest run sheet

This sheet is for the facilitator of the end-of-Slice-3 playtest. What the
playtest asks, and how the tester plays, are in [EPIC.md](../EPIC.md), "Playtest
plan". The map's beats are in [#181](https://github.com/roobie/skelly/issues/181),
with one comment per beat. This sheet covers the sittings around them.

## Session format

Each tester plays the Pages build in their own browser, in as many sittings as
they like, resuming with Continue. There is no fixed length, because players'
pace varies too widely to set one, and the metrics' beat timings show how far
each tester got. As a rough total, the whole map takes about two and a half hours
of play. The facilitator watches the sittings they can.

There is no wristwatch in playtest 1, although #181's beat 2 lists one; it comes
with version 1.

## Before the first sitting

1. Give the tester the next unused tester number from the playtest issues. Name
   the tester only by that number in everything you record.
2. Have the tester open the landing page, <https://roobie.github.io/skelly/>, in the
   browser they will play in.
3. Prepare one observation block per beat (template below).

## Consent

The consent step uses the tester brief beside the landing page's Playtest link
(`site/launcher.js`, `playtestBrief`). Read it from there, not from a copy, so
that a wording change reaches every session.

consent wording: pending BR (cr-r65-1 F1)

1. Ask the tester to read the brief, and answer their questions about it.
2. Ask: "Are you happy to play on those terms?" Start only on a yes, and note the
   yes in your notes.
3. Say: "I won't explain or help while you play. Tell me whenever you want to stop."

## During play

The tester follows the Playtest link. In the first sitting, if the start card
offers to continue an earlier run, they start a new world so the playtest begins
at the first beat; later sittings resume with Continue. Run each sitting as EPIC's
"Playtest plan" says, without coaching. Fill in one block per beat as the tester
reaches it:

```text
Beat (number and name, from its #181 comment):
Reached at (real time since start / game time):
What they did:
Where they stalled or misread something, and for how long:
What they said:
What EPIC's watch list shows in this beat:
```

## After play

1. Ask EPIC's questions ("Playtest plan"), the Slice 3 additions
   ([SLICE-3.md](../SLICE-3.md), "Playtest questions") and EPIC's
   most-annoyed and most-delighted question.
2. Ask whether the tester wants to send their metrics and a recent replay. If they
   do, they save them through the F9 menu's export buttons (`deadvox/index.html`,
   `playtest-metrics-export`). It is their choice, so don't press the buttons for
   them.

## What the metrics export records

Besides its looting, pocket and time-compression figures, the export records when the tester first
reached each beat and when they first looted or read each key item, as game time
and seconds of play (`src/game/playtestTools.ts`, `SessionMetricsV1`). It stays
high level because playtest 1 asks how far testers get and what they find, not how
each action went; a later playtest may add detail. The beats are the `beat` areas
in the playtest map (`maps/playtest.tmj`), and the key items are its fixed loot
marked `key` (`src/content/base/layouts-playtest.json`). Nothing in the game reads
either; they only feed the metrics.

## Where it goes

- **Facilitator notes:** one public playtest issue per tester, from the playtest
  feedback form, titled with the tester number. The findings stay reviewable in
  the open, and the number keeps the tester anonymous.
- **Tester feedback:** the tester sends feedback, and the metrics and replay files
  if they choose to, through the playtest feedback form
  (`.github/ISSUE_TEMPLATE/playtest-feedback.md`).
- **Findings:** after the last session, record the findings where EPIC's "Playtest
  plan" says, before Slice 4 planning
  ([SLICE-3.md](../SLICE-3.md), 3.11, "Done when").
