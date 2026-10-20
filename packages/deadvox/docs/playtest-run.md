---
read_if:
  - you're preparing, operating or closing the Slice 3 playtest
  - you're publishing or patching a playtest round, or changing tester feedback or error-report handling
  - you're using playtest results to plan the next slice
---

# Slice 3 playtest

The playtest is self-serve: testers use the landing page to play or practise the controls, and may share feedback or metrics by choice. Practice is unsaved and leaves the saved world alone so newcomers can learn without risking a run. The Round 1 page asks them to survive and find the military camp. See `../EPIC.md`, "Playtest plan", and the [playtest feedback form](../../.github/ISSUE_TEMPLATE/playtest-feedback.md).

## Frozen round publication

The lead publishes a round locally after BR approves the build. One domain per round holds both the landing and game, published together because Surge replaces the whole domain. The landing comes from the current clean checkout; the game always comes from an explicitly chosen game commit, even for a landing-only correction, so a consent-page edit cannot ship newer game code by accident. See `deadvox/tools/publish-playtest.mjs`, `publishPlaytest` and `playtestRound`. A reused dependency install must match the game commit's lockfiles, so the published build's dependencies never change silently.

No automation publishes to Surge. The build exists so that the testers' game changes only when we decide, not so that it can never take main's fixes; Pages keeps rolling with main so merged work stays playable without touching the testers' build. The landing links relatively to the game beneath the same domain. Browser saves belong to an origin, so keep the game address for the whole round.

A round is updated only by an active choice that BR approves. Such a patch may rebuild the game from a newer main commit and republish it at the same game address. The landing's heading shows the patch number, and each published patch is tagged `playtest-1-patch-N` on its game commit, so feedback and the menu's build revision trace back to it. Save compatibility depends on simulation, schema, generators and content identity, not on the build revision; see `src/core/saveFormat.ts`, `versionDifferences`. A patch that changes any of them starts testers fresh, and the lead's tester message says so. That is acceptable for Round 1 because no tester has survived the playtest map.

The landing offers beginner mode as a separate link after the normal one, so a tester opts in by choice. A beginner world is saved apart from the normal one; see `docs/content.md`, "Bundled mods".

Keep the consent description aligned with the frozen game: both use the explicit publication analytics opt-in. Robots exclusions discourage search indexing; they do not make a playtest private.

## Session format

There is no fixed play duration or number of sittings. Continue resumes a living survivor; death ends that run. The localized Round 1 brief is the consent statement and appears before the play link. Give each tester a number for feedback subjects rather than asking for a real name. Public issues are not anonymous; testers without GitHub may email the organizer using an address shared separately, not in project files.

## Errors and feedback

When the blocking error panel appears, stop playing. Copy the complete displayed error and download the local report; nothing is sent automatically. The report may include build, world, browser and recent playtest data. Review it before posting publicly. Use the feedback form, and attach the report if the error is too long to prefill. See `src/ui/errorReport.ts`, `errorReportText`, and `src/game/play.ts`, `stopPlayAfterError`.

The menu can export playtest metrics and a recent replay during play or after death. Sending either is the tester's choice. Review files before posting or emailing them.

## Findings

Use feedback and any shared metrics to assess the playtest questions in EPIC. Record findings in the living design and challenge documents before planning Slice 4a. The authored beats and key items are observation-only; they must not affect simulation. See `src/core/authoredSite.ts`, `AuthoredSite.playtestMarks`, and `src/game/playtestObserver.ts`, `PlaytestObserver`.
