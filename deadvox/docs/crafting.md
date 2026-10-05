---
read_if:
  - you change crafting, workstation, disassembly, or salvage contracts
  - you change work-item ownership, long actions, saves, or their tests
---

# Crafting ownership and planning

Slice 2.4 implementation starts at the shared item-tree boundary, then adds the
pure planner, persisted character state and shared core long actions. Work-item
options/command wiring and the BR-gated panel follow.

## Item tree (F3)

`src/core/itemTree.ts` owns typed roots, pocket/work-input traversal and locations for live
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

Gather time is in **game seconds** (`handlingTime * CLOCK_RATIO`). Work time is
adjusted by the named in-reach station's content-defined bonus before it is
stored in the work item; skill speed remains a separate progression rule.
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
start without skill progress and know only the explicit starting recipes;
`startingKnownRecipes` filters that source to loaded recipe IDs. New arbitrary
recipes are not automatically known. Workbench-dependent base recipes join that
explicit source so a placed station can be exercised in the game. The repair-kit
recipe remains skill-gated. Books and practice belong to 2.5.

Snapshots and the canonical save payload persist `character.progression`.
Restoration preserves the saved levels/knowledge instead of reseeding them and
validates skill definitions, recipe references, duplicate knowledge and levels.
Older saves without this field are deliberately rejected: no migration or
compatibility mode. Canonical numeric handling, including signed zero, is
unchanged. The CLI now uses this same starting source as a hard knowledge check;
unknown recipes cannot seed the component or tool closure. Positive skill-source
checks remain pending until 2.5. Workstation sources are hard-checked against
placed templates by `checkReachability()` in `src/core/reachability.ts`.

## Shared core long actions (step 4)

`Simulation.actions` is the single action-state owner. It registers `long-action`
with the existing Scheduler at 1 Hz/max 30 simulation seconds, without another
queue or timer. Native tagged descriptors distinguish rest, sleep and craft.
Rest descriptors own their rate/start fatigue/elapsed time; craft descriptors
hold only a non-owning work UID and the active-time cursor/status.

`RestController` now selects rates and forwards controls only; its mutable action,
frame-completion logic and separate snapshot/restore authority are retired. Stop
keeps the core descriptor/progress, while the existing rest UI hides a manually
stopped action. Continue preserves it. Interruption UI, safety checks, fatigue
recovery/bed bonus and normal compression ramp-down remain unchanged in intent.
Stopped actions do not recover fatigue or accumulate work while the world advances.

The `work` field on `work_in_progress` owns the tagged craft or disassembly
payload, progress, duration (game seconds), and exact input item subtrees; a
disassembly payload also owns its source, skill/tool snapshot, and calculated
outputs. `CraftWork` in `src/core/items.ts` defines these saved forms, and F3's
walker includes their inputs; no job or second hand owns a copy. The native type
reserves both hands through `twoHanded`, with one right-hand root. Inventory
refuses a work item into the left hand with `Work stays in the right hand`.
Inventory alone escrows/removes/releases inputs, prevents independent
consumption/moves of escrow, and maintains weights/UID lookup.
Reach omits escrowed inputs. This core representation is required to prove F2;
work-item options, native command wiring and the derived second-hand label now
use the step-5 F7 projections. The first-person renderer already uses the generic
two-handed stand-in box without adding a second item UID.

`LongActions.beginCraft(plan)` admits recipe/knowledge/skill/equipment and secures
safe compression before calling Inventory's structural escrow primitive. Refusal
moves no inputs; a stale structural plan stops compression without creating a job.
Unreferenced work remains legal and can be released via `cancelCraft(workUid)`.
Free hands and no active craft permit another work tree; a stopped descriptor is
not a one-pending-craft restriction. Dropped half-finished work keeps its own inputs.

One shared planner admission function and station matcher serve planning, native
start and Continue/ticks. The work owner adds only payload and hand checks.
Admission and every action tick recheck recipe/knowledge, material quantities,
hands, skill, current tool qualities and workstation. Tools/stations are live
requirements, not stale saved provider references. Stop preserves elapsed work;
Continue resets only the active-time cursor so stopped time is not charged. A
running craft refuses rest with `Stop crafting first`; rest/sleep may replace a
stopped descriptor, since progress still belongs to the work item. C and the
status panel use the same native Continue UID: a live or interrupted rest/sleep
job takes precedence over held work; a stopped rest/sleep job leaves Continue to
the held work.
Terminal state is cleared before effects; a completed craft consumes escrow once
and puts its recipe result in the freed hand, while a completed disassembly drops
its outputs at the player's feet. Cancel returns exact input UIDs/counts without
stack merging. The same `dropSpots` policy in `src/core/inventory.ts` handles
craft retirement and disassembly outputs; shadow occupancy reserves every output
before transferring any of them. An unplaceable return is refused before
structural transfer and keeps stopped work intact. The debug spawn menu excludes the payload-bearing native work type.

Snapshots/codec now require `character.longAction`; recursive item `work` data
is included. Loading validates tags/cursors, work ownership, recipe IDs, progress
bounds and declared component quantities before exposing a live inventory. There
is deliberately no previous-rest-format compatibility path. Ordinary handling
jobs are still cancelled only in the saved copy. The runtime graph includes both
new core owners; the one new native item definition changes the content identity.
Work is a runtime escrow representation, excluded from acquired-content counts.

## Disassembly and salvage (Slice 2.7)

Every non-repair recipe result needs an authored disassembly yield; repair
recipes are excluded because they improve an existing target instead of creating
a new item result. A disassemblable item declares a yield or a salvage list, never
both. `checkItems` in `src/core/content.ts` rejects mixed declarations, and
`checkRecipes` in `src/core/content.ts` requires recipe-result yields.

`planDisassembly` in `src/core/disassembly.ts` calculates yield from the skill and
reachable tools at start, and the work item keeps that output snapshot. Stop and
Continue therefore preserve the original yield rather than recalculating after a
skill change. Salvage uses the fixed work duration in `SALVAGE_DURATION`; gathering
adds its handling time. Finishing places disassembly outputs at the player's feet,
while cancelling returns the exact source item. These rules keep taking apart an
item a resumable action without changing its promised output or losing the source.

## Proofs

`test/inventory.test.ts` rejects extraneous item pockets, a missing declared
pocket, and an out-of-grid pile placement. Existing snapshot, UID, transfer,
quickbar and furniture controls protect the unchanged ownership semantics.
`test/crafting.test.ts` covers named-station reach, station-supplied qualities,
content-derived work-time bonus, competing groups, preference, tool/component
separation, stack ordering, filled-container exclusion, and missing requirements.
One overlapping four-quality case has a deterministic operation-count control,
varied conditions, shared tool UIDs and a cheapest-allocation guard against
incorrectly collapsing a provider class to just one representative. A four-cost-
class variant uses the same 100,000-read guard; component lists are sorted once
per snapshot, never per provider leaf. This is not a universal provider-class bound.
The known-set reachability fixture separately keeps the component closure ungated
by tool availability while the tool closure still rejects self-bootstrap.
`test/longAction.test.ts` covers equal active work across Stop/Continue, stopped
world time, both saved statuses, lost tools, terminal cancellation and malformed
ownership/input payloads. Native codec/session cases separately cover both statuses
and recipe/job references; existing rest/sleep and rest UI controls retain their intent.
`test/snapshot.test.ts` round-trips changed skill/knowledge state and signed zero
without mutating live state. Controlled mutation evidence and measurements are
retained under `.agent-mail/scratch/d31-*`.

The rough panel shows only known recipes, raw found/needed counts, best usable
qualities, skill gaps, preferences and refusal reasons. The shared unfiltered
`requirementStatus` supplies counts and levels to both admission and readouts.
Refusals name missing tool qualities or the first understocked component group;
allocation competition is reported only when each chosen group is stocked alone.
Clicks submit recipe/UID
intents and revalidate live state; readouts never mutate work or own another tree.
Panel styling and in-game acceptance still stop at BR's first-look gate.

This is mixed feature/validation/consolidation work, **not an isolated or
line-reducing refactor**. The staged report names source, test, doc and content
deltas separately; the final slice is still gated by long-action proofs and BR's
in-game panel approval.
