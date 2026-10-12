---
read_if:
  - you're preparing, operating or closing the Slice 3 playtest
  - you're changing deployment freeze, tester feedback or error-report handling
  - you're using playtest results to plan the next slice
---

# Slice 3 playtest

The playtest is self-serve: testers use the landing page and play link, and may share feedback or metrics by choice. The Round 1 page asks them to survive and find the military camp. See [EPIC.md](../EPIC.md), “Playtest plan”, and the [playtest feedback form](../../.github/ISSUE_TEMPLATE/playtest-feedback.md).

## Deployment freeze

Freeze Pages only after in-flight changes have merged, BR has played the deployed build without a blocker, and BR gives the go-ahead. Then share the Round 1 landing page and keep the deployed build unchanged while testers play; saves are tied to that code. Clear the freeze when the window closes.

Set and clear the repository variable with `gh variable set PAGES_FREEZE --body true` and `gh variable delete PAGES_FREEZE`. After setting it, wait until no Pages run is queued or in progress. Use the SHA from the latest successful run only after confirming its deploy job succeeded; do not use the current main head as a substitute.

Tag the deployed commit `playtest-1-deployed`. A hotfix BR approves during the freeze branches from that tag and contains only the fix. Dispatch Pages from the hotfix branch and move the tag only after deployment succeeds; send the same fix to main through a normal PR. A dispatch from main publishes every merge since the freeze began, so approving it means approving all of those changes. Clearing the variable does not replay skipped pushes; dispatch main after the window closes.

## Testers and consent

There is no fixed play duration or number of sittings. Continue resumes a living survivor; death ends that run. The localized Round 1 brief is the consent statement and appears before the play link. Give each tester a number for feedback subjects rather than asking for a real name. Public issues are not anonymous; testers without GitHub may email the organizer using an address shared separately, not in project files.

## Errors and feedback

When the blocking error panel appears, stop playing. Copy the complete displayed error and download the local report; nothing is sent automatically. The report may include build, world, browser and recent playtest data. Review it before posting publicly. Use the feedback form, and attach the report if the error is too long to prefill. See `src/ui/errorReport.ts`, `errorReportText`, and `src/game/play.ts`, `stopPlayAfterError`.

The menu can export playtest metrics and a recent replay during play or after death. Sending either is the tester's choice. Review files before posting or emailing them.

## Findings

Use feedback and any shared metrics to assess the playtest questions in EPIC. Record findings in the living design and challenge documents before planning Slice 4. The authored beats and key items are observation-only; they must not affect simulation. See `src/core/authoredSite.ts`, `AuthoredSite.playtestMarks`, and `src/game/playtestObserver.ts`, `PlaytestObserver`.
