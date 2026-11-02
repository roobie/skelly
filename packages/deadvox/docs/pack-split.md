---
read_if:
  - you split Deadvox content into core, theme, product and scenario mods (#637)
  - you replace content ids or setting names in TypeScript with capabilities
  - you classify creature, ranged, vehicle, sound or damage-kind content
  - you change skill providers, combat policy, starts or pack save identity
  - you plan the gated SkellyEngine runtime and content extraction (#1532)
---

# Product and shared content packs

This is the content-extraction plan for #637 within the single framework refactor
owned by #1532. The product model, names, tier identities, consumer roster and
execution gate belong to
`docs/decisions/0009-content-defined-products.md`. Products share mechanisms
without inheriting Deadvox's setting, and reusable definitions must not carry a
product's distribution policy.

## Layers

The engine holds mechanisms and no content. Core and theme mods provide reusable
content by topic; product mods provide the setting's own content and policy; scenario
mods provide a run, map or test flow. Deadvox is the product/setting, and Upheaval is
its sandbox campaign scenario. An ordinary top-level entry pack declares the product's
dependencies and chooses its default scenario and start. Metadata marks the entry as
a product; anyone can author one.

First-party ids use `skelly.*`, named for their content. The manifest, not the id,
declares core, theme, product or scenario tier; see
`docs/decisions/0009-content-defined-products.md`, "Mod identity and tiers".
There is no catch-all core pack and no shared-scenario pack. Content reused by several
scenarios moves into product topic mods; content reusable across products belongs in
shared topics rather than a product namespace.

**No privileged core.** A stack may replace shared providers when its dependencies
supply every required capability. Core-tier content has neither protection nor
special override rights. One rule for all mods avoids binding products to a particular
provider's identity. One rule for every pack is simpler than a privileged core.

**Dependencies follow ownership.** Reusable definitions reference their own or lower
layers, never the products or scenarios that distribute them. Consumer wiring declares
the packs it uses; the entry pack selects the stack. An engine mechanism references no
content id. These directions keep a theme usable without importing a product's starts
or loot and keep load order out of filename conventions. Admission must refuse missing
dependencies and undeclared overrides through the shared loader; see
`docs/decisions/0007-typed-field-patches.md`, "Conflicts".

## Classification rule

Classify entries, not files. Split a mixed file rather than moving its dependencies
upward by accident. The consumer roster in
`docs/decisions/0009-content-defined-products.md`, "Classification guide",
is guidance, not a permanent whitelist.

**Definitions and distribution have different owners.** A reusable item's definition
belongs to a core or theme topic even when Deadvox first uses it. Loot, shops, sites,
prices and recipe availability belong to a product or scenario. Topic definitions may
mix eras; player-facing lists filter to the product's used content rather than exposing
every definition. No exclusion mechanism or era axis duplicates distribution.

**References constrain placement.** A definition cannot sit below the content it
references. Reclassifying the referenced content requires its own consumer justification,
not a side effect of moving its referrer. A scenario's exclusive entries stay in its
scenario mods; reuse by two or more scenarios moves them down to product topic mods.

**Skill entries are never core content.** Skill support must work with zero skills.
A product declares its skills; interactions with them use mechanism roles rather than
promised built-in skill ids. Referencing a role does not provide its skill: an item pack
that a conjuring skill produces from declares the interaction against the role owner
without taking over its provider. Entries dependent on skills stay outside core too,
so a core validation stack needs neither hidden skill requirements nor duplicate
skill-free variants.

**Tunables follow their mechanism's content owner.** Shared body, senses and needs
tuning belongs in shared topics. Product policy belongs in product content. A mod can
change either by depending on the owner and declaring the override; the overriding
mod owns the consequences. Actor modifiers remain a mechanism, not the only permitted
way to change tuning (`PILLARS.md`, "Content forward compatibility").

### Hard cases

**Ranged combat.** Aim, projectile flight, ballistics, noise and firearm actions remain
engine mechanisms. Their reusable tuning belongs in shared topics. Firearms, ammunition,
attachments and explosives are reusable theme definitions, not automatically Deadvox
content; a medieval product can instead select bows using the supported ranged
mechanisms. Product distribution determines their availability. The firearms skill and
combat policy belong to the product, separately from the mechanisms they modify. See
`docs/decisions/0006-firearm-handling.md` and "Skill providers".

**Creature framework.** Senses, attention, modes and attacks are reusable mechanisms;
zombie types are Deadvox content. Replace setting model names with body-plan capabilities,
footstep picklists with declared sound families, and fixed settlement types with claimed
spawn roles. The section is named `actors` so it can hold non-zombie types and NPCs.
Relevant owners are `src/core/schema.ts`, `ZombieSchema` and `zombieRegionsMatchModel`;
`src/core/zombies.ts`, `ZombieSystem`; `src/core/zombieModels.ts`, `ZOMBIE_MODELS`;
`src/core/settlementSpawns.ts`, `HORDE_TYPE` and `WANDERER`; and the realization/rendering
boundaries in `src/core/zombiePose.ts` and `src/render/mobActors.ts`. Their capabilities
must admit a new content id selecting an existing mechanism without code changes.

**Ability composition.** The wind-up, projectile and ground hazard behind acid spit
are general mechanisms; acid presentation and type-specific resistance are content.
Their composition and part names wait on the CEL rule design in #313, because designing
a competing composition model first would duplicate that work. The extraction moves
values without preemptively redesigning the ability's shape or name. See
`docs/acid-zombie.md`, "Ability, not type".

**Damage kinds are content.** Packs declare kinds and their classes; code owns only
the classes. Replace `src/core/body.ts`, `DAMAGE_KINDS` and `MELEE_DAMAGE_KINDS`, and
`src/core/schema.ts`, `ZombieSchema.acidResistance`, with declared-kind lookup and
resistance keyed by kind. Fire or poison must not need a code edit merely to be named.

**Sounds.** A sound follows the entry selecting it: shared body/block sounds belong
with their shared content, reusable weapon sounds with their theme, and zombie-specific
sounds with the product. Mechanisms read selections from triggering entries and
validation rejects missing selections there. Remove setting prerequisites from
`src/core/soundEvents.ts`, `SOUND_EVENT_IDS`, and `src/core/content.ts`,
`REQUIRED_CORE_CONTENT`; don't keep an all-product event whitelist.

**Terrain, sites and transport.** Natural blocks and vegetation are shared content;
manufactured materials may be thematic. A site's distribution and authored run remain
product or scenario content even when its component definitions are shared. Reusable
transport and parts are shared; a product's own vehicles remain product content.
Classify references entry by entry rather than moving every vehicle or furnished house
into one tier.

## Skill providers

**One skill provider per mechanism role.** At most one live skill in a stack drives
a role such as aiming or handling. This replaces fixed skill ids without making every
item name a skill or inventing a combination rule for several providers.

**Competing providers fail closed.** A takeover requires a declared override and a
direct or transitive dependency on the role owner. An unrelated second provider is a
load error naming the role, both packs and the fix. Load order alone never decides.
The replaced skill leaves the live skill list, gains no progression and has no saved
state: restore under a different pack set is refused, so hidden state would have no
valid return path. This shares the field-patch conflict rule in
`docs/decisions/0007-typed-field-patches.md`, "Conflicts".

**Combat policy is product content.** Engine mechanisms such as aiming, blocking and
handling do not own a product's sway or penalty policy. Skills modify that policy;
a product can use it without a skill system. A core-only validation stack has no
modifiers and does not imply a playable product.

**Zero skills preserve Body.** The skill list stays empty beside the body/injury
panel, because hiding the Skills tab would hide health information. See
`src/ui/inventoryScreen.ts`, `InventoryScreen`.

## Capabilities, not ids

A capability is a property an entry claims and a mechanism selects. Code owns the
implemented capability set; content owns its claimants. Admission rejects missing
required claimants and claims lacking their required data. This preserves the
content-versus-mechanism boundary without silently accepting unsupported behavior.

The extraction covers required ids (`src/core/contentIds.ts`, `CORE_CONTENT_IDS`;
`src/core/content.ts`, `REQUIRED_CORE_CONTENT`), setting-name schema picklists,
body/render branches and debug loadouts (`src/debug/debugLoadout.ts`,
`equipDebugLoadout`). Mechanism names describe behavior rather than setting or
scenario identity; see `docs/decisions/0009-content-defined-products.md`,
"Vocabulary". #393 owns the bounded tunables inventory, not a parallel list here.

## Core-alone validation

Validate a stack of the selected core-tier topics without product skills, actors,
weapons or scenario content. It must report zero issues from both
`src/core/content.ts`, `buildRegistry` and `requiredContentIssues`: registry
construction can discard broken files, so a registry existing is not proof of
validity. This check keeps upward references out of shared content.

Do not boot or play the core-only stack. It intentionally lacks a scenario and start;
adding them merely to test core would reintroduce consumer dependencies. Manifest,
model and sound checks apply per pack; static reachability applies to playable stacks
(`docs/content.md`, "Static reachability").

## Refactor workstreams

#1532 delivers runtime extraction and content separation together after its PR gate.
These workstreams preserve #637's proof obligations within that one refactor:

- **Pack boundaries:** replace setting requirements with capability ownership and prove
  shared-provider validation. Bundled intake uses the common manifest and fail-closed
  entry conflicts in `src/core/packAdmission.ts`, `admitPacks`; topic extraction must
  preserve that boundary rather than flattening packs into files. Typed field patches
  remain separate work under `docs/decisions/0007-typed-field-patches.md`, "Implementation ownership".
  Folder fetchers, remote-origin policy, binary provenance and atomic cleanup remain
  prerequisites of folder intake under `docs/decisions/0008-mod-authoring-tool.md`, "Build plan";
  bundled admission is not URL-folder support.
- **Sound selection:** an entry naming an absent sound must be rejected at that entry;
  shared content must validate without product sound rows.
- **Actors and damage:** prove a new actor id using an existing body plan is admitted
  without a code edit, and a shared stack needs no zombie type. Replace model-name
  generator keys with body-plan identity.
- **Ranged content and policy:** shared content validates without firearms. Preserve
  full-product firing and grenade behavior in an existing browser flow while product
  skills read through roles and debug kits become content.
- **Scenario starts and reuse:** each playable stack validates with reachability, while
  its lower-layer dependencies validate without a scenario. Starts, including initial
  recipe knowledge, belong to scenarios; several starts can share one scenario. The
  entry pack selects its default. Reused scenario content moves to product topic mods,
  never a shared-scenario pack. Coordinate the start path with `docs/url-mods.md`,
  "Start state in mods".
- **Provider substitution:** an alternative stack supplying the required capabilities
  validates without the default shared providers. A missing claimant must be refused
  with its capability named.

The refactor's acceptance includes the unit suite, full-stack validation, save round
trip and independent and mixed ground-based stacks. Space feasibility is deferred
under `docs/decisions/0009-content-defined-products.md`, "Saves and proof scope".

## Save identity

Record each admitted pack separately and in order so a refusal can identify the
changed pack; see `src/core/saveFormat.ts`, `currentSaveVersionIdentity` and
`contentPackDifferences`. Scenario and product topic packs use the same identity rule.
This remains pack-list identity until #1395 implements evaluated-content identity
under `docs/decisions/0008-deterministic-world.md`, "Decision". Generator identity
follows body plans rather than setting model names. Save-store policy is unchanged;
see `docs/decisions/0009-content-defined-products.md`, "Saves and proof scope".
No pre-beta migration is owed (`AGENTS.md`, "Project stage: pre-pre-alpha, no backwards compatibility").

## Open follow-ups

- Ability composition and part names wait on #313's CEL rule design; the extraction
  must not preempt that design.
- #1532 owns measuring when a topic mod becomes too large for products using little
  of its content. Era-mixed definitions are not a reason to add an exclusion mechanism.
