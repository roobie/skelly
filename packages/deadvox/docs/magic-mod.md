---
read_if:
  - you locate or change a schema contract cited here
  - you're planning the magic mod inspired by Cataclysm's Magiclysm, or the engine work it needs
  - you're planning the high-fantasy product the magic mod is a big piece of
  - you're writing a compatibility mod that brings the magic mod into another product, such as Deadvox
  - you're building character attributes, content-declared modifiers, timed effects, resource pools or traits
  - you generalize skill capability providers into a composable effect resolver
  - you're deciding what a character attribute governs, or whether a new one is needed
  - you're choosing which engine verbs or content kinds the mod rules work adds first
  - you're opening a closed code list (damage kinds, item capabilities, long jobs, creature abilities) for mods
---

# Magic mod: working draft

This is a working draft of the engine gaps for a magic mod whose big inspiration is
Magiclysm, the magic mod for Cataclysm: Dark Days Ahead. The mod is not Magiclysm and does
not take its name; "the magic mod" is this draft's working name. Each gap names the closed
mechanism to open; the order says which gap unblocks which. Each section shrinks to its
reason and code cues as its gap closes, and the draft goes once every gap has its own doc
or ADR.

## Why a mod, and which products use it

Products are content stacks on one engine and mod framework, and Deadvox is one of them
(#1532). The magic mod is a big piece of a high-fantasy product, a game of its own with a
Morrowind-like feel, made of content alone; "the fantasy product" is its working name, and
its name is open. The mod is not tied to that product: a mod can serve several products,
and using it in a product it was not written for goes through compatibility mods under the
pack rules: declared dependencies, and clashes that fail closed unless a compatibility mod
resolves them. Magic is outside Deadvox's tone (`DESIGN.md`, "Tone"), so Deadvox never
ships the mod, but a player can mix it in through a compatibility mod. Content alone means
no product-specific code: what the mod lacks is engine work, which the gaps below scope.

Magiclysm has the same shape as Mind Over Matter, the target set by
`docs/decisions/0004-content-language.md`, "Mod rules": powers, a resource that pays for
them, exclusive schools, and scaling with practice. Closing the magic mod's gaps therefore
mostly closes the gaps that ADR already commits to, and the mod is a second, concrete
consumer for the vocabulary #313 settles.

The target follows the ADR: a mod of Magiclysm's kind, in the engine's own vocabulary, with
no Magiclysm file loading unchanged and none of its names carried over. Mechanism names in
this draft use general roles (actors, creatures), not one product's words; code cues name
symbols as they are, and the leaks those names show belong to #1532.

## What the magic mod needs

The parts it takes from Magiclysm's design, in engine terms:

- **Schools:** mutually exclusive traits that grant a starting spell and shape what the
  character learns.
- **Spells:** content entries that each select one engine effect and set its damage, range,
  area, duration and cost, with per-level scaling. Casting practices the spell.
- **Mana:** a pool whose size and recovery follow an attribute.
- **Spellbooks:** readables that teach spells.
- **Enchantments:** items that carry modifiers under a condition such as worn or wielded.
- **Elemental damage:** fire, cold and electric hits, with resistances per kind.
- **Creatures and places:** new monster types, some with abilities, and new sites.
- **Allies:** summoned or raised creatures that fight for the player character.

## Gaps, in dependency order

### 1. Attributes and content-declared modifiers

The resolver and its carriers exist, but no content reaches them. Player and creature bodies
carry modifier lists that nothing fills, content cannot declare a modifier, and skills apply
their effects through a separate saturation curve at each consumer. See
`src/core/modifiers.ts`, `modified` and `MODIFIED_EFFECTS`; `src/core/sim.ts`, `Simulation`;
and `src/core/character.ts`, `skillSaturation`.

Needed:

- **Attributes as content,** held by the character and saved with it. An attribute is a
  content entry that contributes modifiers to effects; no mechanism reads an attribute
  directly. A product or mod therefore adds an attribute without an engine change, and a
  shared set only has to cover the products that share it. Which pack owns the shared set
  is open in #1532.
- **Attributes as modified values:** an attribute has a base value plus modifiers, so an
  item or a condition can raise or lower it. This is what an enchantment's "+2 strength
  while worn" needs.
- **Modifier sources as content:** items under a condition, traits and timed effects
  (gap 2), each attributed to its source so removing the source removes its modifiers.
- **One resolver for skills and attributes:** skill and attribute levels feed effects
  through the same resolver as modifiers, so a new consumer has one path
  (`docs/magic-mod.md`, "Skills and the resolver").
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
  pool in the magic mod.
- **Perception:** noticing. The player's own eyes do the seeing in first person, so
  perception needs effects the game owns: hearing range and direction precision, telling
  creature types apart at a distance, and revealing hidden things such as traps and concealed
  caches by highlighting them once the character notices them. Hidden things need a
  concealment value in content for perception to beat. Perception also gates traits that
  depend on keen senses. Without these it is a dump attribute.
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

#### How attributes are set

An attribute's effective value has three layers:

- **Innate:** set once by the start state (gap 4). Every attribute starts at a content
  default. Character creation screens wait for mod UI (gap 9), so point-buy and other
  choices arrive as start-state content with no screen of their own in Deadvox.
- **Conditioned:** slow change from how the character lives, held in character state and
  saved. Strength, agility and, more slowly, dexterity train and atrophy. Grit trains and
  never falls, because hardship stays with a person. Intellect and perception have no
  conditioned layer: knowledge lives in skills, and fixed values keep them the character's
  identity and stable trait gates.
- **Current:** modifiers from conditions and items, such as pain lowering dexterity or an
  enchanted ring raising strength (gap 2).

Mechanisms read innate plus conditioned, then modifiers, through a content curve, so
stacked bonuses saturate rather than run away.

Training comes from bodily load over sim time, not from actions. A skill is technique and
grows from successful actions; an attribute is capacity and grows from sustained exertion
that the needs and stamina sim already measures. One swing practises melee, but only
sustained heavy work moves strength. Tying training to load rather than action events
denies repeat-an-action grinding, and spending it only while the body is fed and rested
keeps it integrated over sim time as needs are, so time compression and replay stay
deterministic; see `src/core/needs.ts`, `stepNeeds`. Diminishing returns and a soft cap
relative to the innate value keep training from overriding who the character is.

Atrophy follows starvation and long injury, not merely a lack of training, and it has
hysteresis: the character keeps its peak conditioned value, and regaining ground below
that peak is faster than first reaching it, as a once strong body regains lost strength
quickly. The peak is therefore character state too.

Content owns training and atrophy rates, the regain speed below the peak, caps, defaults,
and which exertion trains which attribute. Code owns the exertion kinds the sim can
measure and the training integrator.

#### Skills and the resolver

Skill effects fold into the resolver; skills stay the owner of progression: practice,
levels, recipe unlocks and training activities. Mechanism capabilities select providers
without fixing their ids; see `src/core/capabilities.ts`, `claimed`. The resolver must
also decouple effects from their provider's tuning shape so content can combine
contributors instead of requiring one predefined skill block. Content naming the skill
driving an interaction remains valid; see `src/core/prying.ts`, `pryPlan`. The fold
generalizes that relationship rather than restoring fixed skill ids.

Each modified effect resolves in one pipeline:

1. **Base:** the mechanism's content value.
2. **Aptitude:** content on the effect names the skills and attributes that feed it, with
   weights. Their contributions add into one effective level before the effect's own curve
   turns it into a factor. Practice and natural aptitude are the same kind of capability,
   so they share one ceiling, and the curve's floor bounds them together.
3. **Modifiers:** items, traits and timed effects multiply and add on top, in factor space,
   so they can carry a character past the aptitude ceiling. That is the room an enchanted
   item or a superhuman trait needs.

The engine owns each effect's true bounds, such as a duration staying positive; content
cannot lift them (`PILLARS.md`, "Content forward compatibility"). The consumers'
differing curve shapes (a saturating factor, interpolation from skill zero to expert, a
minimum plus a range) all reduce to a factor on a base, so the effect declares its curve
and the consumer stops calling `src/core/character.ts`, `skillSaturation`. A mod can then
feed an existing effect from a new skill, as a spellcraft skill feeds casting failure, or
an existing skill into a new effect.

Practice runs through the same resolver: practice gain is a modified effect, which is
intellect's main consumer outside magic. Each training activity names the skill it trains in
content, so no award names a skill in code.

Progression thresholds are content too: the level range, the practice a legendary level
needs, whether the legendary level has effects or is vanity, and the default training
ceiling. Code keeps the mechanism, that levels are whole numbers, practice only
accumulates and a ceiling stops it, and checks saved levels against content. See
`src/core/character.ts`, `Character.awardPractice` and `skillEffectLevel`.

The fold lands with or before attributes, so no consumer gains a second input path only to
lose it. Moving consumers keeps each one's tuned shape, not its exact numbers; tests assert
properties such as more skill never slowing an action and the bounds holding.

### 2. Timed status effects

The magic mod's buffs, debuffs and enchantment procs need a generic effect: the modifier
carrier with a lifetime. Each lasting condition has its own owner, so nothing else can
apply one. Analgesic doses already have most of an effect's shape (an onset, peak and fade
envelope, stacking groups under a cap, aging that prunes spent doses, and presentation that
follows strength); see `src/core/pain.ts`, `analgesia`, `ageDoses` and `drugVignette`.

#### Effects and conditions

An effect happens to an actor and has a lifetime of its own: a painkiller, a burn, haste,
an enchantment's proc, a curse. A condition is what the body computes from its own state:
bleeding per wound, the pain level, hunger and fatigue tiers. Conditions stay with their
owners because they are physiology, but their consequences are modifiers of the same kind
an effect carries, so pain's aim penalty and a curse's aim penalty are one thing. Pain's
fixed consequences become such modifiers; see `src/core/pain.ts`, `painEffects`.

#### Impairment and grit

Modifiers emitted by conditions, and effect modifiers that content tags as impairment,
form the impairment layer. Grit feeds one modified effect that pulls impairment modifiers
toward no change, so it softens how much pain hampers aim without touching the pain, and
leaves poison damage or an untagged curse alone. This is the mechanism behind grit's rule
in `docs/magic-mod.md`, "Attribute vocabulary".

#### What an effect carries

- **Lifetime:** a fixed duration, an envelope like an analgesic's, or open-ended until
  removed. Each effect names the clock its lifetime and rates run on, Game or Sim, as every
  temporal field does (`DESIGN.md`, "Clocks and units"): drugs and illness follow the
  calendar, while a stun or a fight-long haste must keep its felt length under compression.
- **Stacking:** content selects one mechanism: refresh the duration, add intensity up to a
  maximum, or independent instances under a group cap as analgesics stack.
- **Modifiers** scaled by the effect's current strength, including modifiers on attributes.
- **Damage over time** as an exposure source; see `src/core/damageExposure.ts`,
  `DamageExposures`.
- **Rules the existing owners hard-code,** as content selections: refusing time
  compression, as heavy bleeding does, and interrupting long actions, as a critical need
  does; see `src/core/needs.ts`, `CriticalRule`.
- **Removal groups,** so a cure or a dispel names a group rather than an effect id.
- **Body cues** for presentation (`INTERFACE.md`, "Diegesis and development"); a list of
  effects is at most a toggleable meta element.

Effects are applied by used items, landed creature moves, spells, rules (#313) and another
effect's expiry, which chains poison into weakness. Rolls happen at application and the
engine draws them (`docs/decisions/0004-content-language.md`, "Mod rules").

#### State and actors

Each actor saves its active instances (effect, source, age, intensity), pruned when spent.
Aging is closed-form, so compressed and ticked time agree, as `src/core/pain.ts`,
`fadeAcute`, and `DamageExposures` already do. Effects are actor-generic from the start:
spells put fire, slowness and stuns on creatures, and a creature with no effects costs
nothing. Creature stagger can later move onto effects; see `src/core/zombies.ts`, `staggerSimSeconds`.

Analgesics are the first consumer: the mechanism must express painkillers before magic
relies on it.

### 3. Resource pools

Mana needs a pool, and stamina is the only pool there is, with every pool feature
hard-coded to it: a recovery delay that starts on emptying, a winded gate with hysteresis,
slower recovery while a need is critical, and a fixed scale with no maximum to raise; see
`src/core/needs.ts`, `spendStamina`, `stepStamina` and `canSprint`.

A pool is a spendable effort resource: stamina, mana, and later a psionic or bionic one.
Hunger, thirst, fatigue and blood are conditions
(`docs/magic-mod.md`, "Effects and conditions") and stay with their owners. Battery charge stays on items.

#### What a pool carries

- **Clock:** named by the pool, as for effects. Stamina runs on Sim time; mana, which
  returns over hours, on Game time.
- **Amount and maximum:** the amount is absolute and the maximum is a modified effect that
  aptitude feeds (the endurance group for stamina, intellect for mana), so a larger pool
  buys more casts rather than cheaper ones. When the maximum falls below the amount, as
  when an enchantment comes off, the excess drains gradually rather than vanishing.
- **Recovery** as a modified effect. A critical need slows stamina recovery through a
  modifier its condition emits, so grit softens it as part of the impairment layer.
- **Recovery delay** after emptying, also a modified effect.
- **Gates with hysteresis:** refuse below one level until the pool is back above another.
  Winded is the first gate, and grit moves its threshold.
- **Overdraw:** each pool selects whether an empty pool refuses a spend or lets it go past
  empty for a consequence effect (gap 2), such as burnout or a nosebleed. Refusal is the
  pool's setting, not an engine rule, so overreach in the manner of Mind Over Matter is
  content.
- **Emptying consequences** as effects, such as exhaustion when a pool runs dry.
- **Body cues:** breathing for stamina; mana's cue is the mod's choice.

#### Spending

Every spend names its cost target, an amount and an exertion kind. The exertion kind is
the bodily load the conditioned layer trains on
(`docs/magic-mod.md`, "How attributes are set"), so pool spends are the training measurement and need no separate one.

A cost target is a pool or a body cost: health or blood, which `Body` pays under its own
rules, so blood spent on a spell or ritual lowers blood and brings its shock and recovery
as any blood loss does. A ritual may instead pay through a self-inflicted wound, so
bleeding and treatment apply. Stamina- and blood-cast spells then need no special case.
See `src/core/body.ts`, `Body`.

#### State

Each actor saves each pool's amount, delay remaining and gate state, stepped in closed
form on the pool's clock so compressed and ticked time agree. Stamina is the first
consumer, as analgesics are for effects; mana is the second.

### 4. Traits and start state

Neither traits nor start state is content: schools need trait entries, and the start kit
is code (`src/game/loadout.ts`, `startingLoadout`). The start-state design is
`docs/url-mods.md`, "Start state in mods". Traits change during play, which Deadvox needs
as much as the magic mod: mutation pressure spreads outward from Deadvox's labs
(`DESIGN.md`, "Points of interest"), so mutation is a consumer outside magic and gap 4 need
not wait for it.

#### What a trait carries

- **Modifiers:** a trait is the main long-lived modifier source, such as a fast healer, a
  clotting disorder or a school's affinity.
- **Grants:** pools, abilities and effects. A school grants the mana pool, so a character
  without magic carries no empty pool.
- **Requirements:** attribute and skill levels, and other traits held or not held, so
  perception gates sense traits and intellect can gate a school through one mechanism.
- **Exclusive groups:** schools are one group, and a body is not both a fast and a slow
  healer.
- **Lines:** a trait can replace the one before it, which gives mutation chains and
  attunements in the manner of Magiclysm's, which need levels in two schools.
- **Body cues:** a mutation shows on the body before any list names it.

#### Gaining and losing traits

Each route is a trigger, and every gain rechecks requirements, exclusive groups and lines:

- **Start state:** grants traits once.
- **Earned:** requirements met and a trigger fired, such as reading a text, a ritual or a
  skill level. Content selects per trait whether it arrives when the trigger fires or is
  offered as a choice; a choice needs UI, so it waits for mod UI (gap 9) as creation
  screens do.
- **Mutation:** exposure accumulates as a condition the body owns, rising near lab sites
  and falling slowly. Crossing a threshold draws a gain by weight from a trait category,
  respecting lines and exclusive groups; the engine draws the roll at the threshold.

Requirements are checked at gain against innate plus conditioned values, never current
ones, so a drink or pain never makes a held trait lapse. A held trait stays held until a
cure removes it, a line replaces it, or an effect suppresses it for the effect's lifetime
without removing it, as a dispel or a serum does.

Each held trait is saved with its source and when it was gained, so a removal knows what
it undoes and a save shows how the character came to be. Known traits show on the skills
tab (`src/ui/inventoryTabs.ts`); a mutation surfaces through the body first, so it is
noticed before it is named.

### 5. Mod infrastructure

The magic mod adds content to whichever product it serves (spellbooks in loot, schools in
the start flow): through its own packs in the fantasy product, and through a compatibility
mod in a product it was not written for, such as Deadvox. Most of the mod is new entries,
which need only the content kinds of the other gaps. Gap 4 already removed one patch: a
school grants the mana pool, so no player entry is patched.

#### Packaging

The magic mod and the fantasy product ship first as bundled packs in the repository, as
Cataclysm ships Magiclysm. That keeps folder and URL mods, browser Jsonnet and the mod
authoring tool (`docs/decisions/0008-mod-authoring-tool.md`) off the critical path.
The asset manifest is already per pack (`src/core/assets.ts`, `validateManifest` and
`MANIFEST_PATH`), and validation accepts manifests beyond the base one
(`src/cli/validate.ts`). A bundled mod, though, is a single file with no assets directory
(`src/config/bundled/`), so bundled packs need an assets directory and manifest of their
own, checked as the base pack's are.

#### Pack requirements

The mod declares the packs it requires, and loading will refuse a stack that lacks them
(`docs/pack-split.md`, "Layers"; #637). A compatibility mod requires both the magic mod
and the product it brings it into, which is what lets it settle their clashes.

#### Field patches in two cuts

`docs/decisions/0007-typed-field-patches.md`, "Decision" lands in two cuts:

1. **Commuting additions:** spellbooks into loot tables, sites into map pools
   (`src/core/schema/layouts.ts`, `MapPoolSchema`), schools into start options. Loot rows and pool
   choices need ids, since rows are 0007's first keyed list.
2. **Overrides, removal and derive:** a compatibility mod overrides only where the two
   packs genuinely clash, such as a creature's weakness to fire, and its dependency on
   both is what allows it (`docs/decisions/0007-typed-field-patches.md`, "Conflicts").

The first cut serves the mod in its own product and most of a compatibility mod.

#### Rules

Rules run in the format #313 settles: a trigger, an optional condition and engine
effects (`docs/decisions/0004-content-language.md`, "Mod rules"). The mod needs:

- **Procs:** a hit landing has a chance to apply an effect, through an engine event and a
  random thunk.
- **Conditions beyond worn or wielded,** such as night or standing in water: a predicate
  the mod's timer checks, never a per-tick check.
- **Rituals** as sequences of chained rules.
- **Spells,** as gap 6 sets out.

The engine events it needs: an ability cast; a hit landed and taken; a kill; an effect
applied and expired; a pool emptied; a trait gained and lost; a skill level reached; and
an item worn, removed, wielded and dropped.

Modifiers stack and never set a value: they multiply and add, both commute, so every
mod's modifiers apply and load order cannot change the result. That is this draft's
position on how several mods' modifiers stack, which ADR 0004 leaves open in #313.

#### Mod state

The mod needs little mod state, at most ritual flags. Mod state excludes lists and
free-form records so its size and save shape are checkable at load, a CEL rule never
traverses a list the profile cannot bound, and no two rules dispute an element's order.
A bounded map keyed by content id, open in #313, keeps those properties because its keys
bound its size; per-altar ritual progress would need it.

The only shipped rule mechanism is the scenario event rules; see
`src/core/eventRules.ts`, `advanceEventRules`.

### 6. Spells: abilities with an effect dispatch

A spell is an ability entry plus a rule body. The ability carries cost, the pool it draws
on, cast time and targeting; the body is a rule triggered by the cast, whose effects are
engine verbs. Magiclysm's spell effect types, which the mod follows, are what ADR 0004
calls engine verbs, and per-level scaling, such as damage rising by a step per level, is
an effect argument, so spells are the first heavy consumer of #313's rule format rather
than a parallel system.

Which abilities an actor knows, each with its level and practice, is engine state like
skills, because engine mechanisms read it: cast dispatch, the quickbar, trait grants
(gap 4), practice and the spell list. Mod state is for a mod's own rule bookkeeping that
no mechanism reads.

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

Elemental schools need fire, cold and electric hits. Damage kinds are a closed code list,
and the body's responses are tables keyed by every kind, so adding a kind means editing
every table, and under field patches two mods adding kinds would each have to know them
all; see `src/core/body.ts`, `DAMAGE_KINDS` and `MELEE_DAMAGE_KINDS`, and
`src/core/schema/body.ts`, `perDamageKind`. Creature resistance has a fixed shape for the
melee kinds plus a separate acid special case; see `src/core/schema/zombies.ts`,
`MeleeDamageResistanceSchema`, and `src/core/zombies.ts`, `acidDamageToZombie`. Blasts
always deal one kind; see `src/core/zombies.ts`, `ZombieSystem.detonate`. Wearable
protection is already keyed by kind and optional (`src/core/wear.ts`).

- **A kind owns its responses.** A damage kind is a content entry carrying its shock,
  pain, bleeding chance and outer-wear multiplier, and the body holds no per-kind tables.
  A mod adds a kind with one entry and patches nothing, the same inversion
  `docs/magic-mod.md`, "Skills and the resolver" makes for skills.
- **Any kind can come from a weapon.** There is no melee subset; content chooses what a
  weapon deals.
- **One resistance shape:** an optional resistance per kind and region, defaulting to
  none, on any actor. Acid becomes an ordinary kind. Resistance is a modified effect, so a
  fire ward or a cold-adapted mutation is a modifier.
- **One kind per hit.** A hit keeps one kind, so the wound model is unchanged; a flaming
  sword cuts, and its enchantment's proc rule applies burning (gap 5).
- **Behaviour on the actor is content:** a kind applies effects on hit (gap 2), with a
  chance or strength that scales with damage: burning as damage over time, chilled as
  slowing modifiers in the impairment layer, a stun from electric.
- **Every damage source names its kind:** blasts, projectiles, damage over time and
  overdraw consequences, so a fireball is a blast of kind fire.
- **Presentation belongs to the kind:** its cause wording (`INTERFACE.md`, "Text"),
  sounds, decals and body cues.

Behaviour on the world, such as igniting and spreading fire, freezing water or conducting
through it, is engine work outside this draft. A kind would select such a reaction from
engine vocabulary, and block and furniture materials would carry their response to each
kind.

Deadvox's planned resistant zombie types in `DESIGN.md`, "Types are data", need the same
opening.

### 8. Creature abilities, factions and allies

Creature stats are content, but abilities and body models are closed code lists, and the
AI targets only the player character; see `src/core/schema/zombies.ts`, `ZOMBIE_ABILITIES`;
`src/core/zombieModels.ts`, `ZOMBIE_MODELS`; and `src/core/zombies.ts`, `ZombieMode`.
Summons and raised dead need factions and target choice, the deepest change here, so it
comes last.

### 9. UI and world presentation

- **Spell list:** the inventory tabs are a closed list; see `src/ui/inventoryTabs.ts`.
- **Mana readout:** `src/ui/playHud.ts`, `playNeedsText`. `INTERFACE.md`,
  "Diegesis and development", favours bodily cues, so how mana feels on the body is
  settled before a bar is added.
- **Transient light:** light spells and glowing projectiles need a world light source that
  is not an item or a fixture; see `src/core/illumination.ts`, `IlluminationScene`.
- **Mod UI by content:** mods bring screens and widgets through content alone, with no
  engine change, so a start flow, a spell list or a mana readout is mod content rather
  than a closed code list. `docs/decisions/0004-content-language.md`, "Mod rules", defers
  mod UI to a spike once #313 settles the expression language.

## Order

Gaps 1 to 4 serve Deadvox as well (wound-care traits, drug effects, mutation, resistant
zombie types), so they need not wait for the magic mod to be scheduled. Spells (gap 6) wait for the #313
vocabulary and field patches (gap 5). Damage kinds can land whenever a fire or cold source
needs them, and allies come last.
