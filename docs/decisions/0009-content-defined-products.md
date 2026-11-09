---
read_if:
  - you change SkellyEngine's boundary, product entry packs or shared content ownership
  - you classify mods, choose their ids or combine a theme with a product
  - you change remote mod intake, product save separation or the framework refactor gate
  - you name reusable mechanisms, runtime storage and build contracts, descriptive actor body plans or content-selected providers
  - you separate actor bodies from agent decisions, memory and save ownership
  - you change scenario guidance, observations, staging or authored start admission
  - you change attempt recording or snapshot diagnostics
---

# 9. Content-defined products on one composable framework

## Decision

Skelly is the monorepo. **SkellyEngine** is the engine plus mod framework. Products
are content stacks on that framework, not forks of its mechanisms. This is the
framework direction in #1532: different moods, technology levels and kinds of play
need different content without duplicating the runtime. A new content entry selects
existing mechanisms; a missing mechanism still needs engine work under `PILLARS.md`,
"Content forward compatibility".

A product is an ordinary top-level mod, or entry pack. Its dependencies supply its
stack, and metadata marks it as a product. Anyone can make one. Using the same pack
contract avoids a second artifact kind and a first-party-only product boundary.
The entry pack names its default scenario and start; it does not own a second
startup mechanism.

Deadvox is the product and the setting. Upheaval is its grand sandbox campaign
scenario, not a setting pack. Product mood and distribution therefore do not leak
into content meant for other products.

## Mod identity and tiers

`skelly.*` identifies first-party mods; third parties use their own prefix. Names
say what content a mod holds. Core-tier examples use topic names such as
`skelly.attributes`, never `skelly.core` or a catch-all core namespace. Theme names
such as `skelly.magic` and `skelly.survival` identify reusable topics. Product-owned
content uses `skelly.PRODUCT.*`; scenario-owned content uses
`skelly.PRODUCT.scenario.SCENARIO.*`, such as
`skelly.deadvox.scenario.upheaval.points-of-interest`.

The manifest declares the tier: **core**, **theme**, **product** or **scenario**.
An id is not a tier discriminator. The scope in a product or scenario name identifies
its owner; the loader must not infer its tier from that spelling. Consumer judgments
can change as products appear, and encoding the tier in identity would turn
reclassification into dependency and save breakage. Theme and product names can also
share one id shape and clash, so spelling cannot distinguish their tiers.

Core-tier topics are useful across almost all products. Theme mods are reusable but
not universal. Product mods own a setting's content and policy; scenario mods own a
particular run, map or test flow. No tier grants protection or loader privilege.
Each product chooses its dependencies rather than inheriting one mandatory core pack.

## Definitions and distribution

Shared topics live under `packages/mods`; product and scenario mods live under the
product's own mod root so removing a product leaves shared definitions intact.
The shared root is one workspace package, giving mod-wide scripts one home rather
than a package per content topic; see `packages/mods/package.json`.
A mod folder equals its full manifest id to keep paths and grep in step. The folder
name has a path-budget cap checked by `packages/deadvox/test/shippedMods.test.ts`,
so a short Windows checkout root leaves room inside mods under MAX_PATH.

Cut reusable content by topic and consumer. A topic mod declares dependencies on
other topics it uses, so a vehicle's fuel or a firearm's ammunition is not a hidden
cross-pack reference. Reusable transport and parts belong in shared content;
product-specific vehicles belong in that product, classified entry by entry.

**Definitions are inert.** A topic may mix eras. Products and scenarios decide what
appears through loot, shops, sites and other distribution; recipe availability is
also distribution. Scarcity, placement and prices belong to that consumer, not to
the generic object's definition. Player-facing lists, including spawn menus,
encyclopedias and crafting books, filter to what the product uses. Editing rows out
of an included mod waits for #1544's typed patches and entry removal under
`docs/decisions/0007-typed-field-patches.md`. Until then the row stays loaded:
the product leaves it out of distribution and player lists filter to what the
product uses. Distribution filters do not remove definitions from the registry.

Reusable definitions start under their shared topic identity, rather than under a
product name that must later be renamed. Content reused by two or more scenarios
moves down to a product mod named for what it holds. There is no shared-scenario
pack: a product can contain several topic mods, so reuse does not require a reserved
scenario name or one growing catch-all pack. Shared libraries do not depend on the
product or scenario that distributes them; consumer wiring declares its dependencies.

### Classification guide

This roster is a starting guide, not a content contract or a promise of implemented
mechanisms. The other products are hypothetical consumers: MW is Morrowind-inspired,
BL is Bannerlord-inspired and EM is Empyrion-inspired. DV is Deadvox, a real-time 3D
voxel take on CDDA, possibly multiplayer later. All use the same engine. A check means
expected use, a tilde means possible use, and a dot means no expected use. Consumer
evidence governs classification, not perfect adherence to the table.

| Content | DV | MW | BL | EM | Ownership guide |
|---|---|---|---|---|---|
| Body, injuries, bleeding, needs, senses, player tuning | ✓ | ✓ | ✓ | ✓ | Core topics |
| Inventory, compression, saves, day cycle, controls, UI, graphics policy | ✓ | ✓ | ✓ | ✓ | Core topics |
| Natural blocks and vegetation | ✓ | ✓ | ✓ | ✓ | Core topics |
| Doors, locks, ladders, stairs, basic furniture | ✓ | ✓ | ✓ | ✓ | Core topics; appearance varies by era |
| Creature senses, attention and attack tuning | ✓ | ✓ | ✓ | ✓ | Core topics; mechanisms stay in the engine |
| Blades and blunt melee weapons | ✓ | ✓ | ✓ | · | Theme |
| Hand tools | ✓ | ✓ | ✓ | ✓ | Topic definitions may mix eras |
| Food, wearables and readables | ✓ | ✓ | ✓ | ✓ | Topic definitions may mix eras |
| Firearms, ammunition, attachments and gun parts | ✓ | · | · | ~ | Theme; also useful to an 80s Miami police product |
| Explosives | ✓ | · | · | ✓ | Theme |
| Manufactured blocks (concrete, asphalt, steel) | ✓ | · | · | ✓ | Theme |
| Electric power content | ✓ | · | · | ✓ | Theme |
| Ground motor vehicles | ✓ | · | · | · | Theme; also useful to an 80s Miami police product |
| Magic | Opt-in | ✓ | · | · | Theme; #1528 is a reference consumer |
| Mounts, armies and factions | · | ~ | ✓ | · | Theme direction, not delivered mechanisms |
| Ships and space | · | · | · | ✓ | Deferred theme direction |
| Zombie types, loot tables, site generation, camp and rural sites | ✓ | · | · | · | Product |
| Gauntlet, tutorial, playtest and test house | ✓ | · | · | · | Scenario |

Skills belong in theme topics; products select their available skills through ordinary
mod dependencies, rather than a separate skill configuration or registry filter.

The roster classifies content and tuning, not engine code. The open measurement on
#1532 is when a topic mod becomes too large for products that use little of it.
Measure that cost before splitting further; no size threshold is adopted here.

## Starts and mixing

Start rows live in scenario content because location and carried kit depend on the
map and run. A scenario can provide several starts, and a mod can add another. The
entry pack selects the default scenario and start. A player start picker is separate
UI work, not a prerequisite for recording the content relationship. Start admission
must not require lower-layer definitions to supply a playable scenario, and placement
must use ordinary item and character owners rather than privileged preset state.
See `packages/deadvox/src/core/startIssues.ts`, `startIssues`, and
`packages/deadvox/src/core/startState.ts`, `applyStartState`.

Fresh normal product starts use admitted rows and the entry pack's default, including
selection of generated worlds and explicit initial recipe knowledge. Skill-earned
recipe unlocks stay with the character owner. Debug kits are composed at play time
from a normal start plus the spawn menu or a mod row. Base content carries no
per-kit start rows, keeping content small and admission fast. Development tools
alone do not alter the selected run's initial state. The start-state contract belongs to
`packages/deadvox/docs/url-mods.md`, "Start state in mods".

Scenario rows own guided steps, stage marks and attempt recording because a different
run must not require runtime identity branches. Guidance observes completed actions
and selects presentation; it cannot issue gameplay commands or bypass action owners.
Handling history belongs to an observed item instance so separate items cannot be
combined into one completed lesson. See `packages/deadvox/src/presentation/guidedSteps.ts`,
`GuidedSteps`; `packages/deadvox/src/presentation/handlingLessons.ts`, `HandlingLessons`;
and `packages/deadvox/src/ui/guidedSteps.ts`, `mountGuidance`.
Input references share the action catalogue rather than the browser resolver so
admission cannot pull DOM timing into simulation. See
`packages/deadvox/src/core/inputActions.ts`, `INPUT_ACTIONS`.

Attempt recording is scenario content carried by scenario or layout rows. Without
an authored row there is nothing to record against, so no code default stands in.
See `packages/deadvox/src/core/schema/attemptPolicy.ts`, `AttemptPolicySchema`, and
`packages/deadvox/src/presentation/playtestObserver.ts`, `createAttemptRecording`.

Snapshot measurement is a debugging aid, not scenario attempt policy: its result
never reaches the attempt file, so scenarios must not tune it. See
`packages/deadvox/src/debug/snapshotMeasurement.ts`, `measureSessionSnapshot`.

Observation mechanisms do not stage or mutate the world; staging that needs another
mechanism requires its own decision. See `packages/deadvox/src/core/stageMarks.ts`,
`stageMarkArea` and `stageMarksAt`.

Theme mods stand alone without wiring themselves into any product's distribution.
A small, player-selected compatibility mod supplies that wiring: for example, magic
spells and items stay in their theme, while an integration mod adds them to Deadvox's
loot tables. A product built around magic can depend on that same theme and supply
its own product mods. The promise is reusable themes with explicit integration, not
automatic combination of two complete products.

Integration uses the dependency and declared-override rules in
`docs/decisions/0007-typed-field-patches.md`, "Conflicts". One merge authority keeps
product combinations from silently choosing different winners. Engine-owned verbs
and restricted CEL rules remain governed by `docs/decisions/0004-content-language.md`,
"Mod rules".

## Vocabulary

Runtime storage, build contracts and diagnostic names use Skelly rather than a
product's name so other products inherit no Deadvox vocabulary; renaming browser
stores has no fallback or migration under `AGENTS.md`, "Project stage: pre-pre-alpha, no backwards compatibility".

Use Actor for a body and its state, and Agent only for the part that decides. A
setting's name in engine code ties the engine to one product; these roles keep the
body and decision mechanisms independent of that setting. See `GLOSSARY.md`, "Actor roles".
Whether a ship is an actor is not decided by those words.

An actor's body is described in content and works with no Agent at all, so it can stand undriven or be driven by something other than this decision code, such as a player, without carrying that code or its memory. The Agent is a separate layer on top: simulation body code takes no value import from it and reads none of its state, and its memory lives apart from the body, in the save as well. An Agent acts only through the body's own means and limits, so injury and reach bind whatever drives the body. It never branches on body plan, so a new body plan or a new decision mechanism needs no edit to the other, and a product can reuse either alone.

Body-plan mechanisms use descriptive anatomy names: humanoid rather than shambler,
fused-mass rather than amalgam, and shape names for other forms. Product content ids
may retain their setting vocabulary. This keeps reusable anatomy independent of the
product that first supplies it; see `packages/deadvox/docs/pack-split.md`, "Creature framework".

Name a mechanism for what it does. Keep a domain word when it describes behavior
precisely: a horde is a crowd moving together toward stimuli. A formation-based army
would need its own mechanism, not a vaguer name for the horde. Use descriptive names
for framework mechanisms, including scenario assembly: a scenario name in framework
code ties every product to one scenario. See
`packages/deadvox/src/core/scenarioCity.ts`, `ScenarioCitySite` and
`scenarioCityPopulation`. Generic words must not blur distinct mechanisms.
Content selectors and taxonomies move out of code regardless of the mechanism's name;
see `packages/deadvox/src/core/settlementSpawns.ts`, `settlementHordeSpawn`, and
`packages/deadvox/src/core/loot.ts`, `LOOT_TIERS`.

## Remote intake

A mod is data. Its restricted rules cannot read browser storage, credentials or the
network. This invariant, not trust in a host, is the security boundary and protects
future multiplayer credentials as well as local state.

URL intake uses HTTPS and CORS-readable hosts only, shows the source and asks for
confirmation. The loader must admit files only from the mod's own origin, preventing
third-host tracking. Size and evaluation-cost bounds prevent bloat and freezes;
trusted admission limits cannot come from the mod they bound. No trusted-host list
or proxy is part of this design.

GitHub distribution is the canonical sharing path. Raw hosting and Pages cover it
without a repository browsing API or proxy. Archive intake is deferred: parsing,
expansion bounds and atomic cleanup add work without a sharing need that URL folders
leave unmet. If archives are added, they use the same manifest through another
fetcher, not another mod format. Folder admission and asset provenance remain owned
by `docs/decisions/0008-mod-authoring-tool.md`, "Folder mods and assets".

## Saves and proof scope

The framework split changes no save-store policy. A product wanting separate saves
uses a separate URL with the necessary hosting separation, not a new product save
feature. Browser storage is origin-scoped; a different path on the same origin shares
the store. Compatibility remains framework-owned under
`packages/deadvox/docs/decisions/0002-saves.md`, "Compatibility". Ordered pack identity
remains the rule until #1395 implements evaluated-content identity under
`packages/deadvox/docs/decisions/0008-deterministic-world.md`, "Decision".

The first split is proved with independent and mixed ground-based stacks. Space is a
later consumer, not a feasibility claim or a requirement of this refactor. Give ground
assumptions named owners instead of freezing them as universal APIs; missing space
mechanisms still require scoped engine work.

## Refactor gate

The runtime moves out of `packages/deadvox` into its own workspace package, and content
splits into `skelly.*` mods in one refactor. The runtime package is `packages/engine`,
`@skelly/engine`, when it moves under #1532. The assembly/geometry library therefore gave
up that name and is construct, `@skelly/construct`, in the asset submodule; the reasons
for that name are in its
`packages/skelly-assets/tools/packages/construct/README.md`,
"Name".

Runtime code (`packages/deadvox/src/core`, `packages/deadvox/src/vehicles`,
`packages/deadvox/src/game` and the workspace libraries the deadvox package depends on)
reaches nothing outside that set, not even for types: no presentation, render or UI code
and no product configuration, mods or pages, whether by import or by glob. The runtime
then moves out as its own package with nothing left behind to import, and the presentation
side moves out whole. See `packages/deadvox/tools/runtimeClosure.ts`, `RUNTIME_POLICY`.
The same set also compiles without DOM types, so a browser API used in the runtime fails
the deadvox typecheck; see `packages/deadvox/tsconfig.runtime.json`. The checks guard
honest edits, not deliberate bypasses; what they do not check is in
`packages/deadvox/docs/runtime-closure-limits.md`, "Not checked".

Runtime and presentation code name no product path. The product globs its own mod roots
and reads its own configuration, then passes the maps in, so the runtime carries neither a
product's layout nor build-tool coupling and another product can supply different sources.
See `packages/deadvox/src/product/content.ts`, `productContent`, and
`packages/deadvox/src/product/mods.ts`, `productModIntake`. The product entry owns all
product wiring, the page's keyboard included: it builds the keyboard from the product's
default keys and passes it to the UI, debug and presentation modules that read keys, so
the presentation package can move out of the runtime package without a product import.
See `packages/deadvox/src/product/input.ts`, `keyboardInput`.

The framework refactor's own PR and the asset-pipeline move PRs are allowed under the
#1532 freeze. The asset move targets `framework/refactor` and precedes framework
extraction beyond the content-ownership split. Moving the pipelines first avoids
extracting runtime around tool dependencies that would then be removed again.
Open permitted PRs as drafts for CI; unrelated new PRs remain frozen until the
refactor lands, though other work can use an existing PR. The freeze prevents unrelated
file moves during extraction, not CI for the extraction itself. One extraction avoids
paying for a temporary internal-edge phase and its later removal. See
`docs/decisions/0010-asset-pipelines-in-skelly-assets.md`, "Decision", for the asset
boundary, and `packages/deadvox/docs/pack-split.md` for the content-extraction plan.
