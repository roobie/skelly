---
read_if:
  - you split Deadvox content into core, theme, product and scenario mods (#637)
  - you replace content ids or setting names in TypeScript with capabilities
  - you change default weathering selection or shared versus product weathering ownership
  - you classify creature, ranged, vehicle, sound or damage-kind content, including drop-sound receivers and item character
  - you separate actor body state from decision memory and its save representation
  - you author or persist actor bodies with or without decision tuning
  - you name body-plan mechanisms descriptively or separate anatomy, leg cuts and figure builds
  - you change settlement role claims or melee pose selection
  - you change skill providers, combat policy, starts or pack save identity
  - you change the browser, validation or build-stamp pack closure
  - you add a debug mod, change how opt-in folder mods are selected or add catalogue rows
  - you plan SkellyEngine runtime and content extraction
  - you place a recipe, power tuning, a manual or a household electrical device in a mod
  - you change when a stack needs site generation or what core-alone validation requires
---

# Product and shared content packs

This is the content-extraction plan for #637 within the single framework refactor
owned by #1532. The product model, names, tier identities and consumer roster belong
to `docs/decisions/0009-content-defined-products.md`. Products share mechanisms
without inheriting Deadvox's setting, and reusable definitions must not carry a
product's distribution policy.

## Layers

The engine holds mechanisms and no content. Core and theme mods provide reusable
content by topic; product mods provide the setting's own content and policy; scenario
mods provide a run, map or test flow. Deadvox is the product/setting, and Upheaval is
its sandbox campaign scenario. An ordinary top-level entry pack declares the product's
dependencies and chooses its default scenario and start. Metadata marks the entry as
a product; anyone can author one.

The browser admits only the entry pack's dependency closure plus selected opt-in
closures. Loading, validation, build stamps and saved identity must agree on that
selection: an unrelated folder must not change the game or invalidate a save.
The shared closure boundary is `packages/engine/src/core/packAdmission.ts`,
`selectFolderClosure`; product wiring is in `src/product/packSelection.ts`,
`selectAvailableProductPacks`, and validation uses `tools/readBundledPacks.ts`,
`readBundledPacks`. The build may prepare proofs and hashes for selectable opt-ins,
but their presence alone does not admit them. The entry is the one pack whose
dependencies may sit in a higher tier than its own: it selects the stack rather
than defining reusable content.

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
the packs it uses; the entry pack selects the stack. A mod declares every mod its own rows
reference, a tool quality a recipe needs included, so its closure builds alone; only a
missing core capability may wait for the rest of core. An engine mechanism references no
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
every definition. Editing rows out of an included mod waits for #1544's typed
patches and entry removal under `docs/decisions/0007-typed-field-patches.md`.
Until then a row stays loaded while the product leaves it out of distribution and
player lists filter to what the product uses; filtering is not registry removal.

**References constrain placement.** A definition cannot sit below the content it
references. Reclassifying the referenced content requires its own consumer justification,
not a side effect of moving its referrer. A scenario's exclusive entries stay in its
scenario mods; reuse by two or more scenarios moves them down to product topic mods.
Each shared topic gets its own topic-sized product mod rather than joining a broad one such
as buildings or rural sites, so a scenario that shares one topic loads it without also
importing an unrelated topic; see
`mods/skelly.deadvox.woods/pack/manifest.jsonnet` and
`mods/skelly.deadvox.labs.underground/pack/manifest.jsonnet`.
An id that moves into a product mod drops the scenario's name in the same move, with no
alias, because reusable definitions start under their shared topic identity; see
`docs/decisions/0009-content-defined-products.md`, "Definitions and distribution".
A file in a product mod drops the scenario's name too, so every move checks file names as
well as ids: a scenario name on a product file misleads the reader, and a search for the
scenario finds product files.
The three range rows are one set that travels whole, so they sit together in the base building
owner rather than split across mods at each row's users; see
`mods/skelly.deadvox.buildings/furniture.jsonnet`, `range_table`.
The folded note model sits beside the other readables, below all its users across camp and
scenarios, so no scenario must depend on camp to show a note; see
`packages/mods/skelly.readables/models-readables.jsonnet`, `folded_note`.
The shipped-mod dependency test enforces tier direction without granting the loader
privilege; see `test/shippedMods.test.ts`. Outside mods remain unguarded by this
repository-only check, an accepted trade-off for a privilege-free loader.

**Skill entries are never core content.** Skills belong in theme topics. A product
chooses available skills through its dependencies, as for any content: the registry
is the plain sum of loaded mods, with no separate skill list. Core rows cannot name
a skill id because skills are never core content; mechanism roles keep those rows
valid with zero skills. A role with no provider adds no requirement. Theme rows may
name skill ids through declared dependencies, so admission checks those references
at load. Referencing a role does not provide its skill or take over its provider.
See `packages/engine/src/core/recipeSkills.ts`, `recipeSkillRequirements`; `packages/engine/src/core/disassembly.ts`,
`planDisassembly`; `packages/engine/src/core/prying.ts`, `pryPlan`; and `packages/engine/src/core/capabilities.ts`,
`CONTENT_CAPABILITIES`.

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
mechanisms. Product distribution determines their availability. The firearms skill belongs in its theme topic; combat policy belongs to the product,
separately from the mechanisms they modify. See
`docs/decisions/0006-firearm-handling.md` and "Skill providers".

**Creature framework.** Senses, attention, modes and attacks are reusable mechanisms;
zombie types are Deadvox content. Body plans name anatomy by shape, not behaviour or
character, so another product can reuse a figure without inheriting Deadvox's setting.
Product content ids may keep setting names. Speed, gait and size are figure properties,
not reasons to invent another anatomy. Cut legs do not create a new plan: a legs-cut
humanoid remains humanoid, with its cut and crawl posing selected by its built body.
Build words describe the figure rather than its behaviour or character. Figure variants
retain those realizations without making actor identity select implementation. See
`packages/engine/src/core/actorModels.ts`, `BODY_PLANS`, `FIGURE_VARIANTS`, `figureVariantOf` and
`bodyPlanModel`; `packages/engine/src/core/legLoss.ts`, `crawlsAfterLegLoss`;
`packages/engine/src/core/actorPose.ts`, `actorCrawls`; and `packages/engine/src/core/schema/actors.ts`, `ActorSchema`
and `actorRegionsMatchModel`.
The body/Agent ownership rule belongs to
`docs/decisions/0009-content-defined-products.md`, "Vocabulary". See
`packages/engine/src/core/schema/actors.ts`, `ActorSchema`; `packages/engine/src/core/actorState.ts`, `Actor`,
`ActorState` and `snapshotActor`; `packages/engine/src/core/agentSave.ts`, `snapshotAgent`; and
`packages/engine/src/core/actorMotion.ts`, `canStartBodyAttack`, `setActorChaseStance`,
`turnActorBodyLook` and `turnActorHeadLook`.
Saved presence must match content presence: otherwise restore would silently add
or discard a controller. See `packages/engine/src/core/actorSystem.ts`, `ActorSystem.restoreState`, and
`packages/engine/src/core/saveFormat.ts`, `wirePayloadSchema`.

Settlement population requests require their claimed providers only when that population
is selected, so shared content needs no actor merely to validate; see
`packages/engine/src/core/settlementSpawns.ts`, `settlementHordeSpawn` and `settlementActorSpawns`,
and `packages/engine/src/core/capabilities.ts`, `capabilityIssues`. Declared sound families let another
actor reuse surface responses without pretending to be a particular creature; see
`packages/engine/src/core/footsteps.ts`, `footstepEventForBlock`.

**Ability composition.** The wind-up, projectile and ground hazard behind acid spit
are general mechanisms; acid presentation and type-specific resistance are content.
Their composition and part names wait on the CEL rule design in #313, because designing
a competing composition model first would duplicate that work. The extraction moves
values without preemptively redesigning the ability's shape or name. See
`docs/acid-zombie.md`, "Ability, not type".

**Damage kinds are content.** Naming a kind must not require a code edit. Admission
checks declarations and class compatibility, while content owns response tuning and
actor resistance; see `packages/engine/src/core/schema/damageKinds.ts`, `DamageKindSchema`,
`packages/engine/src/core/damageContent.ts`, `checkDamageKinds`, and `packages/engine/src/core/actorSystem.ts`,
`damageToActor`. A weapon's animation mechanism is a separate content selection, so
adding a melee kind does not imply adding a pose; see `packages/engine/src/game/melee.ts`,
`meleeProfileForWeapon`. Every declared kind works on both bodies and terrain:
there must be no silent no-effect pair. Complete response maps make admission catch
missing pairs before a hit reaches a runtime error; see `packages/engine/src/core/damageContent.ts`,
`checkDamageKinds`, `packages/engine/src/core/body.ts`, `damageResponse`, and
`packages/engine/src/core/schema/blocks.ts`, `BlockMaterialSchema`.

Authored defaults reuse the nearest existing injury response rather than introducing
another balance decision: force follows blunt, fragments follow pierce, and block
acid follows pierce except where cloth's acid vulnerability calls for its own response.
These values do not change play until an attack selects the added pair. Explicit
neutral actor maps preserve the existing absence-of-resistance behavior, while the
acid actor keeps its authored immunity. See `packages/mods/skelly.body/body.jsonnet`, `responses`,
`packages/mods/skelly.natural-world/block-materials.jsonnet`, `materials`, and
`mods/skelly.deadvox.actors/enemies.jsonnet`, `neutralDamageResistance`. Missing tuning is not
permission to invent resistance or injury responses.

**Item wear.** The one wear row every presented model selects sits in `skelly.inventory`,
because a mod of its own would add a dependency and narrow nothing that matters. So anything
with a model, `skelly.body` too, loads inventory tuning and the work-in-progress item. See
`packages/mods/skelly.inventory/item-wear.jsonnet`, `classes`.

**Food.** Packaged means any wrapped or canned food, and `skelly.packaged-foods` depends on
`skelly.hand-tools` so a tool-opened can always finds an opener. Portions stay with their
vessel, so the two food mods share no edge. `skelly.basic-foods` never depends on hand tools.
See `packages/mods/skelly.packaged-foods/pack/manifest.jsonnet`, `dependencies`.

**Keys.** A key is content of whichever pack holds its lock-bearing door, not of core
structures. Validation requires every key to name a lock some door in the same stack carries,
so a core key whose door sits in a scenario template would fail the core stack alone. The core
key box is a generic container and names no key. See `packages/engine/src/core/content.ts`, `checkKeys`.

**Liquid vessels.** A vessel lists the liquids it takes or takes any liquid the stack loads, so a general container needs no edge to every mod that adds a liquid and no list to maintain. A lamp keeps its list, because what it holds must burn. See `packages/engine/src/core/liquids.ts`, `vesselAccepts`.

**Recipes.** A recipe goes with its output's mod, and a recipe whose output is in core goes to `skelly.basic-recipes`, so one rule places every recipe. The cost is that `skelly.basic-recipes` grows and a recipe spanning two topics makes its mod depend on the other.

**Manuals.** A manual's id names what it is, a manual; its player-visible title stays as authored and need not say "Manual". Every manual sits in one theme mod, `skelly.manuals`, so loading it pulls in each topic its manuals teach. See `packages/mods/skelly.manuals/manuals-items.jsonnet`, `book`.

**Household electrical devices.** Lamps, chargers and fridges share one mod, `skelly.household-electrical`, because many more lamps and small devices will come. Power sources, storage, switches and every device row stay in `skelly.electric-power`, as do items that sources and household devices both use. See `packages/mods/skelly.household-electrical/household-electrical-furniture.jsonnet`, `furniture`.

**Power tuning.** Tuning is a power device's dependency, so a stack with no device owes none and runs no power tick, while a loaded device without tuning fails validation. See `packages/engine/src/core/capabilities.ts`, `requiredForStack`, and `packages/engine/src/game/session.ts`, `createSessionPower`.

**Site generation.** A stack that builds no site needs no site look, so product-free stacks validate clean. A stack holding a start, layout or scenario builds a site, and fails validation without the site-generation row. See `packages/engine/src/core/capabilities.ts`, `requiredForStack`, and `packages/engine/src/core/sitePalette.ts`, `siteGenerationOf`.

**Cursor.** The basic cursor is content presentation, not UI chrome, so it sits in
`skelly.ui`, and a theme or product mod may replace it by data with a styled one. It has
its own row because overrides replace whole rows: a swap restates one short row, not the UI
text row (`PILLARS.md`, "Moddability"). The row carries the layout as well as the image, so
a styled cursor can be any size; the sheet stacks the arrow frame above the hand frame. A
stack without the row fails validation. A winning row whose image cannot be loaded falls
back to the nearest earlier row that can: an unloadable mod cursor should not stop the game,
so the player keeps a working cursor and the log names the mod. See
`packages/engine/src/core/schema/cursors.ts`, `CursorSchema`, and `packages/presentation/src/ui/uiTokens.ts`, `applyUiTokens`.

**Sounds.** A sound follows the entry selecting it: shared body/block sounds belong
with their shared content, reusable weapon sounds with their theme, and zombie-specific
sounds with the product. A block names only the player's own footstep; other footsteps
live in a product section keyed by family and block, because a core block cannot name a
product's actor. A block-adding mod must add rows for every family a loaded actor walks
with, because a silent footstep is a bug that must be refused at load; a block that authors
no footsteps and a family no loaded actor uses need none. Rows merge across mods, and a
scenario's own blocks take their rows from that scenario's mod. See `packages/engine/src/core/footsteps.ts`,
`footstepEventForBlock`; `packages/engine/src/core/content.ts`, `checkFootstepCoverage`;
`mods/skelly.deadvox.actors/footstep-sounds.jsonnet`, `footstepSounds`; and
`mods/skelly.deadvox.scenario.gauntlet.city/footstep-sounds.jsonnet`, `footstepSounds`.
A sound row's file lives in the row's own pack, copied with its credit when packs share it,
so each mod loads with only its declared dependencies. The cost is duplicate bytes, and
replacing a file in one pack leaves the other copies. See `packages/engine/src/core/assets.ts`,
`soundFileIssues`.
A preview-only row that no entry selects goes with its topic, so a door preview sits with the door sounds. The cost is that a stack loading that topic carries a row no event plays.
Mechanisms read selections from triggering entries;
`packages/engine/src/core/content.ts`, `checkActionSounds` and `referenceIssues` reject absent
providers at those fields rather than requiring every product event. Other optional
presentation selections mean silence when omitted, never a borrowed sound. Door
presentation need not alert hearing; forcing it to do so would change quiet doors
merely because their former default became explicit. Search remains a hearing event;
see `packages/engine/src/core/content.ts`, `checkSearchNoise`.
A pile sounds like what it landed on, not the terrain beneath its support. Terrain
blocks, furniture materials and fitted vehicle parts own the same drop-response table.
Items optionally select their own sound character through the open sound-family
registry: a bucket and a casing need not sound alike on the same receiver, and mods
can add characters without changing other entries. Nothing is inferred from material,
size or appearance. Each receiver requires an authored any-item default so an omitted
character or an unlisted pair still plays that receiver's sound, never silence or a
sound borrowed from another item. Air and non-solid terrain cannot receive piles and
need no default. Overlapping vehicle parts need a stable receiver; authored order
supplies it without a separate priority setting. See `packages/engine/src/core/dropSounds.ts`,
`checkDropSounds` and `pileDropSound`,
`packages/engine/src/core/vehicleProjection.ts`, `vehiclePartAt`, and `packages/engine/src/game/audioPresentation.ts`,
`handlingMoveCompleteCue`. Fired-case presentation remains a firearm selection.

**Terrain, sites and transport.** Natural blocks and vegetation are shared content;
manufactured materials may be thematic. A site's distribution and authored run remain
product or scenario content even when its component definitions are shared. A scenario
that wants a wreck in a base site places it there, so the wreck family keeps one owner,
with no hole in its generated set and no twin row; the cost is that base sites have no
car. See `mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-authored-sites.libsonnet`, `wreck`. Reusable
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
handling do not own a product's sway or penalty policy.
Aim feel that applies to everyone is product policy, so each product sets its own; input and view controls stay shared.
Skills modify that policy; a product can use it without a skill system. Expert endpoints belong to skills because
those are what the skills reach; policy owns the unskilled baseline, so a product
without skills needs no ceiling. See `packages/engine/src/core/skillTraining.ts`, `firearmsCombatTuning`
and `meleeCombatTuning`; `packages/engine/src/core/aim.ts`, `playerAimTuning`. A core-only validation
stack has no modifiers and does not imply a playable product.

**Zero skills preserve Body.** The skill list stays empty beside the body/injury
panel, because hiding the Skills tab would hide health information. The panel
sorts skills by name, not load order, so the order stays stable as skills move
between mods. See `packages/presentation/src/ui/inventoryScreen.ts`, `InventoryScreen`.

## Capabilities, not ids

Code owns the implemented capabilities; content owns their claimants. A required
capability must have one live provider, not a promised content id, so a product can
replace providers without changing mechanisms. Competing claimants fail closed
rather than letting load order choose. Unsupported claims and claims without their
required data are invalid. See `packages/engine/src/core/capabilities.ts`, `CONTENT_CAPABILITIES`,
`claimed` and `capabilityIssues`; `packages/engine/src/core/schema/capability.ts`, `capabilityField`;
and `packages/engine/src/core/content.ts`, `requiredContentIssues`.

Provider identity must not widen mechanism dispatch: a weapon class must resolve a
declared melee kind and an implemented pose, so a typo fails admission instead of the
first swing. The unarmed provider may have an independent id; see
`packages/engine/src/core/schema/items.ts`, `MeleeClassSchema`, and `packages/engine/src/core/damageContent.ts`,
`checkDamageKinds`.

A neutral weathering profile belongs in shared content: it is engine-level
presentation that every product needs. Overgrown and benchmark profiles belong to
Deadvox because they express its flavour. The default is a capability, not a profile
id; see `packages/engine/src/core/weatheringUrl.ts`, `resolveWeatheringUrl`. #1532 owns moving the
profiles to their shared and product topics; capability selection does not move
content.

Setting-name schema picklists and body/render branches remain part of #1532's
extraction. Debug kits use the spawn menu or mod-owned start rows; see `docs/url-mods.md`, "Start state in mods". Mechanism names describe behavior rather than setting or
scenario identity; see `docs/decisions/0009-content-defined-products.md`,
"Vocabulary". #393 owns the bounded tunables inventory, not a parallel list here.

## Core-alone validation

Validate a stack of every core-tier mod alone, without skills, actors or
scenario content. It must report zero issues from both
`packages/engine/src/core/content.ts`, `buildRegistry` and `requiredContentIssues`: registry
construction can discard broken files, so a registry existing is not proof of
validity. This check keeps upward references out of shared content.

Do not boot or play the core-only stack. It intentionally lacks a scenario and start;
adding them merely to test core would reintroduce consumer dependencies.
`test/coreOnly.test.ts` picks the core-tier mods by manifest tier, so a new one needs
no test edit. Manifest, model and sound checks apply per pack; static reachability
applies to playable stacks (`docs/content.md`, "Static reachability").

## Package workstreams

These workstreams preserve #637's proof obligations:

- **Pack boundaries:** prove shared-provider validation. Bundled intake uses the common manifest and fail-closed
  entry conflicts in `packages/engine/src/core/packAdmission.ts`, `admitPacks`; topic extraction must
  preserve that boundary rather than flattening packs into files. Typed field patches
  remain separate work under `docs/decisions/0007-typed-field-patches.md`, "Implementation ownership".
  Folder fetchers, remote-origin policy, binary provenance and atomic cleanup remain
  prerequisites of folder intake under `docs/decisions/0008-mod-authoring-tool.md`, "Build plan";
  bundled admission is not URL-folder support.
- **Sound selection:** an entry naming an absent sound must be rejected at that entry;
  shared content must validate without product sound rows.
- **Actors and damage:** prove a new actor id using an existing body plan is admitted
  without a code edit, and a shared stack needs no zombie type. Generator identity
  follows implemented body plans; see `packages/engine/src/core/saveFormat.ts`, `defaultVersion`.
- **Ranged content and policy:** shared content validates without firearms. Preserve
  full-product firing and grenade behavior in an existing browser flow while product
  skills read through roles. Prepared debug kits belong in mod-owned start rows,
  not per-kit base content.
- **Skill providers:** shared mechanisms must work without skills; products choose
  their skill topics through dependencies rather than a second availability list.
- **Core extraction:** shared content must validate independently of product entries,
  so lower-layer reuse cannot silently depend on a particular product.
- **Theme extraction:** product flavour stays product-owned rather than becoming a
  prerequisite for shared mechanisms.
- **Scenario starts and reuse:** each playable stack validates with reachability, while
  its lower-layer dependencies validate without a scenario. Starts, including initial
  recipe knowledge, belong to scenarios; several starts can share one scenario. The
  entry pack selects its default. Reused scenario content moves to product topic mods,
  never a shared-scenario pack. A scenario row names no start, and each start row
  carries its own placement, so another start can reuse the city and the only edge
  runs from start to city. A scenario's city and its start may therefore be separate
  mods, so that another start can reuse the city without loading the first start; the
  gauntlet is split this way.
  Validation follows that ownership: the scenario row answers for its city and each
  start row for its placement. City checks certify without a start, while playable-run
  checks need the selected start. See `packages/engine/src/core/schema/starts.ts`, `StartSchema`;
  `packages/engine/src/core/startIssues.ts`, `startIssues`; and `packages/engine/src/core/scenarioCertificate.ts`,
  `scenarioCityCertificate`. Coordinate the start path with `docs/url-mods.md`,
  "Start state in mods".
- **Provider substitution:** an alternative stack supplying the required capabilities
  validates without the default shared providers. A missing claimant must be refused
  with its capability named.

The refactor's acceptance includes the unit suite, full-stack validation, save round
trip and independent and mixed ground-based stacks. Space feasibility is deferred
under `docs/decisions/0009-content-defined-products.md`, "Saves and proof scope".

## Debug mods

A debug mod uses the opt-in marker so it remains selectable without becoming an
entry dependency that changes normal play. The marker is not a tier, grants no
privilege and is never inferred from the id; ordinary dependencies still determine
what a selected pack needs. See `packages/engine/src/core/packAdmission.ts`,
`PackManifestSchema`.

A marked pack loads only when `?mods=` or a CLI stack names it. Selection walks the named
pack's dependencies over every shipped pack and drops those the default set already
holds, so a marked pack may depend on another marked pack and each loads once.
Selection invents nothing: ordinary admission then refuses a missing dependency or a
cycle, and folder packs never pass through the single-file mod reader. See
`packages/engine/src/core/packAdmission.ts`, `selectFolderClosure`, and `packages/engine/src/game/bundledMods.ts`,
`selectBundledMods`.

Selected opt-ins reuse build-time identities, including dependencies outside the
entry closure, so selecting a pack never invents an identity or omits its dependencies.
See `tools/readBundledPacks.ts`, `bundledPackDefines`.

Each scenario's debug mod depends only on that scenario and the tiers below, so none but
the test house's may override the test-house layout. A scenario split into city and start
mods keeps one debug mod that depends on both halves, as the gauntlet's does. Furniture
owned by product, theme or core mods belongs to no scenario, so its debug rows live in one
product debug mod, `skelly.deadvox.scenario.debug`. It depends on product mods and below
only; its tier is scenario because it is a test flow, although its id names no scenario.

Debug furniture therefore goes in catalogue rows, a content section any mod can add to
without an edge to the test house, and the test-house debug showroom is the one view of
every loaded row. The section is an engine mechanism, not a mod's row, so using it adds no
dependency; a row's furniture still constrains placement like any reference, and rows
override by id like other entries. A debug mod's rows show only when the test-house debug
mod is selected too, and the grid lays rows out in load order. See
`packages/engine/src/core/schema/catalogueRows.ts`, `CatalogueRowSchema`, and `packages/engine/src/core/showroom.ts`,
`ShowroomCatalogue`.

## Save identity

Record each admitted pack separately and in order so a refusal can identify the
changed pack; see `packages/engine/src/core/saveFormat.ts`, `currentSaveVersionIdentity` and
`contentPackDifferences`. Scenario and product topic packs use the same identity rule.
Identity records only admitted packs, including every dependency of a selected opt-in,
in admission order. An available but unselected debug mod must not affect save identity;
a world saved with one resumes only with it.
This remains pack-list identity until #1395 implements evaluated-content identity
under `docs/decisions/0008-deterministic-world.md`, "Decision". Generator identity
follows body plans rather than setting model names, so renaming an actor does not
pretend its generator changed. Saved damage references resolve against the admitted
kind declarations rather than a code enumeration; see `packages/engine/src/core/saveFormat.ts`,
`validateContentReferences`. Save-store policy is unchanged;
see `docs/decisions/0009-content-defined-products.md`, "Saves and proof scope".
No pre-beta migration is owed (`AGENTS.md`, "Project stage: pre-pre-alpha, no backwards compatibility").

## Open follow-ups

- Ability composition and part names wait on #313's CEL rule design; the extraction
  must not preempt that design.
- #1532 owns measuring when a topic mod becomes too large for products using little
  of its content. Era-mixed definitions are not a reason to add an exclusion mechanism.
