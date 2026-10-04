---
read_if:
  - you're planning or building the crafting-and-mending slice
  - you're carrying Slice 2 questions into the Slice 3 playtest
---

# Slice 2 — Craft and mend

The second slice on the [road to version 1](EPIC.md). It builds the crafting
design in [INTERACTIONS.md](INTERACTIONS.md) on the first-slice foundation and
the systems in [DESIGN.md](DESIGN.md), "Crafting" and "Light".

**Status:** draft, proposed by the lead (2026-10-03), revised after review
cr-d19. BR approves the plan. The scope follows BR's defaults of 2026-10-03
("overall defaults - we might tweak some on the way"). Numbers and rules that
aren't among those defaults are listed under "Plan defaults" and "Questions for
BR".

## Goal

The player loots the hamlet as in Slice 1, but now what they find is material.
They make a torch before the first night, mend a worn crowbar, take a broken
radio apart for its parts, read a manual that teaches them a recipe, and do the
bigger jobs at a workbench in the garage. Crafting, repair, disassembly and
reading run in compressed time and can be interrupted and resumed. Crafting and
disassembly keep their inputs and progress in a work item; repair and reading
keep their target item and progress under the long-action contract (2.4).

## Playtest questions

EPIC's question for this slice: **does crafting from scavenged materials give
looting a purpose?** In more detail:

1. **Purpose:** do players pick up things they can't use directly (rags, nails,
   scrap) because of what they could make? Do they plan a loot run around a
   recipe?
2. **Readability:** can players tell from the crafting panel what they're
   missing and where it might be found?
3. **Time:** is crafting in compressed time, with interruptions, readable and
   fair? Do players come back to a half-made item?
4. **Wear:** do players notice wear, and is repairing worth the materials?
5. **Light:** do players make light, and does carrying a burning torch change
   how they move at night?

The playtest itself runs at the end of Slice 3 (BR, 2026-10-02). These questions
join the end-of-Slice-3 playtest plan in [EPIC.md](EPIC.md#3-flesh-and-noise);
milestone 2.0 adds them.

## Scope

### In

- **Reach and options in the core:** one `reach()` snapshot and one `options()`
  list (INTERACTIONS.md, "Reach" and "Options").
- **Recipes as content:** result, time, skills, tool qualities, groups of
  alternative components, optional workstation; the validator checks references
  and the 1,024-combination cap.
- **The planner and crafting as a long action** in compressed time: start,
  interrupt, stop, continue and cancel, with the work-in-progress item holding
  its components. Rest and sleep move onto the same long action.
- **A crafting panel** in lit-html beside the inventory.
- **Skills:** `crafting` and `mechanics`, both named in DESIGN.md. They rise
  with use and don't decay.
- **Recipes known:** a small set from the start; books teach the rest. No
  schematic items yet.
- **Books and reading** as a long action, with a `book` component.
- **Wear and repair:** melee weapons wear per hit, worn clothing when you're
  hit. Repair consumes materials and needs a tool quality.
- **Disassembly:** a finished item yields a fraction of its components, rising
  with skill. Found items with no recipe get a salvage list.
- **Workbenches:** furniture placed by templates, a `workstation` component with
  qualities and a speed bonus.
- **Light you make:** torches and candles are crafted, and glowsticks are found
  (DESIGN.md, "Light"). They're carried, burn down, and give a real light all
  around (not the flashlight's beam).
- **Weapon mods as data:** plain mod items, with a category and recipes, found
  and crafted like other items.
- **About 80 item types** in the content count (see 2.3 for what it counts).
- **Two templates:** a hardware store and a garage, placed in the hamlet.
- **Reachability:** the validator checks that every recipe component can be
  found or crafted. "Found" means it's in a loot table that a template placed in
  the world uses (BR, 2026-10-03).
- **The noise → positional-sound scenario test** carried from 1.10, as an exit
  gate.
- **A sneak peek at trees** (BR, 2026-10-03), pulled forward from Slice 4: voxel
  trees and hedges in the hamlet, plus the near-player performance work that a
  lot of trees will need (2.13).

### Out (and which slice has it)

| Feature | Slice |
| --- | --- |
| Fitting and removing weapon mods; mods changing a gun in play; a `mod` component or mount data | 3 |
| Zombies sensing light (made lights don't change `isLit`, `src/core/zombies.ts:396`) | 3 |
| Body-part wear (clothing wears without a body model; see Questions for BR) | 3 |
| Batch actions (CHALLENGES.md §5) | after Slice 2 |
| Ammunition economy: crafting or salvaging ammo | not scheduled |
| Pouring, mixing or any other fluid simulation | not scheduled; needs BR |
| Building a workbench; construction | 5 |
| Fire: spreading, a torch setting things alight; stoves and cooking with `heat` | 5 |
| Appliances: `controls`, `process`, `power` | 5 |
| Schematic items | after Slice 2 |

Also out: the sound polish list in EPIC.md ("Sound polish") stays there, apart
from the scenario test above (BR, 2026-10-03).

### Settled by the lead

Engineering and scope defaults inside BR's rulings (lead, 2026-10-03, on review
cr-d19). Any new mount integration or batch feature goes back to BR.

- The skills are `crafting` and `mechanics`. INTERACTIONS.md's recipe example,
  which used `survival`, now matches.
- Glowsticks are found only, as DESIGN.md says.
- Mod items are plain items with a category, with no `mod` component yet.
- Batch actions are deferred out of Slice 2.
- Deterministic tie-breaking and rounding, and minimal payload shapes, are
  engineering decisions made in the milestones.

### Plan defaults

These are proposed numbers and rules for BR to approve with the plan. They are
not among BR's eleven rulings:

- about 30 recipes counting disassembly and repair, and 4 books
- a lower bound of 75 for the content count (2.11)
- repair raising condition by an amount that grows with skill (2.6)
- the extinguish and relight rules for each light (2.9)

## Pulled forward and carried forward

### Pulled forward into Slice 1 (already merged)

| Item | From | Effect on exit criteria |
| --- | --- | --- |
| Shambler body regions and severing (#65), limb debris physics (#97) | 3 | Counts toward Slice 3's body work. Severed parts are items in ordinary piles (`src/game/session.ts:358`); BR excluded them from the content count (2.3) |
| Melee: models (#42), first-person motion and hits at contact (#115), machete and KA-BAR (#130), the primary action (#128) | 3 | These weapons wear in 2.6; Slice 3 still owes melee depth and blocking |
| Firearm handling ADR 0003 (#133), the debug range with spent-case piles (#148), debug loadout (#124), gungen gun models (#79, #82) | 3 | Debug firearms and spent cases are proposed exclusions from the content count. Firearms don't wear in Slice 2 |
| Positional sound with wall gain and low-pass (#43, #147) | 3 | Half of Slice 3's positional-sound item; Slice 2 adds the scenario test (2.12) |

In flight on 2026-10-03: the AR/AK firing cycle (#154), gunshot audio (d18),
debug axes (#151) and saves closure (#143). Not pulled forward: deadvox weapon
mods and mounts, and the ammunition economy.

### Pulled forward into Slice 2

| Item | From | Effect on exit criteria |
| --- | --- | --- |
| Trees and hedges in the hamlet, with a forest benchmark (BR, 2026-10-03) | 4 | 2.13, with its exclusions; Slice 4 still owes biomes, far-terrain trees and the rest of "A world that feels real" |

### Carried forward from Slice 1

| Item | Source | Effect on exit criteria |
| --- | --- | --- |
| The first real playtest, and 1.8's "players understand why they were woken" | 1.8, 1.11 | Runs at the end of Slice 3; 2.0 adds Slice 2's questions to its plan |
| 1.8.5: BR's in-game approval, a severing sound, reviving incapacitated shamblers | 1.8.5 | Approval at the Slice 3 playtest; sound and revival stay future work. Not Slice 2 gates |
| 1.10's scenario test: every noise event emits a positional sound | 1.10 | **Slice 2 gate** (2.12) |
| 1.10's missing cues, placeholder recordings and night audibility tuning | 1.10 | Stay on EPIC's Sound polish list; not Slice 2 gates |
| Snapshot p95 on a long session | 1.11 | At the Slice 3 playtest; Slice 2 milestones that add saved state keep the round trip and size budgets of ADR 0002 |
| Occlusion culling | 1.5 results | Not planned; the 2026-09-26 measurement found it not worth doing |
| Batch actions (CHALLENGES.md §5) | 1.4 | Deferred out of Slice 2 (lead); not a gate |

## How this slice runs

The retrospective's proposals for Slice 2
(`deadvox/docs/retro-slice-1.md`, section 4, on `docs/retro-slice-1`), as they
apply here:

- Pulling work forward from later slices is BR's decision, and gets a line in
  the table above.
- Visual work gets a rough screenshot and BR's direction before the full
  engineering round. Milestones marked **first look** below need one.
- One behaviour per test. Sweeps stay behind a flag with a named consumer. The
  default run keeps the budget 2.0 records. Negative fixtures test distinct
  rejection paths: tests assert that invalid fixtures are rejected with the
  expected diagnostic, and the CI job stays green.
- No flaky tests: fix the nondeterminism, or disable that exact test in CI with
  an owner and an issue. Never retry until green or raise a timeout to hide a
  failure.
- Each PR is checked against current main before it's opened or relayed, and
  again when main moves.
- Every milestone that adds simulation state puts it in the save snapshot and
  in the simulation fingerprint. ADR 0002 refuses any save whose version
  differs, so there are no migrations: old saves are refused, and the
  current-build round trip covers the new state.
- Where a later milestone needs state an earlier one introduces, the plan says
  which milestone owns it (see 2.2, 2.4 and 2.5). Nobody installs a second,
  temporary representation.

## Consolidation folded into the milestones

The 2026-10-03 consolidation survey (r9-1,
[docs/reviews/2026-10-03-consolidation.md](docs/reviews/2026-10-03-consolidation.md))
ranked eight refactors. Each one either lands inside the milestone that needs it
or before it, so Slice 2 builds on one owner per concept rather than adding
another copy. They are tracked with everything else in the refactoring backlog
issue.

| # | Consolidation | Where it lands |
| --- | --- | --- |
| F1 | One core `reach()` snapshot and `options()` contract | inside 2.1 (top 3) |
| F3 | One boundary for the item tree, mutations and external UID references | the dangling quickbar fix now (d22); the tree/reference contract before or inside 2.4; state invalidation inside 2.1 and 2.6 (top 3) |
| F2 | Rest generalized into the core long-action owner | inside 2.4, before 2.5–2.7 (top 3) |
| F7 | View, HUD and render lifecycle extracted from `play.ts` | standalone, before the 2.4 panel and 2.9 lighting |
| F4 | The simulation owns sound and noise admission; playback is one-way | before or inside 2.12 |
| F5 | Per-item burn state, with lights derived from it | inside 2.9, after F3 |
| F6 | Player combat continuation separated from zombie AI | inside 2.6 |
| F8 | Exhaustive content-section metadata from one descriptor | inside 2.2, carried through 2.5 |

## Milestones

Each milestone is one or two PRs, merged and deployed to Pages with CI green.
The order follows dependencies. After 2.0, 2.13 can run before the crafting
milestones, to get BR's first look early. The lead serializes its hamlet
placement with 2.10; whichever lands second uses the integrated layout and
reruns the placement and chunk-order checks. 2.12 follows or includes the F4
sound and noise consolidation and can run alongside unrelated work.

### 2.0 Before code starts

Paperwork; no game code.

- ADR 0001 is closed: the inventory screen moved to lit-html in Slice 1 (#105),
  which replaces EPIC's first Slice 2 item. PROJECT.md and INTERACTIONS.md say
  so.
- **Host budget**, measured: disk per worktree with its installs, memory per
  agent and per browser test, the number of heavy runs at once, and the free
  disk to keep in reserve. Measured 2026-10-03. These are facts about the host,
  so since 2026-10-04 they live in its notes, outside the repository (AGENTS.md,
  "No host-specific information in tracked files").
- **Default test-run budget**, measured: the wall time of each subproject's
  default test run (deadvox, gungen, mobgen) on the shared host, recorded with
  the host budget as three-run medians and budgets; a milestone that pushes a
  run past one says why.
- The Slice 2 checklist issue is open, listing every milestone and gate below.
- Slice 2's playtest questions are added to EPIC.md's end-of-Slice-3 playtest plan.
- #143 (saves closure) is merged before any milestone that adds saved state
  (2.4 on).
- BR has answered the questions below, or accepted their defaults.

**Done when:** each item above is merged or linked from the checklist issue.

### 2.1 Reach and options

- `reach(player)` in `src/core`: hands, worn items and their pockets, piles
  within 2 m and containers lying in them, searched furniture within 2 m, and
  workstations within 2 m with their qualities. Each entry carries its location
  and handling time. Cached against the versions it was built from.
- The core states the player origin it measures from, and how distance to a
  pile and to a piece of furniture is measured (to its block, or to its nearest
  cell).
- The workstation part of the result is defined here and stays empty until the
  `workstation` component and the first bench land in 2.8.
- It replaces the scattered queries: `LOOT_REACH` (`src/game/session.ts:59`),
  `pilesNear` (`src/core/inventory.ts:289`), `containersNear`
  (`src/core/blockEntities.ts:292`) and `Survival.findBattery`
  (`src/game/survival.ts:172`).
- `options(thing, reach)` in the core returns every action with its time or the
  reason it can't happen. Today's `options` (`src/game/targets.ts:36`) covers
  moves only; "use" (eat, drink, switch, swap battery) moves into it from
  `Survival.use`.
- Existing handling, search visibility and reach limits are kept, except for
  alignments with the unified reach that the PR lists explicitly. One is
  decided in the PR: whether a dead light finds a spare battery in nearby
  searched furniture and ground containers, not only in what you carry, as
  today.

- **Quick move** (BR, 2026-10-03; pulled into 2.1 with BR's go). It's one more
  option from the core `options()`: `quickMove(item, reach)` returns the move it
  would make, or the reason it can't. The UI binds it to Ctrl-click today. BR
  ruled on 2026-10-04 that it becomes **hold T and click** ("hold T+click on item
  does the quick action (auto move)"), under his rule of no Ctrl or Cmd, ever
  (CONTROLS.md). d44, the input registry, makes that change. Shift-click stays
  free for splitting a stack later.
  - **An item you carry** (in hands, worn, in a pocket or a container) drops to
    the ground pile at your feet. A worn container drops with its contents.
    Taking it off costs its usual handling time.
  - **The item you're wielding** goes into your inventory only if it fits,
    trying the backpack first, then other worn containers, then pockets. If
    nothing fits, it stays wielded and a brief "doesn't fit" hint shows.
  - **An item on the floor or in a container** goes to the inventory: the
    backpack first, then other worn containers and pockets. If nothing fits, a
    brief hint shows. A container lying on the floor, such as a backpack with
    items in it, is **worn** if its slot is free, and keeps its contents. That's
    "batch by the rules", not a separate take-all feature.
  - **Stacks** move whole. Splitting comes later, on Shift-click.
  - **Time:** a quick move is an ordinary move. It takes the same handling time
    and goes through the handling queue, so it saves clicks, not game time.
  - **Tests:** one case per rule: carried to the floor, wielded with and without
    room, floor to the backpack, falling through to a pocket, no room giving the
    hint, a floor backpack worn with its contents, and a whole stack. Plus the
    platform key mapping.

**Saves:** none; queries hold no state.
**Tests:** an item in a pile or a backpack lying just inside 2 m is in reach,
and one just outside is not; unsearched furniture shows no contents; options for
a can of beans give eat with its time, and a reason when your hands are full.
**Done when:** every caller above uses `reach()`, the existing inventory and
survival tests pass apart from the listed alignments, and nothing outside
`src/core` decides what's within reach.

### 2.2 Recipes as content

- A `recipes` section in content files (INTERACTIONS.md, "Recipes"): result,
  time in game minutes, skills, qualities, component groups, and an optional
  workstation.
- This milestone defines the ids validation needs: recipe ids, skill ids
  (content: an id and a name), quality ids and workstation ids. The state that
  uses them comes later (2.4, 2.5, 2.8).
- **Liquids:** before any recipe takes a quantity in millilitres, the milestone
  writes down how a liquid item's stored quantity maps to millilitres, how
  using part of it is represented and saved, and whether its container is kept.
  Slice 2 doesn't grow a pouring, mixing or other fluid simulation as a side
  effect; anything like that goes to BR. If no Slice 2 recipe needs a partial
  liquid, recipes count whole items only.
- The validator checks every reference (result, components, qualities, skills,
  workstation) and refuses a recipe with more than 1,024 component
  combinations. Tool qualities stay as they are (`ToolSchema`,
  `src/core/schema.ts:137-140`).
- A handful of base recipes (torch, candle, a repair kit) to exercise it.
- Initial Slice 2 recipes count whole solid items only; no millilitre components,
  partial-liquid storage, container-retention or save-format change.

**Saves:** none.
**Tests:** tests assert that invalid fixtures are rejected with the expected
diagnostic: a recipe naming a missing item, and one over the combination cap
(with its count). The CI job stays green.
**Done when:** `npm run validate` checks recipes, and both rejections are
tested.

### 2.3 Reachability

- The validator computes a least fixed point. It starts from positive-chance
  loot in furniture of templates the world actually places (including loot
  overrides on a placement), follows nested tables, and adds the loot of zombie
  types that are actually spawned. Placed templates are the hamlet's list
  (`HAMLET_TEMPLATES`, `src/core/hamlet.ts:54-57`). A recipe adds its result
  only once its inputs are reachable, so a cycle of recipes with no found item
  in it adds nothing.
- It's a static closure, not a whole-game solver. It doesn't claim every type
  shows up in every seed.
- **Component reachability** (every recipe component is found or craftable) is
  reported separately from the **content count**.
- Components alone don't prove a recipe can be made. Content acceptance also
  checks that each recipe's tools, workstation, knowledge and skills can be
  reached: a recipe can't be the only source of the tool quality it needs.
  That includes the starting torch, repair, and the books that teach recipes.
- **The count:** at caa0d31 there are 31 loot-reachable item types that aren't
  debug items (43 defined). `baseball_bat`, `fanny_pack`, `hiking_backpack` and
  `utility_vest` are defined but in no reachable loot. **Policy (BR,
  2026-10-03):** the ~80 target leaves out debug-only items, spent cases and
  severed body parts, even though spent cases and severed parts can be picked
  up.

This comes before content grows, not after it, so every later content PR is
checked as it lands. Today's validator checks references only
(`src/core/content.ts:261-373`).

**2.3 staging policy:** components and tool-quality sources are hard failures.
Knowledge, positive skill levels and named-but-unplaced workstations report
`pending: no source yet` and a count, not acceptance or CI failure. The pinned
pending-class test and 2.4/2.5/2.8 hand-offs make promotion to hard checks explicit.
Stick/wax each gain only one positive-weight entry in the placed `junk` table;
other material growth and the four historical unreachable types remain 2.11.

**Saves:** none.
**Tests:** tests assert that invalid fixtures are rejected with the expected
diagnostic: a recipe needing an item no placed loot table holds; a cycle of
recipes that only make each other; a recipe whose only source of a needed tool
quality is its own result. The same first item made craftable passes. The CI
job stays green.
**Done when:** `npm run validate` runs the check on the base pack and prints the
component closure and the count, and the rejections are tested.

### 2.4 The planner and crafting

Decided (BR, 2026-10-04): the crafting panel is approved as a first version; expect many iterations.

**Reachability hand-off:** starting knowledge must turn 2.3's pending knowledge
class into a hard source check; update the pinned pending-class test deliberately.

- `planCraft(recipe, reach, character, prefer?)`, a pure function: tries the
  combinations and keeps the cheapest that works; chooses items by gathering
  time, then smaller stacks, then worse condition, with a deterministic
  tie-break; a tool isn't also a component; `prefer` overrides an alternative.
  Returns a plan or what's missing.
- **Minimal character state:** this milestone adds the persisted skill levels
  (all starting at 0) and the starting set of known recipes that the planner
  and the panel read. 2.5 adds progression to the same state.
- **A long action in the core**, registered with the scheduler (1 Hz, steps up
  to 30 s under compression), saved as a tagged job descriptor (ADR 0002,
  "Upcoming state"). Crafting is its first new user; rest and sleep move onto it
  from `RestController` (`src/game/rest.ts`), so there is one mechanism.
- **The long-action contract**, for every kind:
  - Each kind defines its saved payload and who owns its items. A craft or a
    disassembly keeps its inputs and progress in the work item. A repair keeps
    its target item's uid, the materials already taken and its progress (2.6).
    Reading keeps the book's uid and its progress (2.5).
  - Stop keeps progress. Continuing checks the needed items, hands, tools and
    workstation again.
  - Taking apart or cancelling a work item gives back its exact inputs, once.
  - Finishing applies its effect (the result, the condition change, the
    recipes learned) once.
  - The snapshot and the fingerprint include these payloads, and loading checks
    the items they refer to. Ordinary handling jobs stay cancelled in the save
    copy. Taking a snapshot doesn't change the running action.
- **The work item:** starting needs both hands empty; the components go into a
  `work_in_progress` item in both hands, holding the recipe and progress.
  Interruptions ask Continue or Stop through the existing compression
  controller. "Continue" from the work item's options resumes; "Take apart"
  gives the components back. A tool or workstation lost mid-craft stops the
  craft at once, with the reason.
- **The crafting panel** (lit-html): known recipes, each with its time or what's
  missing (per group: needed and found; each quality with the best level in
  reach; the skill gap). **First look:** a rough screenshot for BR before the
  panel's full round.

**Saves:** skill levels and known recipes; the work item as ordinary item data;
the running long action. All in the snapshot and fingerprinted. The round trip
covers a craft saved while running and while stopped.
**Tests:** competing groups (two groups both accept rags) find the plan that
works; `prefer` is honoured or refused with a reason. With a fixed recipe,
skill and workstation, an uninterrupted craft and an interrupted and resumed
one need the same accumulated active work and give the same result; time spent
stopped moves the world on but not the job. Saving and loading a running or a
stopped craft keeps that rule and doesn't duplicate inputs or the result.
Taking a tool away mid-craft stops it. The planner for every base recipe on a
reach snapshot of 200 items is timed and recorded. Targeted cases, one per
payload or ownership risk, not a seed sweep.
**Done when:** a torch can be crafted in the game from found items, interrupted
by a shambler, continued, and saved and loaded mid-craft; the existing rest and
sleep tests pass on the new long action; **BR has approved the crafting panel
in the game.**

### 2.5 Skills, known recipes and books

**Reachability hand-off:** practice must turn 2.3's pending positive-skill class
into a hard source check, and reachable teaching books must extend the hard
knowledge check from 2.4; update the pinned pending-class test deliberately.

- Progression on 2.4's character state: finishing a craft gives practice in the
  recipe's skills; levels never go down. A skill shortens work time and gates
  recipes that need it.
- A `book` component (title, recipes taught, reading time). Reading is a long
  action with the book in your hands, under 2.4's contract; finishing it
  teaches its recipes. The `paperback` stays inert.
- 4 books.

**Saves:** skill practice, added to 2.4's state; a reading in progress as a long
action (the book's uid and progress).
**Tests:** practice crosses a level at the right craft; a recipe needing
`mechanics` 2 is refused at 1 with the gap; reading interrupted and resumed
teaches the recipe once.
**Done when:** a found book teaches a recipe that then shows in the panel, and
skills survive save → load.

### 2.6 Wear and repair

- Condition (0–1, already on items, saved and rolled by loot) starts to move: a
  melee weapon loses condition per hit, and a worn item loses condition when
  you're hit. Rates are per item, in content.
- A ruined item (condition 0) stays an item. It can't attack or supply a usable
  tool quality, but it can still be moved or dropped, repaired or taken apart.
- Repair is a recipe kind: it consumes materials, needs a tool quality, and
  raises condition by an amount that grows with skill. It runs as a long action
  under 2.4's contract.

**Saves:** a repair in progress: its target item's uid, the materials already
taken and its progress. Condition itself is already saved.
**Tests:** a weapon's condition after N hits matches its rate; a repair raises
condition by the skill's amount and consumes its materials once, also across
save and load; a ruined weapon can't attack and a ruined tool gives no quality.
**Done when:** the crowbar wears in a fight and can be repaired with found
materials.

### 2.7 Disassembly and salvage

- A finished item has one explicit disassembly yield in content: the item ids
  and counts, the integer rounding, and any skill or tool modifiers. It isn't
  worked out by reversing every alternative, or every recipe that can make the
  item. The fraction rises with skill.
- Items with no recipe (a radio, a toaster) get a `salvage` list in content.
- An unfinished work item isn't disassembled: taking it apart returns its exact
  inputs (2.4).
- "Take apart" is an option on any item with a yield or a salvage list.
- The reachability check (2.3) extends its closure with the declared yield and
  salvage outputs of reachable items, reading the same data the game does.
- Condition doesn't lower the yield in Slice 2 (BR, 2026-10-03; it may later).

**Saves:** a disassembly in progress is a work item, as in 2.4.
**Tests:** the yield at skill 0 and at the top skill matches the declared
fractions after rounding; salvage returns only listed items; a work item from an
unfinished craft gives back exactly its inputs.
**Done when:** found junk can be taken apart into the components of other
recipes, and the reachability check counts what a reachable item yields.

### 2.8 Workbenches

**Reachability hand-off:** placed benches must turn 2.3's pending workstation
class into a hard source check; update the pinned pending-class test deliberately.

- A `workstation` component on furniture: qualities it gives (such as
  `hammering`, `sawing`) and a work-time bonus. Reach (2.1) starts listing it.
- A workbench furniture type, placed by templates (the garage and hardware
  store in 2.10; one in the shed now). Building one waits for Slice 5.
- Recipes that name a workstation need one within 2 m.

**Saves:** none; furniture regenerates from the seed and holds no new state.
**Tests:** a recipe needing `sawing` is planned with the bench in reach and
refused out of reach; the bonus shortens work time by its amount.
**Done when:** a recipe that needs a workbench can be made at the shed's bench.
**First look:** the bench's look in the shed.

### 2.9 Light you make

- Torch, candle and glowstick, with their numbers from DESIGN.md ("Light").
- **Each light's rules** (plan defaults until BR approves):

  | Light | Ignite | Douse | Sprint | Stow in a pocket | Drop | Relight |
  | --- | --- | --- | --- | --- | --- | --- |
  | Torch | needs a lighter or matches in reach | yes, as an action | stays lit | not while lit | goes out | yes, while it has burn time left |
  | Candle | needs a lighter or matches in reach | yes (blow out) | goes out | goes out | goes out | yes, while it has burn time left |
  | Glowstick | snap once; it can't be reused | no | stays lit | stays lit | keeps glowing **and lights the area around it** (BR) | no |

- Remaining burn time is kept when a light goes out and is relit, and across
  save and load; nothing resets it. Burning down is closed-form, like
  `drainLight` (`src/core/lights.ts:59`). `LightSchema`
  (`src/core/schema.ts:159-168`) gains a burn time beside its battery `power`.
  The lighter and matches start using their own fuel.
- This changes today's rule that a light is held-only and goes off when put
  away (`src/game/survival.ts`), as the table says.
- **Rendering:** an all-around point light at the held item. Today only the
  flashlight's spot light exists (`src/render/flashlight.ts:84`).
- **Dropped glowsticks light their surroundings** (BR, 2026-10-03). They draw
  from the same fixed pool of shadowless point lights as carried lights. The
  pool is a constant size, with unused slots at zero intensity, so dropping or
  picking up a light never recompiles shaders. When there are more dropped
  glowsticks than free slots, the ones nearest the player get the slots, and
  the rest still glow (emissive) but light nothing. A glowstick's light is a
  small radius and dim (DESIGN.md's 15 m is the radius you see it from, not the
  radius it lights). The benchmark workload below includes dropped glowsticks.
- **The benchmark workload, recorded before the engineering round:** the number
  of carried lights supported at once, and the benchmark's exact count of
  active lights, their settings, the seed, the night time, the shambler count,
  and the reference machine and frame-budget conditions. However the lights
  are pooled is an implementation of that workload, not its definition.
- Zombies don't sense made lights yet (Slice 3). No fire spread.

**Saves:** whether each light is lit, when it was lit, and its remaining burn
time.
**Tests:** a torch lit for its burn time is out, the same in one step as ticking
every second; a candle doused halfway and relit lasts its remaining time, also
across save and load; a candle goes out on sprint; a used glowstick can't be
lit again.
**Done when:** the player can make a torch, light it and carry it at night, and
the frame budget holds on the recorded workload (the cost recorded in
Results).
**First look** and **BR's in-game approval.**

### 2.10 Hardware store and garage

- Two templates in half-metre blocks, added to the hamlet layout with their
  lots (`src/core/hamlet.ts:54-57`), each with a workbench and loot tables for
  tools, materials and parts.
- The hamlet still generates the same in any chunk order.

**Saves:** none; templates regenerate from the seed. Existing saves are refused
anyway, since the world changes.
**Tests:** the hamlet's chunk-order property test covers the new buildings; the
validator passes both templates.
**Done when:** both buildings stand in the hamlet, with loot.
**First look:** both buildings in the game.

### 2.11 Content

- About 80 item types by the validator's content count (2.3), up from 31 today.
  Materials (sticks, wax, lamp oil, wire, pipe, wood), tools that give missing
  qualities (saw, screwdriver, wrench), salvageable junk, the books, and
  repair kits. The four defined but unreachable types get loot entries or are
  removed.
- Weapon mods as plain items (an improvised suppressor, a taped-on flashlight
  mount, a foregrip) with recipes and salvage. They can't be fitted until
  Slice 3.
- About 30 recipes counting disassembly and repair, every component reachable
  and every recipe's tools, workstation, knowledge and skills reachable.

**Saves:** none.
**Tests:** none beyond the validator; content is data.
**Done when:** the validator's content count is at least 75 and the base pack
passes both reachability checks.

### 2.12 Every noise is heard

Carried from 1.10. A scenario test that every noise event the simulation makes
(footsteps by surface and speed, doors, fights, player pain) also emits a sound
event at its position, and the reverse: no positional sound without a noise
event where the content says it makes noise.

**Saves:** none.
**Tests:** that one scenario test.
**Done when:** it runs in the default test run and passes.

### 2.13 Trees, a sneak peek

Pulled forward from Slice 4 (BR, 2026-10-03), so the look and the cost of
foliage at half-metre blocks can be judged before Slice 4's region and biome
worldgen. The full plan is in DESIGN.md, "A world that feels real".

- **Blocks and behaviour:** trunk, branch, leaf and hedge blocks, each declaring
  whether it blocks movement and raycasts, and its footstep surface. Leaf litter
  is a ground surface using `footstep_leaves`. `core/footsteps.ts` maps block
  ids explicitly and falls back to stone, so the mapping has to be added.
  **BR's ruling, 2026-10-03, replaces the first look's solid foliage:** leaves
  and hedges are passable for players, zombies and physical bodies, but opaque
  to sight, aim and LOS. Trunks/branches remain solid and opaque. Content declares
  movement (`solid`) and sight (`opaque`) separately; closed/open doors retain
  their semantics. Lead defaults: melee/bites and both acoustic paths follow
  movement; picking remains opaque and body placement follows movement.
  Brushing leaf/hedge cells admits positioned rustle and hearing together through
  F4, on entry and moving cooldown; faster movement is louder/more frequent.
  The bundled leaf-footstep recording is a placeholder. Cut-out drawing does
  not change either declared rule.
- **Shapes:** three tree shapes (a broadleaf, a conifer, a young tree), stamped
  on the hamlet's open ground and in gardens, deterministically from the seed.
  Hedges line some lots. Placement keeps the spawn, roads, entrances and
  required routes clear, and doesn't overwrite buildings or the range. A tree
  crossing a chunk boundary comes from the same seed-derived placement in
  either chunk, never from whether its neighbour is already loaded.
- **Performance, near the player:**
  - Add a forest benchmark site (`?bench=1&site=forest&plan=0.5:96&seed=1&post=1`,
    once implemented). Prove that URL parsing, later runs and the exported
    results keep the forest workload.
  - BR approved shapes/hedges and varying density on 2026-10-03. Frozen seed 1:
    `min(0.75, 0.2 + valueNoise2(seed+137, x/128, z/128))` in metres, sampled at
    8 m placement-cell centres; fixed `?density=` overrides remain available.
    Mix 50/25/25, extent 768 × 768 m, ±1.5 m root jitter and existing full routes
    are unchanged. The route crosses a 0.75 patch at 16 m, beyond spawn's clearing.
    Exact parameters and routes: `docs/trees-first-look.md`.
  - Measure the full benchmark, not quick mode: 0.5 m blocks at 96 m, with the
    normal look and shadows (`post=1`), by day and by night, recording the
    resolution and device pixel ratio.
  - Compare solid and cut-out leaves on the same workload. Record mesh time,
    triangles, draw calls, memory, frame and CPU/GPU timing where available,
    the slow-frame fraction, and streaming holes.
  - Neither is assumed cheaper in advance. Density and view radius aren't cut
    to make the budget without BR's decision; if the budget can't be met, the
    measured trade-off goes to BR.
- **Out:** foliage-specific visibility, light transmission and crouching rules
  (Slice 3); cutting trees down and wood from trees, wind sway, far-terrain
  trees, biomes, grass instancing, wildlife and new ambience (Slice 4). No new
  weather, growth or decay simulation.

**Saves:** none; trees regenerate from the seed. Existing saves are refused
anyway, since the world changes.
**Tests:**
- Extend the chunk-order test with a tree whose canopy crosses a chunk
  boundary, asserting that the tree's blocks exist.
- Add targeted checks for the placement clearances, the declared collision
  and sight behaviour, and leaf footsteps.
- Content validation checks the new definitions.
- No new seed sweep.

**Done when:**
- The three tree shapes and the hedges stand in the hamlet without blocking
  required routes.
- BR has approved them in the game.
- The approved forest workload meets the frame budget in
  [CHALLENGES.md](CHALLENGES.md#1-half-metre-blocks) on the reference laptop in
  Firefox.
- The workload, build, rendering choice and results are recorded in Results,
  and the normal hamlet workload is rechecked with trees.

The reference laptop is BR's, so its run is BR's. A coder's own-host numbers
are labelled as such.
**First look** with screenshots by day and at night, and **BR's in-game
approval.**

## Content for Slice 2

| Kind | Today (caa0d31) | Slice 2 |
| --- | --- | --- |
| Item types (content count, 2.3) | 31 loot-reachable, of 43 defined | about 80 |
| Recipes (including disassembly and repair) | 0 | about 30 |
| Books | 0 (`paperback` is inert) | 4 |
| Skills | 0 | 2: `crafting`, `mechanics` |
| Building templates | 5 | 7 |
| Furniture types | 10 | 11, with the workbench |
| Loot tables | 10 | as many as the new templates need |
| Vegetation | no placed trees or hedges | three tree shapes, hedges and a leaf-litter ground surface (2.13) |

Tree shapes and their blocks aren't building templates or obtainable items, so
they don't change those two counts.

## Definition of done

- Milestones 2.0–2.13 are merged and deployed, with CI green: Biome, types,
  tests, content validation including both reachability checks, and the save
  round trip.
- The frame budget in [CHALLENGES.md](CHALLENGES.md#1-half-metre-blocks)
  remains the gate. Measure every new per-frame cost (reach rebuilds, crafting
  panel planning, made lights on the recorded workload, trees on the approved
  forest workload) on the reference laptop and record the results here.
- The default test run stays within the budget recorded in 2.0.
- The noise → positional-sound scenario test passes (2.12).
- Slice 2's playtest questions are in the playtest plan that runs at the end of
  Slice 3.
- BR has approved the crafting panel (2.4), made lights (2.9), and trees and
  hedges (2.13) in the game.
- The checklist issue is closed, with links to the evidence and to every item
  carried forward.
- A retrospective is written.

## BR's answers (2026-10-03)

1. **Wear when hit:** the outermost clothing over the hit area wears. *Later:*
   items carried in that clothing can be damaged too.
2. **Condition and performance:** condition matters only at ruin in Slice 2.
   *Later:* condition affects how an item performs.
3. **Books** teach recipes only. *Later:* books may also speed up skill
   practice.
4. **Dropped lights:** a torch or candle goes out. A glowstick keeps glowing and
   lights the area around it, from the light pool (2.9).
5. **Salvage yield** doesn't depend on condition. *Later:* it may.
6. **The ~80 item count** leaves out debug items, spent cases and severed
   parts.

The *Later* notes are recorded in EPIC.md, under "Later, after the game is more
playable".

## Results

### Trees: d24-2, 2026-10-03 — CPU lookup fixed

BR approved shapes and hedges; the new movement/sight ruling and F4 player
rustle are implemented. Frozen feature baseline **`8abee65`**, localized lookup
**`b2072af`**, both after the normal main merge `603a64a`. Workload: seed 1,
0.5 m blocks, 96 m radius, `post=1`, the field and full routes documented in
`docs/trees-first-look.md`. **5,341** placements: 2,676 broadleaf, 1,321 conifer,
1,344 young; 768 m square, unchanged jitter/mix and no thinned routes.

These are **coder-host** production-build observations: Chromium 153, ANGLE
Vulkan SwiftShader (software GPU), 7 reported cores, 1280 × 800, DPR 1.
Instrumentation overhead is not subtracted; the runs are full, not quick.
Generation runs on the main thread; meshing already runs in workers. No worker,
mesh, upload, material or shadow optimization is being shipped.

| Frozen field, opaque drawing | Before day | After day | Before night | After night |
| --- | ---: | ---: | ---: | ---: |
| Load s | 121.03 **timeout** | 98.72 | 118.23 | 89.34 |
| Column generation median / p95 ms | 129.2 / 147.2 | 1.3 / 2.9 | 131.9 / 155.4 | 1.3 / 2.5 |
| Jog main-thread work p95 ms | 751.9 | 11.3 | 317.8 | 9.8 |
| Sprint main-thread work p95 ms | 297.2 | 14.6 | 298.4 | 12.1 |
| Blocking render median ms | 929.7 | 909.6 | 823.1 | 774.9 |
| Sprint missing columns, max | 72 | 66 | 69 | 54 |

All recorded look/jog/sprint frames exceeded 18 ms on this software GPU, before
and after: **the 60 fps / ≤1% slow / no-hole budget is not met here**. The daytime
before run timed out loading and is not a valid settled-world budget result.
Generation improves about 100×; it does not make GPU-bound frames 100× faster.
Afterward, worker mesh p95 remains about 5–7 ms; mesh input/request p95 about
1 ms; CPU installation p95 about 0.2 ms, included in receive, not additive.
GL buffer submission is not GPU completion; the GPU timer extension is absent.

The change is a once-built footprint-column index used for litter and stamping,
with exclusive bounds and original placement order. Six route columns have
identical voxel SHA-256 values for global, litter-only-local, stamp-only-local
and both-local variants. Node-only medians in fixed, nonrandomized order:
145.77, 1.79, 150.13 and 1.37 ms. **Litter localization is the measured win**;
stamping-only benefit is below this experiment's variation. Six Hamlet columns
also match brute-force hashes. Negative/positive bounds and clipped writes are
covered by the targeted index regression; a dropped upper bucket makes it fail.

#### Opaque versus cut-out diagnostic

A separate, **unshipped** shader prototype keeps exactly the same voxels and
meshing, alpha-testing circular perforations at four per block edge (about 63.6%
coverage). The same mask is applied to the camera and depth-shadow pass. Daytime
camera/depth shaders compiled and foliage-tagged vertices were observed; at
23:30 this benchmark makes no shadow draws. Sight/collision policies are
unchanged. These are not a production cut-out renderer or a new approved look.

| Same optimized field | Opaque day | Cut-out day | Opaque night | Cut-out night |
| --- | ---: | ---: | ---: | ---: |
| Worker mesh p95 ms | 6.2 | 6.6 | 6.0 | 5.7 |
| Mesh triangles median / p95 | 1800 / 2882 | 1796 / 2890 | 1768 / 2882 | 1768 / 2882 |
| Load non-shadow / shadow draw calls | 4511 / 3069 | 4511 / 3069 | 3413 / 0 | 3413 / 0 |
| Load non-shadow / shadow submitted triangles | 4830871 / 6360554 | 4830871 / 6360554 | 3157433 / 0 | 3157433 / 0 |
| Peak mesh payload bytes | 16306576 | 16306576 | 16402360 | 16402360 |
| Blocking render median / p95 ms | 903.1 / 932.1 | 915.3 / 992.7 | 765.9 / 867.6 | 763.4 / 769.1 |
| Look / jog / sprint frame p95 ms | 966.6 / 1066.7 / 1033.2 | 1083.3 / 1016.7 / 966.5 | 816.6 / 950.0 / 950.0 | 816.7 / 883.3 / 1083.2 |
| Sprint missing columns, max | 63 | 60 | 56 | 56 |

World storage is 14,748,750 bytes / 1,800 chunks in all four runs. Mesh payload
is the live attribute/index byte total, not process memory or measured VRAM.
Draws are actual GL dispatches over the load phase, including post passes;
the old benchmark's final `drawCalls=1` is just its fullscreen pass. Fragment
overdraw and GPU-only timing are unavailable: triangle dispatches do not measure
pixel overdraw. One ordered run per variant, only 12–18 movement/look frames,
is not enough to rank small timing differences. All three phases remain 100%
slow. **Retain approved opaque drawing:** cut-out does not reduce geometry,
draws or memory and shows no reliable budget improvement. No density/radius
reduction, cheaper shadows or extra upload scheduler is justified by this data.

Normal Hamlet was rechecked at `b2072af`, same host/settings: load 102.25 s
without timeout, generation median/p95 1.5/2.7 ms, worker mesh p95 6.0 ms,
look/jog/sprint frame p95 916.6/900/950 ms, all slow, sprint holes max 64.
It also cannot establish a reference-laptop pass on SwiftShader.

BR's separate **pre-feature**, fixed-0.75 `603a64a` Firefox 153 / Intel HD run
reported look 60 fps, p95 17.2 ms, 0% slow; jog/sprint main-thread work p95
310/467 ms; blocking render median/p95 13/20 ms. It confirms the streaming
bottleneck but is **not** the varying-field before/after pair. A reference
Firefox after-run was still outstanding when these host results were recorded;
BR's later verdict is recorded below.
Use `?density=0.75` for an exact fixed-density comparison, and omit it for the
frozen field. Do not change density or view distance to claim a pass.

Local retained evidence under `.agent-mail/scratch/`: `d24-2-frozen-*.json`,
`d24-2-lookup-ab.{mjs,json}`, `d24-2-hamlet-lookup-ab.{mjs,json}`,
`d24-2-render-*.json`, `d24-2-render-compare.mjs`, `d24-2-cutout-transform.mjs`.
A diagnostic build initially failed from an observer variable collision; one
night observer assumed shadows must draw and rejected its completed run before
saving data. Neither is used as performance evidence; the corrected observer
checks a shadow shader only when shadows actually draw, with unchanged limits.
Application browser gates: all 13 bounded Chromium members passed (maintenance
interrupted the earlier stage 6, which was resumed, not counted as green).
The separately declared new-cap identical busy-lock A/B for d24-1 also passed
on trees and pristine main; historical failures remain disclosed, not explained
away by the later passes. Frame-budget failure is separate from green functional
gates.

#### BR's reference after-runs and d24-3 (2026-10-03)

The lead relayed BR's verdict at 17:14: **all three real-GPU after-runs** —
fixed density 0.75 by day, the frozen field by day and by night — hold **60 fps,
0% slow frames, zero holes**. The reference performance criterion is met;
this does not turn the older SwiftShader failures into passes. BR's feel verdict
is “I'd say it's good enough!”. Semi-occluding leaves and ground-level foliage
are filed in #187 and remain outside this round.

Review found one missed path: pure vertical brushing was classified as still.
d24-3 measures three-dimensional displacement after physical movement, requiring
more than twice physics' unchanged 0.0001-block contact skin. The 0.0002-block
band (0.1 mm at 0.5 m blocks) rejects one contact-skin correction on all axes
(norm ≤ √3 skins), with floating-point slack, while falling/jumping movement is
well above it. The named skin replaces the old private `EPS`; physical constants
and collision resolution are otherwise unchanged.

The actual-session seed-73 falling regression fails on `5710d54`, passes with
the fix, fails again after exact source restoration and passes after reapplying.
A stationary control checks both the true resting height 1.0001 and the nominal
floor height 1 that corrects to it. Naive 3D displacement with the old tiny
threshold emits a sound/noise pair for that correction and fails the control;
the skin-aware rule stays silent. F4 admission, positioning and cooldown are
unchanged.
