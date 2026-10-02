# Slice 2 — Craft and mend

The second slice on the [road to version 1](EPIC.md). It builds the crafting
design in [INTERACTIONS.md](INTERACTIONS.md) on top of Slice 1
([SLICE-1.md](SLICE-1.md)), and the systems in [DESIGN.md](DESIGN.md),
"Crafting" and "Light".

**Status:** draft, proposed by the lead (2026-10-03). BR approves the plan.
The scope follows BR's defaults of 2026-10-03 ("overall defaults - we might
tweak some on the way").

## Goal

The player loots the hamlet as in Slice 1, but now what they find is material.
They make a torch before the first night, mend a worn crowbar, take a broken
radio apart for its parts, read a manual that teaches them a recipe, and do the
bigger jobs at a workbench in the garage. Crafting, repair, disassembly and
reading run in compressed time, can be interrupted, and leave a half-made item
behind that can be continued later.

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
join the Slice 1 [playtest plan](SLICE-1.md#playtest-plan) there; milestone 2.0
adds them.

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
- **Skills:** two that crafting needs. DESIGN.md already names `crafting` and
  `mechanics` among its skills, so those two. They rise with use and don't
  decay.
- **Recipes known:** a small set from the start; books teach the rest. No
  schematic items yet.
- **Books and reading** as a long action, with a `book` component.
- **Wear and repair:** melee weapons wear per hit, worn clothing when you're
  hit. Repair consumes materials and needs a tool quality.
- **Disassembly:** a recipe run in reverse yields a fraction of its components,
  rising with skill. Found items with no recipe get a salvage list.
- **Workbenches:** furniture placed by templates, a `workstation` component with
  qualities and a speed bonus.
- **Light you make:** torch, candle and glowstick. Carried, burning down, and a
  real light all around (not the flashlight's beam).
- **Weapon mods as data:** mod items with recipes, found and crafted like other
  items.
- **About 80 player-obtainable item types** (not counting debug items, spent
  cases or shambler parts), about 30 recipes counting disassembly, and 4 books.
- **Two templates:** a hardware store and a garage, placed in the hamlet.
- **Reachability:** the validator checks that every recipe component can be
  found or crafted. "Found" means it's in a loot table that a template placed in
  the world uses (BR, 2026-10-03).
- **The noise → positional-sound scenario test** carried from 1.10, as an exit
  gate.

### Out (and which slice has it)

| Feature | Slice |
| --- | --- |
| Fitting and removing weapon mods; mods changing a gun in play | 3 |
| Zombies sensing light (made lights don't change `isLit`, `src/core/zombies.ts:396`) | 3 |
| Body-part wear (clothing wears without a body model; see Open questions) | 3 |
| Ammunition economy: crafting or salvaging ammo | not scheduled |
| Building a workbench; construction | 5 |
| Fire: spreading, a torch setting things alight; stoves and cooking with `heat` | 5 |
| Appliances: `controls`, `process`, `power` | 5 |
| Schematic items | after Slice 2 |

Also out: the sound polish list in EPIC.md ("Sound polish") stays there, apart
from the scenario test above (BR, 2026-10-03).

## Pulled forward and carried forward

### Pulled forward into Slice 1 (already merged)

| Item | From | Effect on exit criteria |
| --- | --- | --- |
| Shambler body regions and severing (#65), limb debris physics (#97) | 3 | Counts toward Slice 3's body work; nothing for Slice 2. Severed parts are items, but not player-obtainable for the ~80 count |
| Melee: models (#42), first-person motion and hits at contact (#115), machete and KA-BAR (#130), the primary action (#128) | 3 | These weapons wear in 2.6; Slice 3 still owes melee depth and blocking |
| Firearm handling ADR 0003 (#133), the debug range with spent-case piles (#148), debug loadout (#124), gungen gun models (#79, #82) | 3 | Debug firearms and spent cases are excluded from the item count. Firearms don't wear in Slice 2 |
| Positional sound with wall gain and low-pass (#43, #147) | 3 | Half of Slice 3's positional-sound item; Slice 2 adds the scenario test (2.12) |

In flight on 2026-10-03: the AR/AK firing cycle (#154), gunshot audio (d18),
debug axes (#151) and saves closure (#143). Not pulled forward: deadvox weapon
mods and mounts, and the ammunition economy.

### Carried forward from Slice 1

| Item | Source | Effect on exit criteria |
| --- | --- | --- |
| The first real playtest, and 1.8's "players understand why they were woken" | 1.8, 1.11 | Runs at the end of Slice 3; 2.0 adds Slice 2's questions to its plan |
| 1.8.5: BR's in-game approval, a severing sound, reviving incapacitated shamblers | 1.8.5 | Approval at the Slice 3 playtest; sound and revival stay future work. Not Slice 2 gates |
| 1.10's scenario test: every noise event emits a positional sound | 1.10 | **Slice 2 gate** (2.12) |
| 1.10's missing cues, placeholder recordings and night audibility tuning | 1.10 | Stay on EPIC's Sound polish list; not Slice 2 gates |
| Snapshot p95 on a long session | 1.11 | At the Slice 3 playtest; Slice 2 milestones that add saved state keep the round trip and size budgets of ADR 0002 |
| Occlusion culling | 1.5 results | Not planned; the 2026-09-26 measurement found it not worth doing |
| Batch actions (CHALLENGES.md §5) | 1.4 | Not a gate. `options()` (2.1) makes them cheap to add; see Open questions |

## How this slice runs

The retrospective's proposals for Slice 2
(`deadvox/docs/retro-slice-1.md`, section 4, on `docs/retro-slice-1`), as they
apply here:

- Pulling work forward from later slices is BR's decision, and gets a line in
  the table above.
- Visual work gets a rough screenshot and BR's direction before the full
  engineering round. Milestones marked **first look** below need one.
- One behaviour per test. Sweeps stay behind a flag with a named consumer. The
  default run keeps the budget 2.0 records.
- No flaky tests: fix the nondeterminism, or disable that exact test in CI with
  an owner and an issue. Never retry until green or raise a timeout to hide a
  failure.
- Each PR is checked against current main before it's opened or relayed, and
  again when main moves.
- Every milestone that adds simulation state puts it in the save snapshot and
  in the simulation fingerprint. ADR 0002 refuses any save whose version
  differs, so there are no migrations: old saves are refused, and the
  current-build round trip covers the new state.

## Milestones

Each milestone is one or two PRs, merged and deployed to Pages with CI green.
The order follows dependencies. 2.12 depends on nothing and can run alongside
the others.

### 2.0 Before code starts

Paperwork; no game code.

- ADR 0001 is closed: the inventory screen moved to lit-html in Slice 1 (#105),
  which replaces EPIC's first Slice 2 item. PROJECT.md and INTERACTIONS.md say
  so.
- **Host budget**, measured: disk per worktree with its installs, memory per
  agent and per browser test, the number of heavy runs at once, and the free
  disk to keep in reserve. Recorded in `docs/PROCESS.md` or a doc it links.
- **Default test-run budget**, measured: the wall time of each subproject's
  default test run (deadvox, gungen, mobgen) on the shared host, recorded next
  to the host budget. A milestone that pushes a run past it says why.
- The Slice 2 checklist issue is open, listing every milestone and gate below.
- Slice 2's playtest questions are added to SLICE-1.md's playtest plan.
- #143 (saves closure) is merged before any milestone that adds saved state
  (2.4 on).

**Done when:** each item above is merged or linked from the checklist issue.

### 2.1 Reach and options

- `reach(player)` in `src/core`: hands, worn items and their pockets, piles
  within 2 m and containers lying in them, searched furniture within 2 m, and
  workstations within 2 m with their qualities. Each entry carries its location
  and handling time. Cached against the versions it was built from.
- It replaces the scattered queries: `LOOT_REACH` (`src/game/session.ts:59`),
  `pilesNear` (`src/core/inventory.ts:289`), `containersNear`
  (`src/core/blockEntities.ts:292`) and `Survival.findBattery`
  (`src/game/survival.ts:172`).
- `options(thing, reach)` in the core returns every action with its time or the
  reason it can't happen. Today's `options` (`src/game/targets.ts:36`) covers
  moves only; "use" (eat, drink, switch, swap battery) moves into it from
  `Survival.use`.
- The inventory's around pane and details panel read them. Behaviour doesn't
  change.

**Saves:** none; queries hold no state.
**Tests:** reach includes an item in a backpack lying within 2 m and excludes
one at 2.1 m; unsearched furniture shows no contents; options for a can of
beans give eat with its time, and a reason when your hands are full.
**Done when:** every caller above uses `reach()`, the existing inventory and
survival tests pass unchanged, and nothing outside `src/core` decides what's
within reach.

### 2.2 Recipes as content

- A `recipes` section in content files (INTERACTIONS.md, "Recipes"): result,
  time in game minutes, skills, qualities, component groups (items, or
  millilitres for liquids), and an optional workstation.
- Skills are content too (an id and a name), so recipes can be checked against
  them.
- The validator checks every reference (result, components, qualities, skills,
  workstation) and refuses a recipe with more than 1,024 component
  combinations. Tool qualities stay as they are (`ToolSchema`,
  `src/core/schema.ts:137-140`).
- A handful of base recipes (torch, candle, a repair kit) to exercise it.

**Saves:** none.
**Tests:** a fixture recipe naming a missing item fails `npm run validate`, and
one over the combination cap fails with its count.
**Done when:** `npm run validate` checks recipes and the two fixtures fail CI.

### 2.3 Reachability

- The validator checks that every recipe component can be found or crafted:
  found means it's in a loot table (directly or nested) that a placed template
  uses; crafted means it's the result of a recipe whose components are
  themselves reachable. Placed templates are the hamlet's list
  (`HAMLET_TEMPLATES`, `src/core/hamlet.ts:54-57`). Furniture loot and zombie
  loot count as found.
- The validator reports the player-obtainable item count: items found or
  crafted, which leaves out debug items, spent cases and shambler parts.

This comes before content grows, not after it, so every later content PR is
checked as it lands. Today's validator checks references only
(`src/core/content.ts:261-373`).

**Saves:** none.
**Tests:** a fixture whose recipe needs an item no placed loot table holds fails;
the same item made craftable passes; a cycle of recipes that only make each other
fails.
**Done when:** `npm run validate` runs the check on the base pack and prints the
count, and the fixtures fail CI.

### 2.4 The planner and crafting

- `planCraft(recipe, reach, character, prefer?)`, a pure function: tries the
  combinations and keeps the cheapest that works; chooses items by gathering
  time, then smaller stacks, then worse condition; a tool isn't also a component;
  `prefer` overrides an alternative. Returns a plan or what's missing.
- **A long action in the core**, registered with the scheduler (1 Hz, steps up
  to 30 s under compression), saved as a tagged job descriptor (ADR 0002,
  "Upcoming state"). Crafting is its first new user; rest and sleep move onto it
  from `RestController` (`src/game/rest.ts`), so there is one mechanism.
- **The work item:** starting needs both hands empty; the components go into a
  `work_in_progress` item in both hands, holding the recipe and progress.
  Interruptions ask Continue or Stop through the existing compression
  controller. Stop keeps progress; "Continue" from the work item's options
  resumes; "Take apart" gives the components back. A tool or workstation lost
  mid-craft stops the craft at once, with the reason.
- **The crafting panel** (lit-html): known recipes, each with its time or what's
  missing (per group: needed and found; each quality with the best level in
  reach; the skill gap). **First look:** a rough screenshot for BR before the
  panel's full round.

**Saves:** the work item is ordinary item data; the running long action is in
the snapshot and fingerprinted. The round trip covers a craft saved mid-way.
**Tests:** competing groups (two groups both accept rags) find the plan that
works; `prefer` is honoured or refused with a reason; a craft interrupted and
resumed ends at the same game time and with the same result as one run straight
through; taking a tool away mid-craft stops it; the planner for every base recipe
on a reach snapshot of 200 items is timed and recorded.
**Done when:** a torch can be crafted in the game from found items, interrupted
by a shambler, continued, and saved and loaded mid-craft; the existing rest and
sleep tests pass on the new long action.

### 2.5 Skills, known recipes and books

- The character has a level and practice per skill (`crafting`, `mechanics`).
  Finishing a craft gives practice in the recipe's skills; levels never go
  down. A skill shortens work time and gates recipes that need it.
- Known recipes: a starting set (simple ones, such as the torch); the panel
  shows only known recipes.
- A `book` component (title, recipes taught, reading time). Reading is a long
  action with the book in your hands; finishing it teaches its recipes. The
  `paperback` stays inert.
- 4 books.

**Saves:** skill levels, practice and known recipe ids, under the character
record (ADR 0002, "Upcoming state"); a reading in progress as a long action.
**Tests:** practice crosses a level at the right craft; a recipe needing
`mechanics` 2 is refused at 1 with the gap; reading interrupted and resumed
teaches the recipe once.
**Done when:** a found book teaches a recipe that then shows in the panel, and
skills survive save → load.

### 2.6 Wear and repair

- Condition (0–1, already on items, saved and rolled by loot) starts to move: a
  melee weapon loses condition per hit, and a worn item loses condition when
  you're hit. Rates are per item, in content.
- A ruined item (condition 0) stays an item; it can only be repaired or taken
  apart.
- Repair is a recipe kind: it consumes materials, needs a tool quality, and
  raises condition by an amount that grows with skill. It runs as a long action.

**Saves:** none new; condition is already saved.
**Tests:** a weapon's condition after N hits matches its rate; a repair raises
condition by the skill's amount and consumes its materials; a ruined weapon
offers repair and take apart, and nothing else.
**Done when:** the crowbar wears in a fight and can be repaired with found
materials.

### 2.7 Disassembly and salvage

- Disassembly is the long action with a recipe reversed: the item goes in, a
  fraction of the components come out, rising with skill. Condition lowers the
  yield.
- Items with no recipe (a radio, a toaster) get a `salvage` list in content.
- "Take apart" is an option on any item with a recipe or a salvage list.

**Saves:** a disassembly in progress is a work item, as in 2.4.
**Tests:** the yield at skill 0 and at the top skill matches the fractions;
salvage from a list returns only listed items; a work item from an unfinished
craft gives back exactly its components (not the disassembly fraction).
**Done when:** found junk can be taken apart into the components of other
recipes, and the reachability check (2.3) counts what a reachable item
disassembles or salvages into as obtainable.

### 2.8 Workbenches

- A `workstation` component on furniture: qualities it gives (such as
  `hammering`, `sawing`) and a work-time bonus. Reach (2.1) already lists it.
- A workbench furniture type, placed by templates (the garage and hardware
  store in 2.10; one in the shed now). Building one waits for Slice 5.
- Recipes that name a workstation need one within 2 m.

**Saves:** none; furniture regenerates from the seed and holds no new state.
**Tests:** a recipe needing `sawing` is planned with the bench in reach and
refused out of reach; the bonus shortens work time by its amount.
**Done when:** a recipe that needs a workbench can be made at the shed's bench.
**First look:** the bench's look in the shed.

### 2.9 Light you make

- Torch, candle and glowstick, with their numbers from DESIGN.md ("Light"):
  - the torch lights all around and can't be switched off, only doused or
    dropped; it burns out
  - the candle is small and goes out when you sprint
  - the glowstick is found, not made, and is used once
- Lights burn fuel or time: `LightSchema` (`src/core/schema.ts:159-168`) gains a
  burn time beside its battery `power`, and burning down is closed-form, like
  `drainLight` (`src/core/lights.ts:59`). The lighter and matches start using
  their own fuel.
- Rendering: an all-around point light at the held item. Today only the
  flashlight's spot light exists (`src/render/flashlight.ts:84`). To keep the
  shader cost steady, a fixed number of point lights is reused rather than added
  and removed.
- Zombies don't sense made lights yet (Slice 3). No fire spread.

**Saves:** whether each light is lit and when it was lit, so burn-down is exact
after load.
**Tests:** a torch lit for its burn time is out, the same in one step as ticking
every second; a candle goes out on sprint; a used glowstick can't be lit again.
**Done when:** the player can make a torch, light it and carry it at night, and
the frame budget holds with the shambler benchmark at night plus the most
lights the pool allows (the cost measured and recorded in Results).
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

- About 80 player-obtainable item types, by the validator's count (2.3), up from
  35 today. Materials (sticks, wax, lamp oil, wire, pipe, wood), tools that give
  missing qualities (saw, screwdriver, wrench), salvageable junk, the books, and
  repair kits.
- Weapon mods as data: mod items (an improvised suppressor, a taped-on
  flashlight mount, a foregrip) with recipes and salvage. They can't be fitted
  until Slice 3.
- About 30 recipes counting disassembly, and every component reachable.

**Saves:** none.
**Tests:** none beyond the validator; content is data.
**Done when:** the validator counts at least 75 player-obtainable items and
passes reachability on the base pack.

### 2.12 Every noise is heard

Carried from 1.10. A scenario test that every noise event the simulation makes
(footsteps by surface and speed, doors, fights, player pain) also emits a sound
event at its position, and the reverse: no positional sound without a noise
event where the content says it makes noise.

**Saves:** none.
**Tests:** that one scenario test.
**Done when:** it runs in the default test run and passes.

## Content for Slice 2

| Kind | Today | Slice 2 |
| --- | --- | --- |
| Item types (player-obtainable) | 35 | about 80 |
| Recipes (including disassembly and repair) | 0 | about 30 |
| Books | 0 (`paperback` is inert) | 4 |
| Skills | 0 | 2: `crafting`, `mechanics` |
| Building templates | 5 | 7 |
| Furniture types | 10 | 11, with the workbench |
| Loot tables | 10 | as many as the new templates need |

## Definition of done

- Milestones 2.0–2.12 are merged and deployed, with CI green: Biome, types,
  tests, content validation including reachability, and the save round trip.
- The frame budget from 1.0 holds, unchanged. Every new per-frame cost (reach
  rebuilds, the crafting panel's planning, made lights) is measured on the
  reference laptop and recorded in Results.
- The default test run stays within the budget recorded in 2.0.
- The noise → positional-sound scenario test passes (2.12).
- Slice 2's playtest questions are in the playtest plan that runs at the end of
  Slice 3.
- BR has approved the crafting UI and made lights in the game.
- The checklist issue is closed, with links to the evidence and to every item
  carried forward.
- A retrospective is written.

## Open questions

- **Wear without a body model:** which worn item wears when you're hit? A
  proposal: the torso item, or the outermost item in a random slot, until
  Slice 3's body parts say where the hit landed.
- **Does condition change what an item does** (a worn bat hits softer), or only
  when it breaks?
- **Books and skills:** DESIGN.md says skills rise faster when you read the
  right book. Does a book also give practice, or only recipes, in Slice 2?
- **A dropped torch:** does it keep burning and lighting the ground in a pile?
- **Mod items:** a plain item with a category, or a `mod` component with a mount
  type now, shaped by gungen's mount data? The first is enough for "data only".
- **Batch actions** (CHALLENGES.md §5): build them in Slice 2 on top of
  `options()`, or wait for the playtest?
- **Skill names:** INTERACTIONS.md's recipe example uses `survival`; this plan
  follows DESIGN.md's `crafting`. The example changes with 2.2.

## Results

Filled in as milestones land.
