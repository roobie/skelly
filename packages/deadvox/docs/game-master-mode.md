---
read_if:
  - you add, change or gate a GameMaster power, its entry gesture or what it does to the saved run
  - you're deciding whether a tool belongs in debug mode or in GameMaster mode
  - you're designing multiplayer admin or game master roles
  - you're changing debug/playtest separation and wonder where get-unstuck tools go
---

# GameMaster mode

A design note, nothing built. BR's words are quoted; every other sentence is the writer's proposal until BR rules on the questions at the end (`docs/PROCESS.md`, "Recording decisions").

## Why a role of its own

BR asked: "can we make so that triple-clicking F2 toggles debug mode on / off?", then revised on the card: "well, maybe not debug mode, then, but rather a curated GameMaster mode/role that's for when stuff break, e.g. you're stuck someplace, and need super-powers to get unstuck and things like that. And perhaps later when multiplayer is a thing, you'd need it as an admin thing (or game master, doing stuff to design the gameplay for players)".

Debug mode stays as `INTERFACE.md`, "Development, playtest and errors" has it: a start-time developer profile chosen by the hash, unsaved, left out of the shipped page, with tools and readouts that may be instructional and break diegesis. None of those reasons hold for a player stuck in a wall ten hours into a saved run. The save must keep; the person is a player, not a developer; the page is the shipped one; the words must follow `INTERFACE.md`, "Text". Turning debug on mid-run would also be a half-measure, because most debug state is picked once at load and never re-read (the module import, the one-way debug binding switch, the start selection, the view probes). So the get-unstuck answer is not a live debug toggle. GameMaster is the shipped profile's answer to breakage and, later, to running a game for others; debug is the development answer to authoring and diagnostics. They share mechanisms, never surfaces: a debug run keeps every debug tool as it is, and GameMaster is independent of whether the run is a debug run.

## What the role is

GameMaster is a control role in the sense of `GLOSSARY.md`, "Actor roles": a seat holds it, as a seat holds Player. It is not a property of the character, the world or the save, so a save never carries it; what a power changes in the world is an ordinary world change and saves like one, the rule `docs/decisions/0002-saves.md`, "Decision" already sets for debug toggles. A role on a seat is what lets multiplayer grant it to an admin's seat later, while single player grants it to the only seat, without the powers caring who granted it.

## Powers are commands

Every GameMaster power is a command through the ordinary command path, carrying the role, like any player command; see `packages/engine/src/game/commandRouter.ts`, `CommandRouter`. Nothing reaches the simulation beside that path. Two reasons. Input replay records commands, so a replay of an assisted run replays the assist. Lockstep peers exchange inputs and nothing else (`docs/decisions/0008-deterministic-world.md`, "Decision"), so a power that bypassed the command path would desync the world, while a power that is a command arrives at every peer, which checks the issuer's seat holds the role. This one rule is what makes the multiplayer extension a grant, not a rework.

The mechanisms mostly exist in debug: damage immunity is `packages/engine/src/core/sim.ts`, `godMode`; free movement is `src/debug/noclip.ts`, `stepNoclip`; the spectator camera's teleport, which refuses a spot inside solid terrain, is `packages/presentation/src/presentation/spectatorCamera.ts`, `SpectatorCamera`; time skips and spawning are debug actions in `src/debug/index.ts`, `createDebugActions`. GameMaster selects them through its own curated surface. The debug module itself stays out of the shipped page, so a selected mechanism moves to a home both profiles import, and the debug action keeps calling it.

The power catalogue is content, under `PILLARS.md`, "Content forward compatibility": a power row selects a mechanism and carries its values, such as how far an unstick may move the player, how many hours a skip jumps or what a heal restores. Code owns the mechanism dispatch table and refuses an unknown selector at validation; a pack may add a row that selects an existing mechanism and may reword or translate the labels, and only a new mechanism needs code. A game master authoring play for others later adds rows and scenario content, not code.

Get-unstuck comes first because it is the case BR named and the one a player meets alone. The candidates are the smallest set that frees a player from geometry, a fall, a locked state or a hopeless body: an unstick that moves the player to the nearest spot where they can stand, free movement, a teleport to a map point, damage immunity, a body reset and a time skip. Which of them the first cut ships is a question below. Every label, value and button is player text under `INTERFACE.md`, "Text", so the surface narrates nothing and names no procedure.

## Entry and presence

BR proposed triple F2. F2 is bound to nothing. Multi-press and hold gestures exist (`packages/engine/src/core/inputActions.ts`, `PressKind`), but every gesture window is a code constant. The entry binding is a row in the base controls pack like every other default key (`packages/mods/skelly.controls/controls.jsonnet`), and its press count and window are content values, because the entry gesture is the one surface every stuck player must find and its timing is tuned by play, not by a code edit. One tension is open: `CONTROLS.md`, "Settled controls" chose tap-or-hold for inventory to keep "one gesture grammar rather than a double-tap window", and a triple press is a new grammar entry, hence the first question.

While a seat holds the role the player must see it, because unseen super-powers are the surprise this design exists to avoid, and the indicator is a meta HUD element that names its kind at the view-model boundary under `INTERFACE.md`, "Diegesis and development". Its form is a question below.

## Multiplayer later

The role sits on a seat; the host, or whoever a later ruling names, grants and revokes it as a session action; each peer checks the role on every power command. The powers, their content rows and their surface do not change. Game master play, "doing stuff to design the gameplay for players", is the same catalogue with authoring rows such as spawning and placing, whose mechanisms the debug spawn menu already runs. Cheating between consenting peers is lockstep's premise, not this design's problem; there is no anti-cheat here. Who may grant, and whether a joining seat may ask for the role, waits for multiplayer and needs no ruling now.

## Questions for BR

Grades compare ongoing coupling and future replacement cost (`GLOSSARY.md`, "Tech debt"), not build time. Negative space says what stays unbuilt and open. WTF names who is surprised and how much. No option is a recommendation.

### Q1. Entry gesture

- **A: triple F2** (BR's proposal). Tech debt: medium. A new multi-press kind with a count, and a third gesture grammar beside tap-or-hold and the reload double press; the window is content. Negative space: a menu entry stays addable. WTF: low for a player who was told; medium for a tester who presses twice and gets nothing; low for a modder, who sees one more row.
- **B: hold F2.** Tech debt: low. The hold kind exists; only its window moves to content. Negative space: a menu entry stays addable. WTF: low for player and tester, since crouch and the HUD toggle already hold; medium for BR, whose ask was a triple press.
- **C: a main menu button, no key.** Tech debt: low. No gesture at all. Negative space: a key stays addable. WTF: medium for a stuck player hunting a menu with the pointer locked; low for a modder.
- **D: gesture and menu button.** Tech debt: medium. Two entries kept in step. Negative space: smallest. WTF: low for everyone.

### Q2. Leaving the role

- **A: the same gesture toggles it off.** Tech debt: low. Negative space: a timed or single-use variant stays open. WTF: low; medium for a player who forgets it is on, which the indicator answers.
- **B: off after one power.** Tech debt: low. Negative space: a sustained mode stays open. WTF: medium for a player who needs free movement for a while and must re-enter each step.
- **C: off only from the menu.** Tech debt: low. Negative space: same as A. WTF: medium for the player, who entered by key and leaves by menu.

### Q3. Powers in the first cut

- **A: unstick only.** Tech debt: low. One mechanism, one row. Negative space: everything else stays unbuilt and the catalogue is still the mechanism. WTF: medium for a player stuck in a way unstick cannot read, such as a hopeless body.
- **B: unstick, free movement, damage immunity.** Tech debt: medium. Noclip and god mode move to a shared home so debug and GameMaster call one copy. Negative space: teleport, body reset and time skip stay unbuilt. WTF: low for the player; medium for a tester who expects the debug set.
- **C: B plus teleport to a map point, body reset and time skip.** Tech debt: medium to high. The map page gains a GameMaster entry and body reset needs a rule for what it restores. Negative space: authoring rows stay unbuilt. WTF: low for the player; medium for BR, since this edges into a cheat menu.

### Q4. The saved run

- **A: saves as before, nothing recorded.** Tech debt: low. Negative space: a marker stays addable, but past assists are then unknown. WTF: medium for a tester whose playtest save silently includes assists.
- **B: saves as before; the run is marked and the title card shows it.** Tech debt: medium. The save gains an assisted marker, a save decision under `docs/decisions/0002-saves.md`, "Decision". Negative space: a count or a log stays addable. WTF: low for player and tester.
- **C: saving stops for the run, as in debug.** Tech debt: low. Reuses the unsaved-session path. Negative space: B stays addable. WTF: high for the stuck player, who loses the run they wanted to rescue.
- **D: entry asks whether to keep saving.** Tech debt: medium. A prompt and both paths. Negative space: smallest. WTF: medium for the player, who is asked a question mid-rescue.

### Q5. Who gets it

- **A: every shipped run, always.** Tech debt: low. Negative space: a gate stays addable. WTF: low for the player; medium for BR if the playtest's fear depends on no way out.
- **B: a player option, off by default.** Tech debt: low. One option row. Negative space: same as A. WTF: medium for a stuck player who did not turn it on and now cannot save their run.
- **C: only when a link or mod enables it.** Tech debt: low. A pack row or hash key. Negative space: same as A. WTF: high for an ordinary player, who has no way out; low for a tester.

### Q6. The indicator while the role is held

- **A: a persistent HUD marker.** Tech debt: low. One meta element. Negative space: a stronger cue stays addable. WTF: low.
- **B: a notice on entry and exit only.** Tech debt: low. Negative space: a marker stays addable. WTF: medium for a player who looks away during the notice and forgets.
- **C: a visible change to the view, such as a tinted frame.** Tech debt: medium. A render effect beside the HUD. Negative space: smallest. WTF: low for the player; medium for a tester reading look fixtures through it.
