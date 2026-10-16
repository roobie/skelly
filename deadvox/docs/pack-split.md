---
read_if:
  - you're splitting the base content into core, setting and scenario packs (#637)
  - you're deciding whether a content entry belongs to the core pack or to a setting pack
  - you're replacing a content id or setting name in TypeScript with a capability
  - you're adding a creature ability, a ranged weapon or a damage kind and need to know which pack owns it
  - you're changing the save identity's content packs
tags: [deadvox, content, mods, packs, design]
---

# Core and setting packs

The base content holds two kinds of content in one pack. Some of it is general to any game the engine can run, such as health, bleeding and needs. The rest belongs to this game's setting and mood: its firearms, its grenades and its zombies. A medieval game built on the same engine would need the first kind and none of the second. Splitting them makes that game a new setting pack rather than a fork, and it keeps setting assumptions from leaking into the core while the content is still small enough to move. Architecture and modding come before more content, because each new entry written against one flat pack adds to what must later move.

This doc is a design plan for #637. Implementation trims it to the reasons and code cues.

## Layers

From the bottom up:

- **Engine:** TypeScript mechanisms. It is not a pack and holds no content.
- **Core pack:** genre-neutral content that every game on the engine needs.
- **Setting pack:** one setting's things and creatures, such as this game's guns, ammunition, grenades and zombie types.
- **Scenario packs:** content for one authored run, map or test flow, such as the gauntlet, the playtest fixtures and the tutorial.
- **Mods:** bundled mods and browser mods, applied on top in their selected order (`docs/content.md`, "Bundled mods"; `docs/content.md`, "Browser mod identity").

**Dependencies point down only.** A pack may reference ids in its own layer and in the layers below it, and never above. The engine references no content id at all. The reason is substitution: a medieval setting replaces the setting pack whole, so a core entry that names a setting id would break it, and engine code that names a setting id would need a code edit for every new setting. One-way references also make the load order follow from the layering instead of from file names.

This is the dependency boundary that `../../docs/decisions/0004-content-language.md`, "Runtime design" proposes as `dependencies: Mod[]`: each bundled pack declares the packs it builds on. That ADR keeps ordering and conflict policy open. This plan needs only the bundled stack's declared order and leaves mod dependency policy to that ADR.

## Classification rule

Classify an entry, not a file. A file that mixes kinds is split along its entries.

1. **Would a game in a different genre use the entry unchanged?** Then it is core. The test is the medieval game: it still needs the body, injuries, bleeding, needs, senses, inventory, compression, saves, the day cycle, weathering, UI and graphics policy, and the general skills.
2. **Does the entry exist only for one authored run, map or test flow?** Then it belongs to that scenario pack. Showcase and demo layouts and debug fixtures go here too.
3. **Otherwise, it belongs to the setting.**

**References decide the lowest possible layer.** An entry can sit no lower than the highest layer it references. A loot table that names a setting item is setting content, whatever the table's purpose. Moving a referenced entry down so that its referrer can follow is a classification decision of its own and needs the same test. It must never be a side effect.

**Tunables of a core mechanism are core.** Values that tune the mechanism itself, such as player body, senses and needs, belong with the mechanism's pack, even when this setting chose them. A setting pack overrides them through the ordinary later-pack override (`PILLARS.md`, "Content forward compatibility").

### Hard cases

**Ranged combat.** The core holds ranged combat in general: aim, projectiles, ballistics and noise. The setting pack holds the guns, the ammunition and the grenades, so a medieval pack could add bows on the same rules. The tunables of aim, projectile flight, ballistics and noise propagation are core content. Firearm items, their models and attachments, ammunition, explosives and their sounds are setting content. Firearm actions such as the revolver's cylinder or the pump stay engine mechanisms that a setting entry selects (`docs/decisions/0006-firearm-handling.md`). The grenade's blast is an engine mechanism, and the grenade is a setting item.

**Creature framework.** The core holds the creature framework: senses, attention, modes, and abilities such as `acidSpit` as components. The setting pack holds the zombie types as data, so a medieval pack could add wolves on the same AI. The reason is modding. Modders will want to control and design enemy brains, and a framework whose parts are selected by data is the design that adds the least debt as types multiply.

The schema in `src/core/schema.ts`, `ZombieSchema` already describes most of the framework without naming a setting: sight, night sight, sight cone, hearing and its model, stimulus memory, wander, search and chase, locomotion, attack moves with damage kinds, resistance, abilities, spawn weight, loot and downed actions. The runtime behind them is `src/core/zombies.ts`, `ZombieSystem`. The zombie-specific parts name setting things in code:

- the body is chosen from a closed list of model names (`ZOMBIE_MODEL`), and validation and runtime branch on one of those names (`zombieRegionsMatchModel`, and the amalgam branches through `src/core/zombies.ts`, `src/core/zombieRegions.ts`, `src/core/zombiePose.ts` and `src/core/spawnClearance.ts`);
- the footstep family is a one-name picklist (`ZombieSchema`, `footstepSound`);
- hamlet spawns name a type in code (`src/core/hamlet.ts`, `HAMLET_HORDE_TYPE` and `HAMLET_WANDERER`).

The framework replaces each of these with a capability that content selects. A body plan, such as a six-region humanoid or a composite of members, replaces the model name, and the branches test the body plan. A footstep family that sound entries declare replaces the picklist. A spawn role that a type claims replaces the type id in code. The zombie type entries then move to the setting pack unchanged in meaning.

**`acidSpit`, its glob and its puddle.** The mechanism is general: a seen target, a telegraphed wind-up that a hit cancels, line of sight checked at release, a simulated projectile with seeded aim, and a ground hazard that burns whoever stands in it (`docs/acid-zombie.md`, "Ability, not type"). None of that is acid-specific. Acid is a damage kind, and the hazard's burn is that damage kind applied over time. So the ability, the projectile and the hazard are core components, and acid is setting data: the damage kind, its injury and wear rows, its presentation and each type's resistance to it. The engine work that follows is to let content declare damage kinds and their class (melee or not) instead of the code-owned list in `src/core/body.ts`, `DAMAGE_KINDS`, and to replace the acid-only resistance field (`ZombieSchema`, `acidResistance`) with resistance per declared kind.

**Blocks and vegetation.** Natural terrain and materials that any age would have are core, and so are trees and foliage. Manufactured materials of a later age are setting. A block's footstep and foliage sounds follow the block.

**Sounds.** A sound follows the entry that selects it: body and footstep sounds are core, while firearm, explosive and creature-type sounds are setting. This needs engine work first. `src/core/soundEvents.ts`, `SOUND_EVENT_IDS` is a code list of every event the engine can play, and `src/core/content.ts`, `REQUIRED_CORE_CONTENT` requires all of them, gun and zombie events included. A mechanism that plays a sound should take it from the entry that triggers it, and validation should reject a missing selection at that entry (`PILLARS.md`, "Content forward compatibility"), so that the core requires only the sounds its own mechanisms play.

**Loot, camp and layouts.** These follow their references. A loot table that only names setting items is setting. The military camp's templates, items, loot and furniture are setting. Generic cabins and houses whose fixtures and loot are setting are setting too. The gauntlet's city, lab, start and look content, the playtest layouts, furniture and items, the scenarios and their map pools, and the tutorial are scenario content. A core pack carries no world of its own beyond what core site generation requires.

## Capabilities, not ids

`PILLARS.md`, "Content forward compatibility" already rules that content identity is not a code selector. #393 inventories the tunables that still live in TypeScript; this plan does not repeat that inventory. The pack split needs the other half of that rule: content ids and setting names that TypeScript names directly. They come in four shapes:

- **Required ids:** `src/core/contentIds.ts`, `CORE_CONTENT_IDS`, and `src/core/content.ts`, `REQUIRED_CORE_CONTENT`. Engine-wide rows such as the player's body and the autosave policy are core requirements and may stay as ids that the core owns. A requirement that names a setting entry moves to that setting's requirements or becomes a capability.
- **Picklists of setting names in the schema:** the creature model and footstep family above, and the sound event list.
- **Branches on a content name:** the body-plan branches above, `src/render/mobActors.ts`, and the debug loadouts in `src/debug/debugLoadout.ts`.
- **Setting names in the save identity:** `src/core/saveFormat.ts`, `defaultVersion` keys its generator versions by creature model name and names a single base pack.

A capability is a property that an entry declares and that a mechanism selects on. Examples are a body plan, a spawn role, a sound role and a damage kind's class. Code may own the set of capabilities, because each one needs a mechanism. Content owns which entries claim them. Validation rejects an entry that claims a capability without its required data, and a stack in which a required capability has no claimant.

Two parallel #393 slices touch content and must not collide with this work. d377 moves needs tuning into the core mod. d378 moves reach distances into the core mod. Rounds that move content files start after both merge, so that each slice lands in a single base folder and moves once, with the rest of its file.

## First round: the core-alone check

The first build round adds a CI check that a registry built from the core pack alone validates with zero issues. It comes first because it turns the classification rule into a failing check that every later round shrinks, and once it passes it keeps setting assumptions from creeping back into the core.

"Validates" means the core stack gives zero issues from `src/core/content.ts`, `buildRegistry` and `requiredContentIssues`. A clean registry alone is not enough, because `buildRegistry` silently drops files whose references break, and a dropped file would hide exactly the core-to-setting reference the check exists to catch. Static reachability (`docs/content.md`, "Static reachability") applies to playable stacks, not to the core alone, because the core has no world from which to reach items. Manifest, model and sound file checks run per pack.

What must move before the check can pass:

1. **Pack folders and ordered loading.** The single base folder becomes one folder per pack. `src/game/bundledContent.ts`, `buildBundledContent` and `src/cli/validate.ts`, `validate` load packs in their declared order, and the base content hash in `vite.config.ts` becomes one hash per pack.
2. **Requirements split by pack.** `REQUIRED_CORE_CONTENT` keeps only what core mechanisms need. Setting rows, such as the firearms skill and the gun and creature sound events, become requirements of the setting pack. The sound capability is a later round, so this round splits the list rather than removing it.
3. **Core entries cleared of setting references.** The check finds them. Each one is resolved by the classification rule: the entry moves up, or its reference moves down on its own merits.

The round passes when the core-alone check, the full-stack validate with reachability, the deadvox unit suite and a save round trip all pass.

## Round split

Each round leaves the game playable and keeps the core-alone check green.

1. **Core-alone check and pack folders**, as above. Check: core-alone validate, full-stack validate, the unit suite and a save round trip.
2. **Sounds by selection.** Mechanisms take their sound from the triggering entry, and the code list of every event shrinks to the roles that core mechanisms play themselves. Setting sounds move to the setting pack. Check: the core-alone check without setting sound rows, and an admission test showing that an entry selecting a missing sound is rejected at that entry.
3. **Creature framework.** Body plan, footstep family and spawn role become capabilities. The model-name branches and the hamlet type ids leave code. Damage kinds and per-kind resistance become content, and acid moves to the setting. Zombie types move to the setting pack. Check: the core-alone check with no creature type, and an admission test showing that a creature with a new id and an existing body plan loads without a code edit.
4. **Ranged split.** Ranged tunables stay in core. Firearms, ammunition, attachments and explosives move to the setting pack, and debug loadouts come from content. Check: the core-alone check with no firearm, and a full-stack firing and grenade flow in an existing browser stage.
5. **Scenario packs.** The gauntlet, the playtest fixtures and the tutorial become scenario packs, and a scenario names the packs it runs on. Check: each scenario stack validates with reachability, and the core plus the setting validate without any scenario.

**Save identity.** `src/core/saveFormat.ts`, `currentSaveVersionIdentity` already records an ordered list of packs, each with an id, a version and a canonical hash, and `contentPackDifferences` refuses a world under different packs (`docs/decisions/0002-saves.md`, "Compatibility"). The list takes its shape in round 1: one entry per bundled pack in load order (the core, then the setting, then the scenario packs a run uses), each hashed on its own, followed by bundled and browser mods as they are recorded already. Hashing per pack is what lets a refusal name which pack changed. Round 3 rekeys the generator versions by body plan instead of creature model name. No migration is owed for saves before v1.0 beta (`AGENTS.md`, "Project stage: pre-pre-alpha, no backwards compatibility").
