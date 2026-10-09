---
read_if:
  - you're preparing or running a playtest session
  - you change the playtest consent step, observation notes or where findings go
---

# Playtest run sheet

This sheet is for the facilitator of one session of the end-of-Slice-3 playtest.
What the playtest asks, and how the tester plays, are in [EPIC.md](../EPIC.md),
"Playtest plan". The map's beats are in [#181](https://github.com/roobie/skelly/issues/181),
with one comment per beat. This sheet covers the session around them.

## Session format

session length: pending BR (r64 G4)

Each session has one tester. They play the Pages build in their own browser while
the facilitator watches.

## Before the session

1. Give the tester the next unused tester number from the playtest issues. Use the
   number, never the tester's name, in everything you record.
2. Have the tester open the landing page, <https://roobie.github.io/skelly/>, in the
   browser they will play in.
3. Prepare one observation block per beat (template below).

## Consent

The tester brief beside the landing page's Playtest link is the consent text
(`site/launcher.js`, `playtestBrief`). Read it from there, not from a copy, so
that a wording change reaches every session.

1. Ask the tester to read the brief, and answer their questions about it.
2. Ask: "Are you happy to play on those terms?" Start only on a yes, and note the
   yes with the tester number.
3. Say: "I won't explain or help while you play. Tell me whenever you want to stop."

## During play

The tester follows the Playtest link. If the start card offers to continue an
earlier run, they start a new world so the session begins at the first beat. Run
the session as EPIC's "Playtest plan" says, without coaching. Fill in one block per
beat as the tester reaches it:

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
   do, they save them through the F9 menu's export buttons (#512). It is their
   choice, so don't press the buttons for them.

## Where it goes

- **Session issue:** one issue per session, from the playtest feedback form
  (`.github/ISSUE_TEMPLATE/playtest-feedback.md`), titled with the tester number.
  It holds the facilitator's notes and the tester's answers, with the metrics and
  replay files attached when the tester chose to send them. Issues are public, so
  nothing in them names the tester.
- **Findings:** after the last session, record the findings where EPIC's "Playtest
  plan" says, before Slice 4 planning
  ([SLICE-3.md](../SLICE-3.md), 3.11, "Done when").
