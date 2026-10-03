# Crafting ownership and planning

Slice 2.4 implementation starts at the shared item-tree boundary, then adds the
pure planner and persisted character state. Long actions and the panel follow.

## Item tree (F3)

`src/core/itemTree.ts` owns typed roots, pocket traversal and locations for live
and saved trees. `Inventory.items`, `itemByUid`, `locate`, reach collection, and
save UID/content validation project that contract. The retired authorities are
Inventory's recursive `visit` closures, `roots`, `searchPockets` and
`inFurniture`, reach's separate recursive visitor, and saveFormat's
`walkItem`/`walkPlaced` and `visitItem` root/pocket loops.

Inventory still owns structural moves, splits and consumption. Quickbar and
held-light references already resolved through `Inventory.itemByUid`; they
remain non-owning UID consumers, not newly consolidated authorities. No UID
cache, registry or event bus is introduced. Live/saved scalar and pocket fields
share `ItemFields`; canonical wire serialization remains a distinct concern.

Restoration validates IDs, allocator monotonicity, registry pocket counts,
placement bounds and overlap before constructing the live inventory or modifying
supplied block entities. Lazy lookup of a carried item does not enumerate world
piles or furniture. The future work item will have one owned input tree and a
derived second occupied hand, not a duplicate serialized UID tree.

## Pure planner

`planCraft(recipe, reach, character, prefer?)` enumerates declared alternatives
(the validator caps them at 1,024), aggregates competing quantities, and selects
the cheapest feasible combination. Within each type it follows the specified
retrieval-seconds, smaller-stack, worse-condition, UID order. A partial retrieval
costs one stack handling operation. Filled containers are not component stock.
Tools remain in place; their UIDs cannot also supply components. A single tool
can satisfy several qualities. Tool selection considers competing component
stock, rather than blindly reserving the first provider. Provider search groups
consumed tools by type, stack quantity, retrieval cost and component eligibility;
condition/UID dominance preserves preferred component stock. Each class retains
only as many representatives as its type can supply required qualities. Keeping
more than one matters when several reservations change greedy stack allocation.
Equivalent reserved-UID sets are visited once per quality prefix, not once per
provider tuple. No feasible plan is rejected by a search-budget cutoff.

Gather time is in **game seconds** (`handlingTime * CLOCK_RATIO`); work time is
recipe game minutes times 60. Skill speed bonuses arrive in 2.5, not here.
Preferences never fall back silently. Missing requirements include knowledge,
skill gaps, best usable quality levels, station, and needed/raw-found counts per
component group. Raw counts may compete across groups or with required tools;
the refusal explains that distinction.

A reach snapshot has one derived type/quality index and per-recipe/preference
allocation cache. Character admission is rechecked before a cache hit. Returned
plan records are copied so editing them cannot poison another request. These
are disposable views, not owning item indexes; commands must obtain a fresh
reach snapshot and re-plan.

## Minimal character state

`src/core/character.ts` owns skill levels and recipe knowledge. New characters
start every declared skill at 0 and know the present base recipes: torch,
candle and repair kit. The repair kit remains skill-gated at crafting level 1.
The starting source is explicit and filtered to loaded recipe IDs; new arbitrary
recipes are not automatically known. Books and practice belong to 2.5.

Snapshots and the canonical save payload persist `character.progression`.
Restoration preserves the saved levels/knowledge instead of reseeding them and
validates skill definitions, recipe references, duplicate knowledge and levels.
Older saves without this field are deliberately rejected: no migration or
compatibility mode. Canonical numeric handling, including signed zero, is
unchanged. The CLI now uses this same starting source as a hard knowledge check;
unknown recipes cannot seed the component or tool closure. Skills stay pending
until 2.5 and workstation behavior until 2.8.

## Proofs

`test/inventory.test.ts` rejects extraneous item pockets, a missing declared
pocket, and an out-of-grid pile placement. Existing snapshot, UID, transfer,
quickbar and furniture controls protect the unchanged ownership semantics.
`test/crafting.test.ts` covers competing groups, preference, tool/component
separation, stack ordering, filled-container exclusion, missing requirements,
and records all base-recipe timings on one indexed 200-item reach snapshot.
One overlapping four-quality case has a deterministic operation-count control,
varied conditions, shared tool UIDs and a cheapest-allocation guard against
incorrectly collapsing a provider class to just one representative.
`test/snapshot.test.ts` round-trips changed skill/knowledge state and signed zero
without mutating live state. Controlled mutation evidence and measurements are
retained under `.agent-mail/scratch/d31-*`.

This is mixed feature/validation/consolidation work, **not an isolated or
line-reducing refactor**. The staged report names source, test, doc and content
deltas separately; the final slice is still gated by long-action proofs and BR's
in-game panel approval.
