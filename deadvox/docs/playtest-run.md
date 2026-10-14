---
read_if:
  - you're preparing, operating or closing the Slice 3 playtest
  - you're publishing a frozen playtest or changing tester feedback or error-report handling
  - you're using playtest results to plan the next slice
---

# Slice 3 playtest

The playtest is self-serve: testers use the landing page to play or practise the controls, and may share feedback or metrics by choice. Practice is unsaved and leaves the saved world alone so newcomers can learn without risking a run. The Round 1 page asks them to survive and find the military camp. See `../EPIC.md`, "Playtest plan", and the [playtest feedback form](../../.github/ISSUE_TEMPLATE/playtest-feedback.md).

## Frozen round publication

The lead publishes a round locally after BR approves the build. One domain per round holds both the landing and game, published together because Surge replaces the whole domain. The landing comes from the current clean checkout; the game always comes from the explicitly chosen frozen game commit, even for a landing-only correction. This prevents a consent-page edit from accidentally shipping newer game code. See `deadvox/tools/publish-playtest.mjs`, `publishPlaytest` and `playtestRound`, for the command and round address. Dry runs assemble the same output without contacting Surge. The temporary detached game checkout reuses installed dependencies only when their lockfiles match; this avoids extra installs without silently changing the frozen build's dependencies.

GitHub Actions never publishes to Surge; Pages continues rolling with main so merged development remains available without changing the testers' build. The landing carries the consent brief and links relatively to the game beneath the same domain, not the rolling Pages build. Browser saves belong to an origin, so changing the game address strands saves: keep its address for the whole round. Moving from Pages does not transfer saves; the old landing page explains this before linking onward.

An approved hotfix is built from the round's published commit with only the intended fix and republishes the same game address. Record the commit printed after successful publication, and send the fix to main through a reviewed PR. Save compatibility requires matching simulation, schema, generators and content identity; the reported build revision is not a compatibility check. See `src/core/saveFormat.ts`, `versionDifferences`. A presentation-only hotfix preserves saves at the same game origin. A simulation, content or generator change invalidates saves regardless of domain; the lead's tester message must warn that the hotfix starts a fresh run. The Pages cutover also starts testers fresh, both because the origin changes and because simulation and content have changed. The menu shows the existing build revision, and error reports include it, so feedback can identify the published build.

Keep the consent description aligned with the frozen game: both use the explicit publication analytics opt-in. Robots exclusions discourage search indexing; they do not make a playtest private.

## Session format

There is no fixed play duration or number of sittings. Continue resumes a living survivor; death ends that run. The localized Round 1 brief is the consent statement and appears before the play link. Give each tester a number for feedback subjects rather than asking for a real name. Public issues are not anonymous; testers without GitHub may email the organizer using an address shared separately, not in project files.

## Errors and feedback

When the blocking error panel appears, stop playing. Copy the complete displayed error and download the local report; nothing is sent automatically. The report may include build, world, browser and recent playtest data. Review it before posting publicly. Use the feedback form, and attach the report if the error is too long to prefill. See `src/ui/errorReport.ts`, `errorReportText`, and `src/game/play.ts`, `stopPlayAfterError`.

The menu can export playtest metrics and a recent replay during play or after death. Sending either is the tester's choice. Review files before posting or emailing them.

## Findings

Use feedback and any shared metrics to assess the playtest questions in EPIC. Record findings in the living design and challenge documents before planning Slice 4a. The authored beats and key items are observation-only; they must not affect simulation. See `src/core/authoredSite.ts`, `AuthoredSite.playtestMarks`, and `src/game/playtestObserver.ts`, `PlaytestObserver`.
