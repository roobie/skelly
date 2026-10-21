---
read_if:
  - you change tutorial entry, objectives, practice content or save isolation
---

# Disposable practice

Practice is a separate authored place, not a guided replacement world. Guaranteed supplies and a compact route let a newcomer learn ordinary interactions without depending on random scavenging. Use `src/content/base/tutorial.jsonnet` and `src/core/authoredSite.ts`, `AuthoredSite`.

The essentials route stays short so entry remains cheap. Combat and ammunition practice, covering both revolver and pump shotgun, injury recovery, and light and power belong in optional modules: growth must not lengthen everyone's first session.

Action labels show live bindings because outcome nouns alone leave newcomers without the means to act. Fixed pointer actions use their catalogue labels rather than implying rebinding support. Help opens the shared controls card on the relevant topic, keeping one binding catalogue that follows rebinding instead of a second manual that can drift. See `src/ui/tutorial.ts`, `mountTutorial`, and `src/game/controls.ts`, `mountControlsCard`.

Short contextual objectives observe completed outcomes rather than pressed buttons. This prevents an attempted, refused or cancelled action from being taught as success. Outcomes are retained even when performed early so lesson order cannot strand a player who already ate the supplies. Completed bean consumption also satisfies the hands prerequisite: quickbar use handles pocket food without leaving it wielded, and requiring the vanished beans afterward would punish a successful ordinary interaction. The observer cannot execute actions; see `src/game/tutorial.ts`, `Tutorial`, and `src/ui/tutorial.ts`, `mountTutorial`.

Avoidance teaches that fighting is optional. The threat has ordinary senses and damage, and the route offers separation and cover instead of immunity, scripted injury or a required kill. A bandage supports recovery without making injury a graduation requirement. Restart and exit remain available in the pause menu because practice supplies can be lost or exhausted.

Practice must never touch the player's save. Its startup branch does not construct a save controller; play also rejects a practice session bound to persistence or restoration. This avoids periodic checkpoints, sleep saves, lifecycle writes and death markers sharing a normal world identity. See `src/game/tutorial.ts`, `tutorialRequested`, and `src/game/play.ts`, `startPlay`.

Completion, death and voluntary exit return to the start choice rather than silently creating a world or transferring equipment. Returning by navigation discards the entire practice runtime and its listeners. Storage-backend selection survives navigation so Continue discovers the same normal save rather than a different storage area; presentation settings also survive; world and debug selections do not follow practice. See `src/game/tutorial.ts`, `tutorialUrl`.

The launcher offers practice only as a play destination, so a benchmark cannot carry an unsaved teaching place. See `site/launcher.js`, `setPlayOnlySite`.

Five minutes is a nominal teaching target, not a timer or test assertion. Slower reading is allowed. Teachability, threat intensity and readability require a newcomer playtest; automated proofs establish outcome observation, an injury-free route and save isolation, not whether the lesson feels clear.
