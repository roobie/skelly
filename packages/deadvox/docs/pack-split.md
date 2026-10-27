---
read_if:
  - you're splitting the base content into core, setting and scenario packs (#637)
  - you're deciding whether a content entry belongs to the core pack or to a setting pack
  - you're replacing a content id or setting name in TypeScript with a capability
  - you're adding a creature ability, a ranged weapon or a damage kind and need to know which pack owns it
  - you're changing the save identity's content packs
  - you're designing skill providers or behaviour when a stack defines no skills
  - you're deciding whether combat policy, a skill's effect or starting recipe knowledge belongs to core, a setting or a scenario
  - you're packing scenario content or declaring the packs a mod requires
  - you're letting a setting or a mod change a core value
  - you're building a stack without the core pack
tags: [deadvox, content, mods, packs, design]
---

# Core and setting packs

The base content holds two kinds of content in one pack. Some of it is general to any game the engine can run, such as health, bleeding and needs. The rest belongs to this game's setting and mood: its firearms, its grenades and its zombies. A medieval game built on the same engine would need the first kind and none of the second. Splitting them makes that game a new setting pack rather than a fork, and it keeps setting assumptions from leaking into the core while the content is still small enough to move. Architecture and modding come before more content, because each new entry written against one flat pack adds to what must later move.

This doc is a design plan for #637. Where the plan depends on a question that is not yet ruled, it says so and gives only what every answer shares; "Open questions" lists them.

## Layers

From the bottom up:

- **Engine:** TypeScript mechanisms. It is not a pack and holds no content.
- **Core pack:** genre-neutral content that any game on the engine can build on.
- **Setting pack:** one setting's things and creatures, such as this game's guns, ammunition, grenades and zombie types.
- **Scenario content:** content for one authored run, map or test flow, such as the gauntlet, the playtest fixtures and the tutorial. Each scenario has its own pack, which the scenario selects, so one run's content never shows up in another's registry. Templates that several scenarios reuse go in a shared scenario pack below them, so that reuse neither copies entries between scenario packs nor pushes them into the setting.
- **Mods:** bundled mods and browser mods, applied on top in their selected order (`docs/content.md`, "Bundled mods"; `docs/content.md`, "Browser mod identity").

The core pack is `deadvox.core`. This game's setting is Upheaval, in the pack `deadvox.upheaval`: a setting named for the game's mood keeps the id distinctive, and a second setting sits beside it under a name of its own.

**Core is the default first pack, not a required one.** Core is a pack like any other: it gets no privilege and no protection, and a stack may leave `deadvox.core` out when its packs provide every role and requirement that core provides. One rule for every pack is simpler than a privileged core. The core-owned required ids tie a stack to core (see "Capabilities, not ids"), so running without core waits on round 6.

**Dependencies point down only.** A pack may reference ids in its own layer and in the layers below it, and never above. The engine references no content id at all. The reason is substitution: a medieval setting replaces the setting pack whole, so a core entry that names a setting id would break it, and engine code that names a setting id would need a code edit for every new setting. One-way references also make the load order follow from the layering instead of from file names.

This is the dependency boundary that `../../../docs/decisions/0004-content-language.md`, "Runtime design" proposes as `dependencies: Mod[]`: each bundled pack declares the packs it builds on. Mods declare the packs they require from round 1, and loading refuses a mod whose required packs the stack lacks, because a mod written for one setting would otherwise fail confusingly under another. The bundled stack needs only its declared order.

## Classification rule

Classify an entry, not a file. A file that mixes kinds is split along its entries.

**Skill entries are never core content.** Skill support stays in the engine and must work with zero skills. Keeping the actual skills outside core forces a clean, provider-neutral contract instead of reliance on built-in ids. That boundary matters especially when mods can drive behaviour through the expression language. Each setting declares its own skills. Settings and mods share skills only through mechanism roles, and no common skill id is promised: content that interacts with a skill, such as a recipe or a hook, references the role. Referencing a role is not providing its skill. A custom pack that a skill interacts with, such as an item pack that a conjuring skill produces from, declares that interaction against the role's owner and references the role; the skill stays with its one provider (see "Skill providers"), so ordinary interaction never needs a provider takeover.

**An entry that depends on a skill is not core either.** It moves out of core into a setting, even when it would otherwise pass the genre test, as a recipe that needs a crafting skill would. Core must work with zero skills, and such an entry would not. Keeping it in core would need a skill-free variant: a second contract kept only so that one entry can sit lower. Moving it keeps the downward-only rule free of exceptions.

For other entries:

1. **Would a game in a different genre use the entry unchanged?** Then it is core. The test is the medieval game: it still needs the body, injuries, bleeding, needs, senses, inventory, compression, saves, the day cycle, weathering, UI and graphics policy.
2. **Does the entry exist only for one authored run, map or test flow?** Then it is scenario content. Showcase and demo layouts and debug fixtures count too.
3. **Otherwise, it belongs to the setting.**

**References decide the lowest possible layer.** An entry can sit no lower than the highest layer it references. A loot table that names a setting item is setting content, whatever the table's purpose. Moving a referenced entry down so that its referrer can follow is a classification decision of its own and needs the same test. It must never be a side effect.

**Tunables of a core mechanism are core.** Values that tune the mechanism itself, such as player body, senses and needs, belong with the mechanism's pack, even when this setting chose them. A setting or a mod changes a core value as it changes any pack's value: it declares the override and depends on the owner (`docs/decisions/0007-typed-field-patches.md`, "Decision"), and two packs setting one field fail closed. The pack that overrides a value owns the consequences. Actor-carried modifiers remain a mechanism for changing a value (`PILLARS.md`, "Content forward compatibility"), not the only one.

### Hard cases

**Ranged combat.** The core holds ranged combat in general: aim, projectiles, ballistics and noise. The setting pack holds the guns, the ammunition and the grenades, so a medieval pack could add bows on the same rules. The tunables of aim, projectile flight, ballistics and noise propagation are core content. Firearm items, their models and attachments, ammunition, explosives and their sounds are setting content. Firearm actions such as the revolver's cylinder or the pump stay engine mechanisms that a setting entry selects (`docs/decisions/0006-firearm-handling.md`). The grenade's blast is an engine mechanism, and the grenade is a setting item. Core holds only the skill mechanism and no ranged skill: the firearms skill is setting content, and each setting declares its own. A core-only stack then has no ranged skill, which costs nothing because it is never played. Aim sway and its penalties are setting policy; see "Skill providers".

**Creature framework.** The core holds the creature framework: senses, attention, modes, and abilities such as `acidSpit` as components. The setting pack holds the zombie types as data, so a medieval pack could add wolves on the same AI. The reason is modding. Modders will want to control and design enemy brains, and a framework whose parts are selected by data is the design that adds the least debt as types multiply.

The schema in `src/core/schema.ts`, `ZombieSchema` already describes most of the framework without naming a setting: sight, night sight, sight cone, hearing and its model, stimulus memory, wander, search and chase, locomotion, attack moves with damage kinds, resistance, abilities, spawn weight, loot and downed actions. The runtime behind them is `src/core/zombies.ts`, `ZombieSystem`. The zombie-specific parts name setting things in code:

- the body is chosen from a closed list of model names (`ZOMBIE_MODEL`), and validation and runtime branch on one of those names (`zombieRegionsMatchModel`, and the amalgam branches through `src/core/zombies.ts`, `src/core/zombieRegions.ts`, `src/core/zombiePose.ts` and `src/core/spawnClearance.ts`);
- the footstep family is a one-name picklist (`ZombieSchema`, `footstepSound`);
- settlement spawns name a type in code (`src/core/settlementSpawns.ts`, `HORDE_TYPE` and `WANDERER`).

The framework replaces each of these with a capability that content selects. A body plan, such as a six-region humanoid or a composite of members, replaces the model name, and the branches test the body plan. A footstep family that sound entries declare replaces the picklist. A spawn role that a type claims replaces the type id in code. The zombie type entries then move to the setting pack unchanged in meaning. The section is named `actors`, because it will hold types that are not zombies and could later cover NPCs.

**`acidSpit`, its glob and its puddle.** The mechanism is general: a seen target, a telegraphed wind-up that a hit cancels, line of sight checked at release, a simulated projectile with seeded aim, and a ground hazard that burns whoever stands in it (`docs/acid-zombie.md`, "Ability, not type"). None of that is acid-specific. Acid is a damage kind, and the hazard's burn is that damage kind applied over time. So the ability, the projectile and the hazard are core components, and the values tied to acid (its presentation and each type's resistance to it) are setting data. The ability is to become a composition of generic parts, a wind-up, a projectile and a hazard, so that a mod builds new abilities from the same parts. That split and the parts' names wait on the expression language (#313), because the expression language is likely to shape how abilities compose, and designing them first would mean doing the work twice. Round 3 therefore moves acid's values but leaves the ability's shape and name alone.

**Damage kinds are content.** Each pack declares its damage kinds, each with its class (melee or not), and code owns only the classes. That keeps code to capabilities rather than setting ids, and it lets a setting add a kind, such as fire or poison, without a code edit. So `src/core/body.ts`, `DAMAGE_KINDS` and `src/core/body.ts`, `MELEE_DAMAGE_KINDS` leave code, as does the acid-only `ZombieSchema`, `acidResistance`: resistance is keyed by declared kind.

**Blocks and vegetation.** Natural terrain and materials that any age would have are core, and so are trees and foliage. Manufactured materials of a later age are setting. A block's footstep and foliage sounds follow the block.

**Sounds.** A sound follows the entry that selects it: body and footstep sounds are core, while firearm, explosive and creature-type sounds are setting. This needs engine work first. `src/core/soundEvents.ts`, `SOUND_EVENT_IDS` is a code list of every event the engine can play, and `src/core/content.ts`, `REQUIRED_CORE_CONTENT` requires all of them, gun and zombie events included. A mechanism that plays a sound should take it from the entry that triggers it, and validation should reject a missing selection at that entry (`PILLARS.md`, "Content forward compatibility"), so that the core requires only the sounds its own mechanisms play.

**Loot, camp and layouts.** These follow their references. A loot table that only names setting items is setting. The military camp's templates, items, loot and furniture are setting. Generic cabins and houses whose fixtures and loot are setting are setting too. The gauntlet's city, lab, start and look content, the playtest layouts, furniture and items, the scenarios and their map pools, and the tutorial are scenario content.

## Skill providers

**One skill provider per mechanism role.** A mechanism that reads a skill, such as aiming or item handling, reads it through a role, and at most one skill in a stack drives each role. That replaces the fixed skill ids that combat and handling code reads without asking every item or activity to name a skill, and without a rule for combining several skills into one value.

**Competing providers fail closed.** A pack may take over a role only by declaring the override and depending, directly or transitively, on the pack that owns the role. Any other second provider fails the load with a conflict message naming the role, both packs and the fix. Load order alone never decides, because the order in which a player happens to enable mods says nothing about which one meant to win. The dependency makes an override deliberate: the overriding pack names what it takes over and always loads after the owner. The overridden skill leaves the stack's live skills: it shows nowhere, gains nothing, and the save holds nothing for it. A save is refused under another pack set (`docs/decisions/0002-saves.md`, "Compatibility"), so anything kept for the overridden skill could never come back into play, and hiding it with no record is the least state. The same rule governs two mods setting one field; see `docs/decisions/0007-typed-field-patches.md`, "Decision". Admitting an override needs the pack dependencies that round 1 adds to the loader.

**Combat atoms are core; their policy is setting content that skills modify.** Core keeps the combat mechanisms, such as aiming, blocking and item handling, because the game is essentially about combat and every setting needs them. Policy on top of a mechanism, such as a sway while aiming and its penalties, is setting content, because a setting or a mod may not use it at all. A skill, where a setting has one, only modifies that policy, so a setting can have the policy without any skill system. In a core-only stack the mechanisms run with no modifiers. Round 4 moves that policy out of the skills.

**A stack with no skills proves validation only.** The core-alone check validates the core pack and does not boot or play it. Its purpose is to keep setting assumptions out of core, and validation catches those. Booting core alone would test a stack that no player runs, and it would need start content, such as a site-generator config, that core does not hold.

**Zero skills leave an empty skill list beside Body.** The Skills tab also holds the body and injury panel, so hiding the tab would hide health information. An empty list states plainly that the stack supplies no skills. See `src/ui/inventoryScreen.ts`, `InventoryScreen`.

## Capabilities, not ids

`PILLARS.md`, "Content forward compatibility" already rules that content identity is not a code selector. #393 inventories the tunables that still live in TypeScript; this plan does not repeat that inventory. The pack split needs the other half of that rule: content ids and setting names that TypeScript names directly. They come in four shapes:

- **Required ids:** `src/core/contentIds.ts`, `CORE_CONTENT_IDS`, and `src/core/content.ts`, `REQUIRED_CORE_CONTENT`. Engine-wide rows such as the player's body and the autosave policy are core requirements and may stay as ids that the core owns until round 6 makes them capabilities, so that a stack without core can claim them. A requirement that names a setting entry moves to that setting's requirements or becomes a capability.
- **Picklists of setting names in the schema:** the creature model and footstep family above, and the sound event list.
- **Branches on a content name:** the body-plan branches above, `src/render/mobActors.ts`, and the debug loadouts in `src/debug/debugLoadout.ts`.
- **Setting names in the save identity:** `src/core/saveFormat.ts`, `defaultVersion` keys its generator versions by creature model name and names a single base pack.

A capability is a property that an entry declares and that a mechanism selects on. Examples are a body plan, a spawn role and a sound role. Code may own the set of capabilities, because each one needs a mechanism. Content owns which entries claim them. Validation rejects an entry that claims a capability without its required data, and a stack in which a required capability has no claimant.

## First round: the core-alone check

The first build round adds a CI check that a registry built from the core pack alone validates with zero issues. It comes first because it turns the classification rule into a failing check that every later round shrinks, and once it passes it keeps setting assumptions from creeping back into the core.

"Validates" means the core stack gives zero issues from `src/core/content.ts`, `buildRegistry` and `requiredContentIssues`. A registry that loads is not enough, because `buildRegistry` drops a file whose references break from the registry and reports it only as an issue, and that dropped file would be exactly the core-to-setting reference the check exists to catch. Static reachability (`docs/content.md`, "Static reachability") applies to the playable stacks. The core alone is never booted or played; see "Skill providers". Manifest, model and sound file checks run per pack.

What must move before the check can pass:

1. **Pack folders and ordered loading.** The single base folder becomes one folder per pack. `src/game/bundledContent.ts`, `buildBundledContent` and `src/cli/validate.ts`, `validate` load packs in their declared order, and the base content hash in `vite.config.ts` becomes one hash per pack. Each folder is named for its pack id. Mods declare their required packs, and loading refuses a mismatch.
2. **Requirements split by pack.** `REQUIRED_CORE_CONTENT` requires no skill entry. Skill requirements are setting requirements, like the policy that the skills modify. Setting sound rows become setting requirements until the sound-selection round replaces the code list.
3. **Core entries cleared of higher-layer references.** The check finds them. Entries that name a skill move into a setting, and other references follow the classification rule.

The round passes when the core-alone check, the full-stack validate with reachability, the deadvox unit suite and a save round trip all pass.

## Round split

Each round leaves the game playable and keeps the core-alone check green.

1. **Core-alone check and pack folders**, as above, with no core skill entries. Because a skill-less stack only validates, this round needs the requirement split and the entry moves, not role selection in engine code. Check: core-alone validate, full-stack validate, the unit suite and a save round trip.
2. **Sounds by selection.** Mechanisms take their sound from the triggering entry, and the code list of every event shrinks to the roles that core mechanisms play themselves. Setting sounds move to the setting pack. Check: the core-alone check without setting sound rows, and an admission test showing that an entry selecting a missing sound is rejected at that entry.
3. **Creature framework.** The creature section becomes `actors`. Body plan, footstep family and spawn role become capabilities. The model-name branches and the settlement type ids leave code. Acid's values move to the setting. Damage kinds become pack-declared and resistance is keyed by declared kind. Zombie types move to the setting pack. Check: the core-alone check with no creature type, and an admission test showing that a creature with a new id and an existing body plan loads without a code edit.
4. **Ranged split and combat policy.** Ranged tunables stay in core. Firearms, ammunition, attachments and explosives move to the setting pack, and debug loadouts come from content. The firearms skill is setting content, and combat reads it through its role. Aiming, blocking and handling policy leaves the skills for setting content that the skills modify (see "Skill providers"). Check: the core-alone check with no firearm, and a full-stack firing and grenade flow in an existing browser stage.
5. **Scenario content.** The gauntlet, the playtest fixtures and the tutorial each move into their own scenario pack, and templates they share go in the shared scenario pack. A new character's starting recipe knowledge comes from the scenario's start content, because what a character knows at the start is part of a run's setup, not of a skill. Check: each playable stack validates with reachability, and the core plus the setting validate without scenario content.
6. **Run without core.** Core-owned requirements become capabilities that any pack can claim, so a stack whose packs provide every role and requirement that core provides loads without `deadvox.core`. Check: such a stack validates, and a stack with no claimant for a required capability is refused with a message naming it.

**Save identity.** `src/core/saveFormat.ts`, `currentSaveVersionIdentity` already records an ordered list of packs, each with an id, a version and a canonical hash, and `contentPackDifferences` refuses a world under different packs (`docs/decisions/0002-saves.md`, "Compatibility"). The list takes its shape in round 1: one entry per bundled pack in load order, each hashed on its own, followed by bundled and browser mods as they are recorded already. Hashing per pack is what lets a refusal name which pack changed. A run's scenario pack and the shared scenario pack are entries in that list like any other pack. Identity from the evaluated content will replace this pack-list identity, as `docs/decisions/0008-deterministic-world.md`, "Decision" rules. Round 3 rekeys the generator versions by body plan instead of creature model name. No migration is owed for saves before v1.0 beta (#1023;`AGENTS.md`, "Project stage: pre-pre-alpha, no backwards compatibility").

## Open questions

Each question is open on #637. When it is ruled, the rule and its reason replace the conditional passages above.

- **Where does the default start row belong?** Blocks default-row placement in round 5.
- **The shared scenario pack's name.** Blocks its folder in round 5.
- **The names of an ability's composed parts.** Deferred until the expression language (#313) settles how abilities compose; round 3 leaves the ability's shape and name alone.
