---
read_if:
  - you add, change or gate a GameMaster power, its entry gesture or what it does to the saved run
  - you're deciding whether a tool belongs in debug mode or in GameMaster mode
  - you're designing multiplayer admin or game master roles
  - you're changing debug/playtest separation and wonder where get-unstuck tools go
---

# GameMaster mode

A design note ahead of the build. BR's words are quoted; the rest is the writer's reading of BR's rulings (`docs/PROCESS.md`, "Recording decisions").

## Why a role of its own

BR asked: "can we make so that triple-clicking F2 toggles debug mode on / off?", then revised on the card: "well, maybe not debug mode, then, but rather a curated GameMaster mode/role that's for when stuff break, e.g. you're stuck someplace, and need super-powers to get unstuck and things like that. And perhaps later when multiplayer is a thing, you'd need it as an admin thing (or game master, doing stuff to design the gameplay for players)".

Debug mode stays as `INTERFACE.md`, "Development, playtest and errors" has it: a start-time developer profile chosen by the hash, unsaved, left out of the shipped page, with tools and readouts that may be instructional and break diegesis. None of those reasons hold for a player stuck in a wall ten hours into a saved run. The save must keep; the person is a player, not a developer; the page is the shipped one; the words must follow `INTERFACE.md`, "Text". Turning debug on mid-run would also be a half-measure, because most debug state is picked once at load and never re-read (the module import, the one-way debug binding switch, the start selection, the view probes). So the get-unstuck answer is not a live debug toggle. GameMaster is the shipped profile's answer to breakage and, later, to running a game for others; debug is the development answer to authoring and diagnostics. They share mechanisms, never surfaces: a debug run keeps every debug tool as it is, and GameMaster is independent of whether the run is a debug run.

## What the role is

GameMaster is a control role in the sense of `GLOSSARY.md`, "Actor roles": a seat holds it, as a seat holds Player. It is not a property of the character, the world or the save, so a save never carries the role itself; what a power changes in the world is an ordinary world change and saves like one, the rule `docs/decisions/0002-saves.md`, "Decision" already sets for debug toggles. A role on a seat is what lets multiplayer grant it to an admin's seat later, while single player grants it to the only seat, without the powers caring who granted it.

Every shipped run has the role on offer. BR: "we'll gate it later". A who-may-use gate is therefore not designed here; it stays an open trigger, deferred in #1695, and the role check at the command path below is the one place a later gate plugs in.

## Powers are commands

Every GameMaster power is a command through the ordinary command path, carrying the role, like any player command; see `packages/engine/src/game/commandRouter.ts`, `CommandRouter`. Nothing reaches the simulation beside that path. Two reasons. Input replay records commands, so a replay of an assisted run replays the assist. Lockstep peers exchange inputs and nothing else (`docs/decisions/0008-deterministic-world.md`, "Decision"), so a power that bypassed the command path would desync the world, while a power that is a command arrives at every peer, which checks the issuer's seat holds the role. This one rule is what makes the multiplayer extension a grant, not a rework.

The first cut is free movement, damage immunity and spawn items. The first two free a player from geometry, a fall or a hopeless fight, the case BR named and the one a player meets alone; spawn items joins them because a run can also break by losing the one thing it needs, such as the key to a locked route or the ammunition for its gun, and spawning it is cheaper than a teleport past the obstacle. There is no separate unstick command: free movement reaches anywhere, so the stuck player moves out of the wall or up from the pit under it and stops where they choose, and a command that picked the destination for them would be redundant and would need a destination rule of its own. Teleport to a map point, body reset and time skip stay out of the first cut for the same reason: each needs a rule of its own and none is needed to get unstuck.

Spawn items offers every loaded item type. A curated list cannot predict which thing a broken run is missing, and a stuck player whose item is absent from the list is stuck still; what makes the surface a player's rather than a developer's is its words, not a shorter catalogue. This is a wider list than the debug spawn menu's, which leaves out the one type that stands for an unfinished craft (`packages/engine/src/core/inventory.ts`, `workInProgressItem`), because that type is only the carrier of a work payload and a developer picking from a list has no payload to give it. The GameMaster list does not inherit that exclusion: its rule is the registry, so a pack that adds an item type never has to teach the rescue surface about it. The simulation still refuses a carrier without its payload (`packages/engine/src/core/inventory.ts`, `validateWorkItem`), so how the list presents that one type is settled in the build (#1695), not by shortening the rule here.

The mechanisms exist in debug: damage immunity is `packages/engine/src/core/sim.ts`, `godMode`; free movement is `src/debug/noclip.ts`, `stepNoclip`; spawning an item into the player's reach is `src/debug/spawnItem.ts`, `spawnDebugItem`, chosen through `src/debug/spawnMenu.ts`, `SpawnMenu`. The debug module stays out of the shipped page, so noclip, god mode and item spawning move to a home both profiles import, and the debug actions keep calling them there; the debug spawn menu keeps its own surface, because an instructional developer list is not the curated surface a player sees.

The power catalogue is content, under `PILLARS.md`, "Content forward compatibility": a power row selects a mechanism and carries its labels and values. Code owns the mechanism dispatch table and refuses an unknown selector at validation; a pack may add a row that selects an existing mechanism and may reword or translate the labels, and only a new mechanism needs code. A game master authoring play for others later adds rows and scenario content, not code. Every label, value and button is player text under `INTERFACE.md`, "Text", so the surface narrates nothing and names no procedure.

## Entry and presence

Triple F2 enters the role and the same triple press leaves it. F2 is bound to nothing, so the gesture takes no key from play. A toggle, rather than a role that ends after one power, because the common rescue is a sequence, free movement until the player stands clear and then immunity off again, and re-entering before each step would make the gesture the obstacle. A multi-press is a third gesture grammar beside tap-or-hold and the reload double press (`packages/engine/src/core/inputActions.ts`, `PressKind`); it is accepted here because a rescue gesture must be hard to make by accident in a fight and easy to remember when stuck, and a triple press on an otherwise unbound key is both. The entry binding is a row in the base controls pack like every other default key (`packages/mods/skelly.controls/controls.jsonnet`), and its press count and window are content values, because the entry gesture is the one surface every stuck player must find and its timing is tuned by play, not by a code edit.

While a seat holds the role a persistent HUD marker shows it, because unseen super-powers are the surprise this design exists to avoid, and a notice that fades is forgotten by the player who looked away. The marker is a meta HUD element that names its kind at the view-model boundary under `INTERFACE.md`, "Diegesis and development". It shows regardless of the HUD options and the master toggle, the one meta element that does, because the player who plays HUD-off and forgets the role is on is exactly the player the marker exists to warn. `INTERFACE.md`, "Diegesis and development" and `INTERFACE.md`, "HUD" name this exception, so the interface rules and this note give one answer.

## The saved run

The run keeps saving while the role is held, and the save records that the run was assisted; the title card shows the mark. Saving must continue because the stuck player entered the role to rescue a run worth keeping, and stopping saves, as debug does, would lose exactly that run. The mark exists because a playtest save that silently includes assists misleads whoever reads its metrics, and a player deciding whether to continue a run deserves to know it was helped. The mark is persistent owner state and follows `docs/decisions/0002-saves.md`, "Decision": it is saved with the change that introduces it, and the role itself is still not saved.

## Multiplayer later

The role sits on a seat; the host, or whoever a later ruling names, grants and revokes it as a session action; each peer checks the role on every power command. The powers, their content rows and their surface do not change. Game master play, "doing stuff to design the gameplay for players", is the same catalogue with authoring rows such as spawning and placing, whose mechanisms the debug spawn menu already runs. Cheating between consenting peers is lockstep's premise, not this design's problem; there is no anti-cheat here. Who may grant, and whether a joining seat may ask for the role, waits for multiplayer and needs no ruling now.
