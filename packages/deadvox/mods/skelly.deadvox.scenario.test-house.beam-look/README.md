---
read_if:
  - you're reviewing two-ended axis beams and the steel hall clear-span limit by eye
  - you're repeating the prepared beam collapse check or investigating its automatic trigger
---

# Beam limit look

Open `/?start-mod=skelly.deadvox.scenario.test-house.beam-look#{debug:true}`.
The start supplies maximum skills and places the player outside both bays, facing them.

1. Look up at the bays south of the test house. The left bay uses the hall's steel
   clear span; the right bay is one cell wider. There are no interior columns.
2. The left bay's steel members and deck stay overhead. The right bay's members and
   central deck fall as play starts. The end walls and deck ledges near them may remain;
   they have their own standing support. Stay outside the falling area.
3. Walk beside the intact bay to see the parallel members under the deck. Cut a member
   with debug destruction to check the ordinary cut cascade. Reload the same start to
   repeat the initial comparison.

The start queues the ordinary support owner below the oversized run without removing
a bearing. This makes its pre-existing lack of support visible without asking the
reviewer to set up a cut or wait for a burn. See `starts.jsonnet`.

The dimensions are curated in `layouts.jsonnet`; the material limits and cited grade
assumptions live in `packages/mods/skelly.natural-world/beam-calibration.libsonnet`.
The bays must follow those real-member limits, never tune a limit to rescue a fixture.
