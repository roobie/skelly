---
read_if:
  - you change how practice is entered or left, its objectives, practice content or save isolation
---

# Disposable practice

Practice is a separate authored place, not a guided replacement world. Guaranteed
supplies and a compact route let a newcomer learn ordinary interactions without
depending on random scavenging. See `mods/skelly.deadvox.scenario.tutorial/tutorial.jsonnet` and
`packages/engine/src/core/authoredSite.ts`, `AuthoredSite`.

Keep the essentials short so entry remains cheap. Optional modules must not lengthen
everyone's first session or make declining further practice a failure. Linear weapons
practice avoids making module navigation another lesson. Empty weapons and packaged
ammunition make acquiring and carrying supplies part of learning rather than granting
a working gun. Case picking is not partial loading because the lesson requires
insertion followed by usable closure below capacity. Ready and sighted discharges
establish that sights are not a firing prerequisite. See
`mods/skelly.deadvox.scenario.tutorial/guidance.libsonnet`, `gunStep`.

Static targets provide an aiming reference without requiring injury, a kill or target
scoring. Completion should demonstrate handling rather than accuracy. Empty-hand
practice likewise must not require another living target. Finite supplies retain
ordinary scarcity; replacing the whole attempt avoids hidden restocking and a second
reset owner. See `mods/skelly.deadvox.scenario.tutorial/tutorial.jsonnet`, `tutorial_range`,
and `mods/skelly.deadvox.scenario.tutorial/guidance.libsonnet`, `gunStep`.

A newcomer whose light dies may not know that batteries can be swapped. Optional
light practice makes discovering that action cheap without delaying the essentials.
Outcomes before choosing the module must not silently complete the lesson the player
has yet to see. See `mods/skelly.deadvox.scenario.tutorial/guidance.libsonnet`, `gunStep`, and
`packages/presentation/src/presentation/guidedSteps.ts`, `GuidedSteps`.

Action labels need live bindings because outcome nouns alone leave newcomers without
the means to act. Help uses the shared controls card rather than a second manual that
can drift. See `packages/presentation/src/ui/guidedSteps.ts`, `mountGuidance`, and
`packages/presentation/src/presentation/controls.ts`, `mountControlsCard`.

Completed outcomes, not requests or pressed buttons, are the teaching evidence.
Remembering early outcomes prevents lesson order from stranding someone who already
used their supplies. Observation must not become another execution owner; the
framework boundary is in `docs/decisions/0009-content-defined-products.md`,
"Starts and mixing". See `packages/engine/src/game/unpacking.ts`, `Unpacking.complete`,
`packages/engine/src/game/firearmHandling.ts`, `FirearmMechanics`, and
`packages/engine/src/core/playerCombat.ts`, `PlayerCombat`.

Avoidance teaches that fighting is optional. Naming a destination makes leaving the
threat legible without changing ordinary senses or damage. Injury must not become a
graduation requirement, and lost supplies must not trap the learner. See
`mods/skelly.deadvox.scenario.tutorial/guidance-text.libsonnet`, `exitPath`, and
`mods/skelly.deadvox.scenario.tutorial/tutorial.jsonnet`, `tutorial_range`.

Practice must never touch the player's save: disposable learning must not share a
normal world's persistence identity. The game knows a practice run from its start row, so
every link that starts the tutorial gets the same isolation. See
`packages/engine/src/game/startSelection.ts`, `isPracticeStart`, and
`packages/presentation/src/presentation/play.ts`, `startPlay`.

Practice is a page, not a mode inside a run. Its own link names the practice pack and
never carries `start-mod`, and the player leaves it with the browser, by Back or by
closing the tab. One link names one start, so start order needs no practice exception,
and the browser already owns leaving a page. A page whose link carries `start-mod`
names its own start, so it does not offer practice. See
`packages/presentation/src/presentation/tutorialUrl.ts`, `tutorialUrl`.

Death and completion stay on the practice page, whose one end control restarts
practice; nothing creates a world or transfers equipment. Finishing the essentials
must not end practice while optional modules are still available. See
`packages/presentation/src/presentation/play.ts`, `restartPractice`.

The launcher offers practice only as a play destination, so a benchmark cannot carry
an unsaved teaching place. Its URL contract stays independent of simulation and
workspace packages because launcher checks run without a game installation. See
`site/launcher.js`, `siteOffered`.

Five minutes is a nominal teaching target, not a timer or test assertion. Slower
reading is allowed. Teachability, threat intensity and readability require a newcomer
playtest; automated proofs cannot establish whether the lesson feels clear.
