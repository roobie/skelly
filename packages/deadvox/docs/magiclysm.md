---
read_if:
  - you're planning a magic mod in the manner of Cataclysm's Magiclysm, or the engine work it needs
  - you're building character attributes, content-declared modifiers, timed effects, resource pools or traits
  - you're deciding what a character attribute governs, or whether a new one is needed
  - you're choosing which engine verbs or content kinds the mod rules work adds first
  - you're opening a closed code list (damage kinds, item capabilities, long jobs, zombie abilities) for mods
---

# Magiclysm mod: working draft

This is a working draft of the engine gaps between deadvox and a mod in the manner of
Magiclysm, Cataclysm: Dark Days Ahead's magic mod. Each gap names the closed mechanism to
open; the order says which gap unblocks which. Each section shrinks to its reason and code
cues as its gap closes, and the draft goes once every gap has its own doc or ADR.

## Why a mod

Magic is outside the base game's tone (`DESIGN.md`, "Tone"), so it can only arrive as a
mod. Magiclysm has the same shape as Mind Over Matter, the target set by
`docs/decisions/0004-content-language.md`, "Mod rules": powers, a resource that pays for
them, exclusive schools, and scaling with practice. Closing Magiclysm's gaps therefore
mostly closes the gaps that ADR already commits to, and the mod is a second, concrete
consumer for the vocabulary #313 settles.

The target follows the ADR: a mod of Magiclysm's kind, in deadvox's own vocabulary, with no
Magiclysm file loading unchanged.

## What the mod needs

Magiclysm's parts, in deadvox terms:

- **Schools:** mutually exclusive traits that grant a starting spell and shape what the
  character learns.
- **Spells:** content entries that each select one engine effect and set its damage, range,
  area, duration and cost, with per-level scaling. Casting practices the spell.
- **Mana:** a pool whose size and recovery follow an attribute.
- **Spellbooks:** readables that teach spells.
- **Enchantments:** items that carry modifiers under a condition such as worn or wielded.
- **Elemental damage:** fire, cold and electric hits, with resistances per kind.
- **Creatures and places:** new monster types, some with abilities, and new sites.
- **Allies:** summoned or raised creatures that fight for the player.

## Gaps, in dependency order

### 1. Attributes and content-declared modifiers

The resolver and its carriers exist, but no content reaches them. Bodies and zombies carry
modifier lists that nothing fills, content cannot declare a modifier, and skills apply
their effects through a separate saturation curve at each consumer. See
`src/core/modifiers.ts`, `modified` and `MODIFIED_EFFECTS`; `src/core/sim.ts`, `Sim`;
and `src/core/character.ts`, `skillSaturation`.

Needed:

- **Attributes as content,** held by the character and saved with it. An attribute is a
  content entry that contributes modifiers to effects; no mechanism reads an attribute
  directly. A mod therefore adds an attribute without an engine change, and the base set
  only has to cover the base game.
- **Attributes as modified values:** an attribute has a base value plus modifiers, so an
  item or a condition can raise or lower it. This is what an enchantment's "+2 strength
  while worn" needs.
- **Modifier sources as content:** items under a condition, traits and timed effects
  (gap 2), each attributed to its source so removing the source removes its modifiers.
- **Derived modifiers:** an attribute or skill level contributes modifiers, so every
  mechanism reads one resolver. Folding skills onto modifiers keeps a new consumer from
  having to remember two paths.
- **Vocabulary growth with mechanisms:** the effect list stays engine vocabulary
  (`PILLARS.md`, "Content forward compatibility"), so each later gap adds the entries its
  mechanism reads.

#### Attribute vocabulary

Each attribute owns one aptitude, with a boundary sharp enough that two attributes never
compete for the same effect:

- **Strength:** force. Melee impulse and bashing, throw range, recoil, lifting furniture.
  `DESIGN.md`, "Moving furniture", lets size stand in for strength; strength is what that
  sentence worked around.
- **Dexterity:** the hands. Handling time (`DESIGN.md`, "Handling time"), reloading,
  applying treatment, crafting and prying speed.
- **Agility:** the whole body. Movement and sprint speed, ladders and climbing, stance
  changes, melee recovery.
- **Intellect:** learning. Practice gain, reading time and recipe access, and the mana
  pool in Magiclysm.
- **Perception:** noticing. The player's own eyes do the seeing in first person, so
  perception needs effects the game owns: hearing range and direction precision, telling
  zombie types apart at a distance, spotting loot and traps. Without them it is a dump
  attribute.
- **Grit:** resolve. How much a condition impairs the character, never the condition
  itself: grit keeps a bleeding or exhausted character working, but does not clot blood or
  shorten sleep debt. Its effects are the pain knockout threshold, the point at which shock
  impairs, how hard fatigue and hunger tiers bite, the winded threshold, the cost of
  adverse surroundings, and concentration under stress (holding breath, steadiness while
  hurt, casting failure in pain).

Endurance is not an attribute. It is a group of effects (stamina maximum and recovery,
fatigue gain, the winded threshold) that strength and agility feed as the body's
adaptation, and grit feeds as the mental state that keeps a body going.

Physiology is not an attribute either. Bleeding closure, blood recovery and infection
resistance belong to traits (gap 4) and to the character's state, such as nutrition and
rest, because they are not aptitudes a person has or trains. This keeps any attribute from
being only more health.

Excluded: charisma, which waits for NPCs or factions (gap 8); and luck, because the engine
owns seeded randomness and luck works against skill.

Open: how attributes are set and whether they change (point-buy at start, growth with
practice, or fixed apart from modifiers), which decides whether the character stores them
or the start state (gap 4) grants them; and whether skills fold onto modifiers in the same
change.

### 2. Timed status effects

Each lasting condition has its own owner, so nothing else can apply one. Magiclysm's buffs,
debuffs and enchantment procs need a generic effect: a content kind with duration,
stacking, the modifiers it carries and any damage over time. It is the modifier carrier
with a lifetime. Lingering damage per region is a seed; see `src/core/damageExposure.ts`,
`DamageExposures`. Pain, bleeding and drug effects are base-game candidates for the same
mechanism.

### 3. Resource pools

Health, stamina, needs and battery charge are separate implementations; see
`src/core/needs.ts`, `Needs`. Mana either copies stamina's pattern or becomes the first
content-defined pool, with its maximum and recovery as modified effects. A pool kind pays
again for Mind Over Matter's psionic resource.

### 4. Traits and start state

Neither traits nor start state is content. Schools need trait entries with exclusive
groups, and a start state that grants one; the start kit is code (`src/game/loadout.ts`,
`startingLoadout`). The start-state design is `docs/url-mods.md`, "Start state in mods".

### 5. Mod infrastructure

A Magiclysm mod patches a lot of base content (spellbooks in loot, mana on the player,
schools in the start flow), so it needs:

- **Field patches** (`docs/decisions/0007-typed-field-patches.md`, "Decision"). Without
  them the mod restates whole base entries.
- **Declared dependencies on packs** (`docs/pack-split.md`, "Layers"; #637).
- **Rules, effects and mod state**
  (`docs/decisions/0004-content-language.md`, "Runtime design"; #313). The CEL harness in `src/spikes/expressions/` is a spike that the game
  does not import.

The only shipped rule mechanism is the scenario event rules; see
`src/core/eventRules.ts`, `advanceEventRules`.

### 6. Spells: abilities with an effect dispatch

Magiclysm's spell effect types are what ADR 0004 calls engine verbs, so spells are a
natural first consumer for #313's effect vocabulary. Each spell is content selecting a
verb; the verbs are code.

Parts to reuse:

- **Blast falloff and sight:** `src/core/explosive.ts`, `blastShare` and `inSight`.
- **Arcing projectile:** `src/core/acidGlob.ts`, `advanceAcidGlob`.
- **Block changes for earthshaping:** `src/core/world.ts`, `World.setBlock`.
- **Hold and release for channelled casts:** `src/core/playerCombat.ts`, `holdCharge`
  and `releaseCharge`.
- **Cast progress:** `src/ui/hud.ts`, `renderHandling`.

Closed lists to open:

- **Item use:** `src/game/primaryAction.ts`, `CAPABILITY_DISPATCH`. Casting needs a
  non-item action, or an item capability whose payload is an effect.
- **Long jobs:** `src/core/longAction.ts`, `LongJob`. Cast time is one more job.
- **Projectiles and puddles:** they belong to `ZombieSystem` and are typed to the spit
  ability; see `src/core/zombies.ts`, `ZombieSystem.detonate`. A player-usable system
  needs an effect payload and a damage kind per blast.
- **Book outcomes:** reading only teaches recipes; see `src/core/bookReading.ts`.
- **Quickbar:** it binds items only; see `src/game/quickbar.ts`.

### 7. Open damage kinds

Damage kinds are a closed code list, and zombie resistances have a fixed shape per kind;
see `src/core/body.ts`, `DAMAGE_KINDS`, and `src/core/schema.ts`, `ZombieSchema`. Elemental
schools need any content kind to work as a damage kind with resistances keyed by it.
Wearable protection is already keyed by kind. The planned resistant zombie types in
`DESIGN.md`, "Types are data", need the same opening.

### 8. Creature abilities, factions and allies

Creature stats are content, but abilities and body models are closed code lists, and the
AI targets only the player; see `src/core/schema.ts`, `ZOMBIE_ABILITIES`;
`src/core/zombieModels.ts`, `ZOMBIE_MODELS`; and `src/core/zombies.ts`, `ZombieMode`.
Summons and raised dead need factions and target choice, the deepest change here, so it
comes last.

### 9. UI and world presentation

- **Spell list:** the inventory tabs are a closed list; see `src/ui/inventoryTabs.ts`.
- **Mana readout:** `src/ui/playHud.ts`, `playNeedsText`. `INTERFACE.md`,
  "Diegesis and development", favours bodily cues, so how mana feels on the body is settled before a bar
  is added.
- **Transient light:** light spells and glowing projectiles need a world light source that
  is not an item or a fixture; see `src/core/illumination.ts`, `IlluminationScene`.

## Order

Gaps 1 to 4 serve the base game as well (wound-care traits, drug effects, resistant zombie
types), so they need not wait for magic to be scheduled. Spells (gap 6) wait for the #313
vocabulary and field patches (gap 5). Damage kinds can land whenever a fire or cold source
needs them, and allies come last.
