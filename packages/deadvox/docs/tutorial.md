---
read_if:
  - you change tutorial entry, objectives, practice content or save isolation
---

# Disposable practice

Practice is a separate authored place, not a guided replacement world. Guaranteed
supplies and a compact route let a newcomer learn ordinary interactions without
depending on random scavenging. See `mods/skelly.deadvox.scenario.tutorial/tutorial.jsonnet` and
`src/core/authoredSite.ts`, `AuthoredSite`.

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
`src/game/guidedSteps.ts`, `GuidedSteps`.

Action labels need live bindings because outcome nouns alone leave newcomers without
the means to act. Help uses the shared controls card rather than a second manual that
can drift. See `src/ui/guidedSteps.ts`, `mountGuidance`, and
`src/game/controls.ts`, `mountControlsCard`.

Completed outcomes, not requests or pressed buttons, are the teaching evidence.
Remembering early outcomes prevents lesson order from stranding someone who already
used their supplies. Observation must not become another execution owner; the
framework boundary is in `docs/decisions/0009-content-defined-products.md`,
"Starts and mixing". See `src/game/unpacking.ts`, `Unpacking.complete`,
`src/game/firearmHandling.ts`, `FirearmMechanics`, and
`src/core/playerCombat.ts`, `PlayerCombat`.

Avoidance teaches that fighting is optional. Naming a destination makes leaving the
threat legible without changing ordinary senses or damage. Injury must not become a
graduation requirement, and lost supplies must not trap the learner. See
`mods/skelly.deadvox.scenario.tutorial/guidance-text.libsonnet`, `exitPath`, and
`mods/skelly.deadvox.scenario.tutorial/tutorial.jsonnet`, `tutorial_range`.

Practice must never touch the player's save: disposable learning must not share a
normal world's persistence identity. See `src/game/tutorialUrl.ts`,
`tutorialRequested`, and `src/game/play.ts`, `startPlay`.

Completion, death and voluntary exit return to the start choice rather than silently
creating a world or transferring equipment. Finishing the essentials must not force
an exit while optional modules are still available. Returning by navigation gives
one owner the disposal of the practice runtime. Retain storage selection so Continue
finds the same normal save, without carrying practice's world or debug choices into
it. See `src/game/tutorialUrl.ts`, `tutorialUrl`.

The launcher offers practice only as a play destination, so a benchmark cannot carry
an unsaved teaching place. Its URL contract stays independent of simulation and
workspace packages because launcher checks run without a game installation. See
`site/launcher.js`, `setPlayOnlySite`, and `src/game/tutorialUrl.ts`,
`tutorialRequested`.

Five minutes is a nominal teaching target, not a timer or test assertion. Slower
reading is allowed. Teachability, threat intensity and readability require a newcomer
playtest; automated proofs cannot establish whether the lesson feels clear.
