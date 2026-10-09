---
id: skelly::deadvox-interactions
description: Design for how the player acts on items, recipes and appliances, and how the simulation and the UI divide that work
tags: [deadvox, design, inventory, crafting, appliances, ui]
created: 2026-09-26
status: active
read_if:
  - you're implementing or changing furniture-based rest and sleep
  - you're reviewing long-action continuation and save ownership
  - you change item activation, crafting or appliance ownership boundaries
  - you change how handling gates primary actions
  - you change movement or action input during long actions
  - you reconcile BR's interaction rulings with actor handedness
  - you change quickbar hand displacement or automatic item-stow behavior
  - "you change inventory handling costs or training"
  - you change long-action admission or interruption behavior
---

# deadvox — interactions

How the player acts on the world's items: moving them, using them, crafting
with them, and running appliances. This is the engineering under the
inventory, crafting and base-building parts of [DESIGN.md](DESIGN.md), and the
contract between the simulation and the UI. Read it with:

- [DESIGN.md](DESIGN.md): "Items and inventory", "Crafting", "Base building and
  electricity", "Catch-up simulation" and "UI principles".
- [CHALLENGES.md](CHALLENGES.md): 3 (compressed time), 5 (inventory speed),
  7 (saves) and 11 (catch-up).
- [ADR 0001](docs/decisions/0001-ui-rendering-with-lit-html.md): the screens are
  drawn with lit-html.

[[THIS is_grounded_by: DESIGN.md]]
[[THIS is_grounded_by: CHALLENGES.md]]
[[THIS is_grounded_by: docs/decisions/0001-ui-rendering-with-lit-html.md]]

**Status:** agreed. Crafting lands in Slice 2 and appliances in Slice 5
([EPIC.md](EPIC.md)); some of it shapes milestones 1.8 (rest and sleep) and 1.9
(saves) in Slice 1. The questions it left open are answered under "Decisions"
at the end.

## Why this needs a design

Moving items is done, and it already has a shape worth keeping:
`Inventory.plan()` answers whether a move can happen and how long it takes,
without changing anything; `HandlingQueue` holds the move for its handling time;
and `Inventory.move()` checks it again when the time is up, because the world
may have changed. The inventory screen shows the plans (every place an item can
go, with its time or the reason it can't) and queues the one you pick.

Crafting and appliances add three things moves don't have:

- **Many items at once.** A recipe takes components and tools from anywhere
  within reach, with alternatives, so "can I do this?" is a search, not a check.
- **Game time.** Crafting is a long action that runs compressed, can be
  interrupted, and leaves something behind when it is. Appliances run without
  the player at all, including while their chunk is unloaded.
- **State that lasts.** A half-made item, a stove that's lit, food in a fridge:
  all of it has to be saved, caught up, and shown.

Without a shared shape, each screen and each key (inventory, quickbar, E,
crafting, an appliance panel) grows its own copy of the rules. This document
sets the shape once.

## Principles

1. **The core decides, the UI shows.** Every rule is in `src/core`. The UI
   never checks a rule itself; it shows what the core's queries return and sends
   commands.
2. **Queries change nothing; commands are checked twice.** A query can run
   every redraw. A command is checked when it's given and again when its time is
   up, as moves are now.
3. **One answer to "what's within reach".** Moves, crafting, appliances and the
   quickbar all use the same query.
4. **Everything that takes time is a job.** Handling jobs take real seconds at
   1×; long actions take game time and run compressed. Nothing happens
   instantly except what the design says is instant (a flashlight's switch).
5. **State is plain data on items and block entities.** No closures and no
   hidden system state, so saves and catch-up see all of it.
6. **UI state stays in the UI.** Selection, drag, filters and the open panel
   aren't game state and aren't saved.

## Layers

```
src/core    model      Inventory, BlockEntities, items, recipes, skills
            queries    reach, plan a move / use / craft / operate, options for an item
            commands   move, use, craft, operate, search, cancel   → jobs
            time       HandlingQueue (real seconds), LongAction (game time), processes
src/game    glue       the player's position and hands → reach; keys → commands
src/ui      views      view models built from queries → lit-html templates
            controls   drag and drop, focus, filters (UI state only)
```

The arrow only points one way: `ui` reads `core` and calls its commands;
`core` never knows the UI exists. That's already true, and the design keeps it.

## Reach

`reach(player)` is a snapshot of every item the player can use without walking:

- the hands, worn items, and every pocket inside them
- piles within 2 m, and the pockets of containers lying in them (a backpack
  on the ground)
- searched furniture within 2 m, and its pockets; unsearched furniture shows
  as "search first", never with its contents (the UI only shows what the
  character knows)
- workstations within 2 m, with the qualities they give (below)

Each item carries its location and the handling time to bring it to your
hands, from `src/core/inventory.ts`, `Inventory.handlingTime`. The inventory's
"around" pane, crafting planner, gathering, appliance panel and a dead light's
spare-battery search all read the same snapshot. Inventory Management speeds
ordinary transfers and their derived gathering estimates, box unpacking and
furniture searches, and awards practice only after successful completion.
Firearms Combat owns firearm readiness, reload, rack, magazine insert/remove and
firearm-attachment fitting/removal. Until Gunsmithing takes attachment work over,
Firearms Combat speeds it, and fitting and removing train Firearms Combat (tier
1). Inventory Management neither speeds nor trains from any of them.

The snapshot is cached against the inventory, block-entity and player-block
versions, so a redraw that changes nothing does not rebuild it. There is one
counter per store. Lit-html updates only changed DOM, so coarse invalidation is
cheap; add per-place counters only if Slice 5 profiling shows that building view
models costs too much.

## Options: one list of what you can do

For a selected item (or appliance), `options(thing, reach)` returns every action
with either its time or the reason it can't happen:

```ts
type Option = {
  label: string;               // "Put in hoodie pocket 1", "Eat", "Craft: torch"
  command: Command;            // what to send if chosen
  time?: number;               // seconds (handling) or game seconds (long action)
  reason?: string;             // set when it can't happen now
};
```

The details panel already does this for moves. With `options` in the core, the
details panel, keyboard shortcuts, the quickbar and a future context menu all
draw from the same list, and a new component (a `book` you can read) adds its
options in one place. `Survival.use` in `src/game` moves into the core as the
source of the "use" options and commands.

## Quickbar hand transfers

Quickbar transfers make a best effort to stow displaced hand items. An item
without a free cell stays in its hand; items already stowed stay put. The
requested item is taken only when its required hands are free, and the notice
names each item that could not be stowed. No item is dropped automatically.
See `src/core/options.ts`, `quickbarTake`.

## Crafting

### Recipes

Recipes are content, checked by the validator like the rest:

```json
{
  "id": "torch",
  "result": { "item": "torch", "count": 1 },
  "time": 20,
  "skills": { "crafting": 0 },
  "qualities": { "cutting": 1 },
  "components": [
    [{ "item": "stick", "count": 1 }],
    [{ "item": "rag", "count": 2 }],
    [{ "item": "wax", "count": 1 }]
  ],
  "workstation": null
}
```

`time` is in game minutes. Each entry in `components` is a group of
alternatives, as in DESIGN.md (`2 × [plank | branch]`). Initial Slice 2 recipes
count whole solid items only. Before accepting any millilitre component, define
stored quantity, partial use and saving, and whether its container survives; no
pouring or mixing simulation is implied. The validator checks references; loot
or craft reachability is milestone 2.3 (CHALLENGES.md 6).

### The planner

`planCraft(recipe, reach, character, prefer?)` is a pure function. It returns
either a plan:

```ts
type CraftPlan = {
  recipe: string;
  components: { item: Item; count: number; from: Location }[];
  tools: { item: Item; quality: string }[];   // stay where they are
  workstation?: BlockEntity;
  gather: number;   // game seconds to bring components to hand
  work: number;     // game seconds of work, after skill and workstation
};
```

or what's missing: per group, how many are needed and how many there are; each
quality with the best level within reach; the skill gap.

How it chooses:

- **Alternatives.** Groups can compete for the same item (two groups both
  accept rags). Recipes are small (a handful of groups, a few alternatives
  each), so the planner tries the combinations and keeps the cheapest that
  works, rather than choosing group by group and failing where a different
  choice would have worked. A recipe with more than 1,024 combinations is a
  validator error, which keeps this bounded.
- **Which items.** Among items of the chosen type: fewest gathering seconds
  first, then smaller stacks first (use up the leftovers), then worst condition
  first (use up the damaged ones), and never an item that's a container with
  something in it.
- **Tools.** One item can give several qualities (a multitool). A tool isn't
  also a component in the same craft.
- **The player's choice.** `prefer` overrides the alternative in a group
  ("branches, not planks"). The crafting panel sets it; the planner still says
  if the preference can't be met.

The crafting panel runs the planner for every known recipe on each redraw. To
keep that cheap, the reach snapshot is indexed once by item type and by quality,
and each recipe's result is cached against the reach it was planned from.

### The long action

A craft is a **long action**: one object in the core, registered with the
scheduler like needs (1 Hz, steps up to 30 s under compression), so it advances
at any compression and in catch-up by the same code.

1. **Start.** Both hands must be empty. Nothing puts away what you hold for
   you: clearing your hands is the player's own act, so with anything in them
   the craft option carries the reason ("Hands full") instead of a time.
   `craft(recipe, prefer)` plans again. If the plan holds, the
   components are taken out of the world into a **work item**: an item of a
   generic `work_in_progress` type that holds the recipe id, the progress, and
   the components in its own pocket. It goes into your hands, both of them, as
   DESIGN.md asks ("both hands busy"), so the half-made thing shows in first
   person. Then compression starts (`Simulation.compress`).
2. **Working.** Progress goes up by the game seconds that pass: gathering
   first, then work. Every step checks that the tools and the workstation are
   still within reach and usable. If one has been moved away, destroyed or
   otherwise lost, the craft stops at once, as if you had chosen Stop, with
   the reason; the work item keeps its progress, and "Continue" works again
   once the tool is back.
3. **Interrupted.** Compression drops to 1× and asks Continue or Stop
   (the compression controller does this already; 1.8 gives it its screen). Stop leaves the work item in your hands with its
   progress. You can walk away with it, put it down, and later choose
   "Continue: torch" from its options.
4. **Finishing.** When progress reaches the total, the work item becomes the
   result, and skills go up.
5. **Cancelling.** "Take apart" on a work item gives back its components.

Because the components live inside the work item, nothing else can take them
mid-craft, there is no reservation table to keep in step with the world, and a
save holds the whole craft as ordinary item data.

Disassembly runs the item's authored yield or salvage list in reverse.

## Appliances

An appliance is a block entity with components, like an item type: behaviour
comes only from components, never from its id.

| Component | What it adds | Examples |
| --- | --- | --- |
| `container` | Pockets (already there) | fridge, stove oven, crate |
| `controls` | Switches and settings, each a command with a short handling time | stove knobs, a generator's switch |
| `workstation` | Qualities for recipes within 2 m, and a work-time bonus | workbench (`hammering`, `sawing`), a lit stove (`heat`) |
| `process` | Something that runs on its own over time | a generator burning fuel, a stove heating a pot, a charger |
| `power` | A node in the electricity graph | generator, fridge, lamp |

### Opening one

E on an appliance opens the inventory with the appliance beside you, the way
searching a cupboard does now: its pockets as grids, its controls, and the
state of its process ("heating, 12 min left"). Moving items in and out is
ordinary moves. Switching it on is an `operate` command.

### Processes and catch-up

A process runs on the scheduler while its chunk is loaded, and catches up in
closed form when the chunk loads again (DESIGN.md, "Catch-up simulation";
CHALLENGES.md 11 asks for a property test that the two agree). Most processes
are **constant rates between events**: fuel burns at a rate while the generator
runs, a stove heats while it's lit. So each process stores when its current
rate started, and computes forward from there.

The rule that makes this work: **settle on change.** When anything changes a
rate (an item goes into the fridge or comes out, the power fails, the fuel runs
out), the process first brings its state up to that moment, then starts the new
rate. In an unloaded chunk the change times come from the closed form (when the
fuel ran out, then when the batteries emptied), and settling runs at those
times in order.

Food in a fridge shows the rule at work without new state. Food rots from
`item.made` (`core/food.ts`): its age is the clock minus when it was made. A
fridge slows rotting to a share `k` of the normal rate. When an item leaves the
fridge after `d` seconds inside, its `made` moves forward by `(1 − k) × d`.
From then on it has aged as if it had spent those seconds rotting at the normal
rate, and `spoilage` stays exactly as it is.

### Cooking

Cooking is crafting with a workstation quality: a lit stove within reach gives
`heat`. A recipe that needs `heat` for its whole work time needs the stove to
stay lit; if it goes out, the check at the end fails with "The stove went out".
Processes that belong to the appliance rather than to you (a pot of water left
to boil) are a `process`, not a player craft: they don't hold your hands and
don't need compression.

## The UI contract

- **View models.** Each screen has a function in `src/ui` that builds a plain
  object from core queries (reach, options, plans), and a lit-html template that
  draws that object. View models are tested in Node without a DOM.
- **Redraw.** Each frame, a screen builds a key from the versions it depends on
  and its UI state; when the key changes it calls `render()`.
  `src/ui/inventoryScreen.ts`, `InventoryScreen.update`, uses this pattern, and
  lit-html updates only changed content so scroll position, focus and hover survive.
- **Events send commands.** A click or a key sends a command and shows the
  reason if it's refused. The screen never changes the model directly.
- **Drag and drop stays a controller.** It's UI state (what's dragged, where the
  pointer is, whether it's rotated) and produces a `Target` for a move.
- **No reactivity in the core.** The core keeps plain objects and version
  counters; nothing in `src/core` imports the UI library.

## Saves

Everything this design adds is plain data: work items (recipe id, progress,
components), appliance state (switches, when the current rate started, settled
values), known recipes and skill levels. Two consequences for 1.9:

- **Long actions are data.** A long action is saved as its kind and progress
  (for a craft, that's the work item), never as a closure. Handling jobs are
  tagged data with their handlers in the runtime; a save snapshot cancels
  ordinary pending handling jobs in the snapshot copy, without changing the
  live queue.
- **Settle before saving.** Saving projects every running process to the save
  time in the snapshot copy, so a loaded save continues from exact values. The
  running process itself isn't changed: taking a snapshot is pure
  ([ADR 0002](docs/decisions/0002-saves.md)).

## Testing

- The planner: fixture recipes and reach snapshots, including competing groups,
  preferences, and missing qualities.
- Long actions: with a fixed recipe, skill and workstation, a craft interrupted
  and resumed needs the same accumulated active work, and gives the same result,
  as one that ran straight through. Time spent stopped moves the world on but
  not the job.
- Processes: catch-up in one step equals ticking every second (CHALLENGES.md 11),
  including a rate change in the middle.
- View models: built from fixtures and compared, without a DOM.

## Remaining work

Slice 5 adds `controls`, `process` and `power` to block entities, settles
processes on rate changes and adds the appliance panel.

## Long-action input and wake behavior

Movement and gameplay action input are ignored while resting, sleeping or
crafting. Book reading runs only while its paper surface is open: closing the
page stops the job and keeps its progress, and moving closes the page before the
movement input passes through. Reopening the same book resumes the job. This
keeps the player from being locked in place and makes reading happen only while
the page is in front of them. The paper carries its progress and completed
endpoint, so the player can tell how long is left and when reading is done even
with the HUD off. See `src/game/play.ts`, `readingMovementAction` and
`stopReadingOnClose`, `src/ui/reading.ts`, `mountReading`, and
`src/core/longAction.ts`, `LongActions`.

Each other action keeps its own close, cancel or wake behavior:

- Rest can be cancelled with F on its anchor or X; movement does not stop it.
- Sleep starts at sleepable furniture. Movement and X do not stop it; an emitted
  interruption wakes the player and clears sleep.
- Craft is stopped by its cancel key or an emitted interruption; Enter resumes
  it after an interruption.

A nearby or aware hostile does not block admission or interrupt by itself. The
player decides whether the area is safe before starting a long action. Real
emitted events, such as a hit or critical need, interrupt it. Long actions run
in compressed time. `src/core/longAction.ts`, `LongActions.syncInterruption`,
wakes sleepers, and `src/core/sim.ts`, `Simulation.checkInterruptions`, keeps
events live.

## Decisions

These contracts define the interaction boundary:

1. **Hands for crafting.** A craft refuses until both hands are empty. Putting
   things away is the player's deliberate act; the system never stows items to
   make room for a craft.
2. **Tools.** Losing a tool or workstation during a craft stops the action at
   once. The work item keeps its progress, so the craft can resume when the
   requirement is available again.
3. **Where materials can be.** Items inside containers within the 2 m reach
   count at their pocket's handling time, including a backpack on the ground.
4. **Partial stacks.** When gathering time is equal, smaller stacks are used
   first, so leftovers get used up.
5. **Per-place versions.** One inventory counter per store remains the default.
   BR decides whether to add per-place counters if Slice 5 profiling shows that
   view-model rebuilding costs too much.
6. **Held-item primary action.** The held item owns its primary action.
   Dispatch by item capability, mapping pointer actions to
   dominant/off-hand roles without remapping physical inventory slots. A held
   item must not become a fist or redirect to the other hand, and a restored
   physical fist sequence must not be reseeded from dominance. See
   `src/core/character.ts`, `dominantSide` and `offSide`, and
   `src/game/primaryAction.ts`, `selectPrimaryAction`.
7. **Handling gates primary actions.** While handling is busy, primary actions
   from either hand are refused. Whether a one-handed job leaves the free hand
   usable remains an open choice for BR.
8. **Held igniter.** Activating a held igniter lights an unlit light in the other
   hand when that light requires a firestarter. An igniter in reach but not held
   does not qualify; without an eligible igniter, activation is refused and no
   charge is spent. Whether matches alone strike a brief light remains open for
   BR. See `src/game/primaryAction.ts`, `ignitionTargetForHand`, and
   `src/game/survival.ts`, `Survival.use`.
9. **Held consumables.** Food and drink use their `food` component; medical items
   are selected by category. The primary action calls `Survival.use`, while
   quickbar actions remain owned by `Survival.useFromQuickbar`. Until the Slice 3
   body model includes wounds, using a bandage is refused. See
   `src/game/survival.ts`, `Survival.use`.
