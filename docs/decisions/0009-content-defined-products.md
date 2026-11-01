---
read_if:
  - you change SkellyEngine's boundary, product entry packs or shared content ownership
  - you classify mods, choose their ids or combine a theme with a product
  - you change remote mod intake, product save separation or the framework refactor gate
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

Cut reusable content by topic and consumer. A topic mod declares dependencies on
other topics it uses, so a vehicle's fuel or a firearm's ammunition is not a hidden
cross-pack reference. Reusable transport and parts belong in shared content;
product-specific vehicles belong in that product, classified entry by entry.

**Definitions are inert.** A topic may mix eras. Products and scenarios decide what
appears through loot, shops, sites and other distribution; recipe availability is
also distribution. Scarcity, placement and prices belong to that consumer, not to
the generic object's definition. Player-facing lists, including spawn menus,
encyclopedias and crafting books, filter to what the product uses. An exclusion
mechanism or a parallel era axis would duplicate those choices.

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
| Zombie types, skills, loot tables, site generation, camp and rural sites | ✓ | · | · | · | Product |
| Gauntlet, tutorial, playtest and test house | ✓ | · | · | · | Scenario |

The roster classifies content and tuning, not engine code. The open measurement on
#1532 is when a topic mod becomes too large for products that use little of it.
Measure that cost before splitting further; no size threshold is adopted here.

## Starts and mixing

Start rows live in scenario content because location and carried kit depend on the
map and run. A scenario can provide several starts, and a mod can add another. The
entry pack selects the default scenario and start. A player start picker is separate
UI work, not a prerequisite for recording the content relationship. The start-state
contract belongs to `packages/deadvox/docs/url-mods.md`, "Start state in mods".

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

Use the role definitions in `GLOSSARY.md`, "Actor roles". Whether a ship is an actor
is not decided by those words.

Name a mechanism for what it does. Keep a domain word when it describes behavior
precisely: a horde is a crowd moving together toward stimuli. A formation-based army
would need its own mechanism, not a vaguer name for the horde. Rename setting and
scenario names in framework mechanisms, such as `packages/deadvox/src/core/gauntlet.ts`,
`GauntletSite`, to descriptive names: a scenario name in framework code ties every
product to one scenario. Generic words must not blur distinct mechanisms.
Content selectors and taxonomies move out of code regardless of the mechanism's name;
see `packages/deadvox/src/core/settlementSpawns.ts`, `HORDE_TYPE`, and
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
splits into `skelly.*` mods in one refactor. The runtime package name is chosen at the
refactor and must not collide with `packages/engine`, the assembly/geometry library.

The #1532 gate is closure or merge of every PR in its frozen in-flight set: #1531,
#1529, #1528, #1527, #1526, #1524, #1520, #1509, #1503, #1496, #1493, #1488, #1477,
#1403 and #1369. No new PRs open until the refactor is executed. Work can use an
existing PR. Waiting avoids moving files under active branches, and one extraction
avoids paying for a temporary internal-edge phase and its later removal. The content-extraction plan belongs in
`packages/deadvox/docs/pack-split.md`.
