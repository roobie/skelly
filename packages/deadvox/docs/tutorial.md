---
read_if:
  - you change tutorial entry, objectives, practice content or save isolation
---

# Disposable practice

Practice is a separate authored place, not a guided replacement world. Guaranteed supplies and a compact route let a newcomer learn ordinary interactions without depending on random scavenging. Use `src/content/base/tutorial.jsonnet` and `src/core/authoredSite.ts`, `AuthoredSite`.

The essentials route stays short so entry remains cheap. Combat and ammunition practice, injury recovery, and light and power belong in optional modules: growth must not lengthen everyone's first session.

The combat module is chosen from the main menu after the essentials, so it never delays them, and it covers both guns because the revolver's loose-round cylinder and the pump's tube and manual action are different skills that one gun cannot teach. It teaches equipping, readying, loading, firing, pumping and reading ammunition, and ends on a shambler downed by a firearm shot rather than on any particular gun. The guns and rounds wait in the supply cabinet's own pocket, so the essentials route's supplies are unchanged. The layout's `practice` content names the two guns and a fallback target, so no item id is a code selector. Shots and downings before the module starts count for nothing, so a gun picked up early pre-satisfies no step. A downing is credited to a firearm only when a shot since the module started preceded it, because the zombie system does not report a killing weapon; a melee kill after an earlier unrelated shot can therefore still count. A downed shambler stays in the zombie store, so only one that is not incapacitated counts as left to shoot. When the shooting step is reached with none left, the game places the content's target rather than leaving the step stuck. Reading ammunition counts only as opening the inventory afresh once that step is current, because loading from the cabinet keeps a screen open. See `src/game/tutorial.ts`, `Tutorial`, and `src/content/base/tutorial.jsonnet`.

Action labels show live bindings because outcome nouns alone leave newcomers without the means to act. Fixed pointer actions use their catalogue labels rather than implying rebinding support. Help opens the shared controls card on the relevant topic, keeping one binding catalogue that follows rebinding instead of a second manual that can drift. See `src/ui/tutorial.ts`, `mountTutorial`, and `src/game/controls.ts`, `mountControlsCard`.

Short contextual objectives observe completed outcomes rather than pressed buttons. Preparing a held pair, opening it and eating from it are distinct lessons: possession or consumption alone cannot prove a successful opening. The opening owner supplies completion so refused and cancelled attempts cannot earn it. Early opening still counts, including preparation credit, so lesson order cannot strand someone who already opened and ate their supplies. The observer cannot execute actions; see `src/game/tutorial.ts`, `Tutorial`, `src/game/unpacking.ts`, `Unpacking.complete`, and `src/ui/tutorial.ts`, `mountTutorial`.

Avoidance teaches that fighting is optional. The threat has ordinary senses and damage, and the route offers separation and cover instead of immunity, scripted injury or a required kill. A bandage supports recovery without making injury a graduation requirement. Restart and exit remain available in the pause menu because practice supplies can be lost or exhausted.

Practice must never touch the player's save. Its startup branch does not construct a save controller; play also rejects a practice session bound to persistence or restoration. This avoids periodic checkpoints, sleep saves, lifecycle writes and death markers sharing a normal world identity. See `src/game/tutorial.ts`, `tutorialRequested`, and `src/game/play.ts`, `startPlay`.

Death and voluntary exit return to the start choice rather than silently creating a world or transferring equipment. Finishing the essentials does not exit by itself, because the same menu offers the optional modules. Returning by navigation discards the entire practice runtime and its listeners. Storage-backend selection survives navigation so Continue discovers the same normal save rather than a different storage area; presentation settings also survive; world and debug selections do not follow practice. See `src/game/tutorial.ts`, `tutorialUrl`.

The launcher offers practice only as a play destination, so a benchmark cannot carry an unsaved teaching place. See `site/launcher.js`, `setPlayOnlySite`.

Five minutes is a nominal teaching target, not a timer or test assertion. Slower reading is allowed. Teachability, threat intensity and readability require a newcomer playtest; automated proofs establish outcome observation, an injury-free route and save isolation, not whether the lesson feels clear.
