---
read_if:
  - you change the test house, its garage, its fixture stock or its debug scenario mod
  - you change the prepared action-menu review start or its scenario dependencies
  - you change parking bays or where the test house places vehicles
  - you change the haven's rooms, landscape, lake or south-facing view
  - you add a feature demonstration near the test-house spawn
  - you change the opt-in ragdoll sample's staging or normal/debug boundary
  - you change the liquid-service demonstration's normal-mode boundary or the authored liquid-recovery look
  - you benchmark the test house at a different block scale
  - you change house supply, powered furnishings or player power controls
  - you add a feature's test prop to the showroom, or change range grading, staging, stock or catalogue admission
  - you use or change the focus hash key
  - you decide whether a temporary repair preview belongs in the showroom
---

# Test house

## Content ownership

The test house is both an evaluation bed and a personal haven. Its layout belongs to
content so changing the place does not require changing game logic. Keep the authored
house in `mods/skelly.deadvox.scenario.test-house/templates-test-house.jsonnet`, `templates`, and the lot in
`mods/skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet`, `layouts`. Keep evaluation staging in an
explicitly selected debug scenario mod rather than a runtime overlay: no scenario id
or debug check may select it in game logic. Range geometry must be authored templates
and building rows; catalogue furniture, rack items and garage stock must be hand-kept
content rather than runtime synthesis. See
`mods/skelly.deadvox.scenario.test-house.debug/layouts.jsonnet`, `layouts`, and
`mods/skelly.deadvox.scenario.test-house.debug/test-house-range.libsonnet`. The admission reason is in
`docs/test-house.md`, "Normal and debug additions".

The debug scenario mod depends on the test house's scenario mod, because it only stages
that scenario; its id extends the scenario's id. Its opt-in marker keeps it out of normal
play until a URL names it in `?mods=`, as a launcher link to the test house does when that
mod is ticked.
See `docs/pack-split.md`, "Debug mods".

The charging corner belongs to the same template and layout sources, rather than a
separate runtime look-piece overlay, so furniture, fixture loot and power share one
authored placement owner. It stands on the showroom deck beside the spawn, so charging
needs no walk. Changes to showroom staging must preserve that reach for the charger
and its service stock, so facing a feature prop does not put charging out of reach.
Site power reads finished authored placements independently of streaming; see
`packages/engine/src/core/sitePower.ts`, `placedPowerDevices`.

Keep fixture layouts marked as demos so their containers do not contribute world
loot supply. The demo flag is an economy boundary, not a save policy; see
`packages/engine/src/core/authoredSite.ts`, `AuthoredSite`.

## Haven and land

The home is a haven rather than another demonstration room: rooms hold domestic
furnishings, while the showroom and garage own evaluation props and stock.
Separate kitchen, bedroom and lounge spaces make that boundary legible. The south
window and roof terrace give the lounge and the outdoor sitting space the same open
view, rather than looking into a test yard. Warm powered light, plaster and timber
make the interior welcoming without turning it into a weathering demonstration.
See `mods/skelly.deadvox.scenario.test-house/templates-test-house.jsonnet`, `test_house_home`.

The land must feel like a real place to return to: rolling meadow leads south to a
lake and distant hills, with woodland on one side rather than trees closing every
sightline. The lake belongs beside the property, not around it; the home stands on
land, not an island. Its scale must read as a lake rather than a garden pond. Values
and placements belong to `mods/skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet`, `layouts`;
water uses the shared mechanism in `DESIGN.md`, "Water". The woodland has no loot
placements, because it is the haven's backdrop, not another supply catalogue.

The house and landscape remain normal-mode play space. Entering the lake uses ordinary
water rules, including swimming and drowning, rather than a decorative barrier.
Evaluation staging must preserve the home's water surface: a fixture visit must not dry
the lake out. Keep range placement independent of landscape bounds so enlarging the view
cannot move supplies out of reach at startup.

Evaluation floors and their vegetation clearing need one placement owner so trees cannot
occupy a firing corridor or catalogue aisle, and a separate clearing cannot drift away
from its floor.

No mobs belong here: an unsafe garden would defeat the haven's purpose. Weathering
stays off because this is a cared-for home, not a ruin. These choices do not exempt
later additions from the normal/debug decision below.

## Normal and debug additions

The house must remain selectable without debug mode. Evaluation supplies must not become
ordinary play rewards: authored staging must require the debug scenario mod, not a debug
profile check in runtime. Every addition must explicitly decide whether it belongs in the
ordinary house or evaluation staging, and record its reason here. Re-evaluate that choice
whenever the house gains something; an earlier prop grants no blanket permission.

Ordinary furnishings, charging and liquid-service stock stay in normal mode because
they demonstrate ordinary interactions without a derived supply catalogue. Sharing the
house supply makes charging respond to the same blackout as other appliances, while
nearby portable equipment avoids debug inventory edits or travel. Liquid service shares
the charging corner so the player can compare portable light sources without privileged
setup. See `mods/skelly.deadvox.scenario.test-house/templates-test-house.jsonnet`, `test_house_showroom`.
The liquid-recovery look also belongs in normal mode: authored instance state lets
ordinary inventory choices be inspected without privileged setup. See
`mods/skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet`, `liquidRecoveryStock`.
Garage evaluation stock requires explicit mod selection, and its saves require the same
admitted mod. A URL selects it through `?mods=` rather than inferring it from the scene or
debug profile. See `mods/skelly.deadvox.scenario.test-house.debug/layouts.jsonnet`, `layouts`.

The range exists only with the debug scenario mod because it is evaluation space, not
an ordinary play reward. The lane sits east of the hill so its foundation fits the normal
1 m limit, keeping one grading rule for every building row without changing the haven's
landscape. Its authored lot also keeps trees out of the firing corridor. See
`mods/skelly.deadvox.scenario.test-house.debug/layouts.jsonnet`, `layouts`, and
`mods/skelly.deadvox.scenario.test-house.debug/test-house-range.libsonnet`.

For the authored rack, accept a list edit per new gun, magazine, ammunition package or mod
item, and silent absence until listed. That maintenance cost is preferable to retaining
runtime compatibility synthesis or implying a completeness checker. Its fixed stock uses
ordinary authored spawning so admission and restoration share the same owner as other
fixture supplies. See `mods/skelly.deadvox.scenario.test-house.debug/test-house-rack.libsonnet` and `DESIGN.md`,
"Debug scenes".

Repair looks wait for the crafting requirements view in #1469 rather than keeping a
temporary showroom preview. A preview that names this scenario in runtime would put
content identity back into game logic. Requirements keep their shared panel owner under
`DESIGN.md`, "World repair selection".

The ragdoll sample requires explicit debug mod selection as well as debug tools because
staged deaths are evaluation fixtures, not residents of the haven. Its viewer stands
downrange of the authored rack so the sample stays out of domestic space. See
`src/debug/ragdollSweep.ts`, `stageRagdollSweep`; `packages/engine/src/game/ragdollConfig.ts`, `sweepFromUrl`;
and `src/config/ragdoll.jsonnet`, `sweep`.

The action-menu start requires explicit selection because its prepared player would
be a privileged head start in ordinary play. Keep it separate from other starts so
its mod selects one evaluation state without changing the site's default; see
`docs/url-mods.md`, "Start mod". Use the ordinary, passive showroom for this review:
hostile actors would interrupt held-item work and prevent comparisons beside the
furniture staging. See `mods/skelly.deadvox.scenario.test-house.action-menu/starts.jsonnet`, `starts`,
and `mods/skelly.deadvox.scenario.test-house.action-menu/pack/manifest.jsonnet`, `manifest`.

The battery-slot look start is evaluation staging of the same kind: a flashlight and a spare battery in the pockets, so the item card's battery slot is judged by loading and unloading it. See `mods/skelly.deadvox.scenario.test-house.battery-slot-look/starts.jsonnet`.

The cell-repair look start is staging for mending terrain by eye: it teaches the wall repair recipes and pockets a repair kit and scrap, and its own alcove stands the reviewer inside a brick wall whose eye-height brick the start ships already cracked through `blockDamage`, so the check is the crack at start, then the debug build tool and its repair key, because cell repair has no crafting view until #1469. The cracked brick and its damage amount are start content, never code, so the look keeps working when tuning moves. See `mods/skelly.deadvox.scenario.test-house.cell-repair-look/layouts.jsonnet`, `test_house_repair_alcove`, and `mods/skelly.deadvox.scenario.test-house.cell-repair-look/starts.jsonnet`, `blockDamage`.

The rubble look start is staging for clearing terrain by eye: its own heap stands a stepped row of masonry rubble in front of the spawn with its top at eye height, and the start ships nothing else staged, because clearing rubble needs no tool and no recipe — the check is the heap at start, then the debug build tool and its take-apart key, because rubble clearing reaches players with the world-work view, not a crafting view. The heap and its clear time are content, never code, so the look keeps working when tuning moves; its geometry is checked as a property in `test/debugScenarioMod.test.ts` — the start's own aim meets a supported rubble cell along a clear sight line, inside the reach the take-apart command admits — so the heap may move or be re-materialized without breaking the look. See `mods/skelly.deadvox.scenario.test-house.rubble-look/layouts.jsonnet`, `test_house_rubble_heap`, and `mods/skelly.deadvox.scenario.test-house.rubble-look/starts.jsonnet`, `starts`.

House power and its controls belong in normal mode: mixed generation and storage,
lighting, refrigeration demand and charging demonstrate ordinary home systems rather
than privileged test equipment. The generator switch saves fuel; the main breaker
makes a blackout test possible without pretending solar and storage stop with the
generator. See `mods/skelly.deadvox.scenario.test-house/templates-test-house.jsonnet`, `templates`, and
`docs/electricity.md`, "Authored building wiring".

The showroom pavilion and its slot row belong in normal mode. A look request must work
in the profile BR plays without debug keys, and a slot holds ordinary furniture that a
player meets in the world anyway; the demo rule keeps its fixture stock out of world
supply. The catalogue floor must join the debug scenario mod so evaluation equipment
cannot turn the ordinary haven into a warehouse. Accept a hand edit per new furniture
piece and silent absence until listed. Focus follows admitted props in either profile
because it only chooses a fresh session's start; scenario identity must not choose its
reach. See `packages/engine/src/core/authoredSite.ts`, `AuthoredSite`.

The light look needs its own opt-in mod rather than a showroom slot, because judging interior
brightness takes a windowless room with powered fixtures, and the showroom stays unlit. Its room
stands beside the lot's open ground at noon, so one visit compares fixture light with daylight;
its one start row lets a link name the mod as its start. See
`mods/skelly.deadvox.scenario.test-house.light-look/layouts.jsonnet`, `test_house_light_look`.

The destruction slot stays in normal mode because its tool, stock and breakable deck
exercise ordinary combat and furniture floor loss without privileged setup. See
`mods/skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet`, `showroom`.

The build-mode block-strike shortcuts are debug-only: bypassing weapon swings is an
evaluation convenience, not a player ability. They use the session's ordinary terrain
strike so floor loss and supply admission remain real. The existing target HUD shows
stored damage because terrain damage has no rendered appearance; the direct editor
delete remains separate and does not test destruction. See `src/debug/build.ts`,
`BuildMode`, and `packages/engine/src/game/session.ts`, `strikeTerrainCell`.

Mixed supply lets the same home demonstrate both direct generation and stored energy;
a generator-only fixture would hide their independence. Electrical values belong to
content so balancing the haven does not change its mechanisms. See
`packages/mods/skelly.electric-power/electric-power-furniture.jsonnet`, `furniture`, and
`packages/mods/skelly.electric-power/power.jsonnet`, `powerDevices`.

## Showroom

Keep feature looks in showroom slots at spawn, not in the home, garage or yard. Changing
those zones needs a design round so an evaluation prop does not repurpose the haven.
Retiring older slots keeps the display small enough to take in at a glance. The pavilion
stays unlit because light tests need dark
ground at night. See `mods/skelly.deadvox.scenario.test-house/templates-test-house.jsonnet`, `test_house_showroom`.

Keep the shelf reachable behind the player's starting point instead of crowding
their row. Its independent placement remains a showroom slot so fixture stock, focus,
house power and deck validation retain their existing owners rather than gaining a runtime
staging overlay. Content owns the placement; see
`mods/skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet`, `showroom`; `packages/engine/src/core/schema/layouts.ts`,
`ShowroomSchema`; and `packages/engine/src/core/showroom.ts`, `slotProps` and `slotPlacement`.

The catalogue needs no per-feature slot because it exposes evaluation pieces rather than
staging a feature's supplies. It shows every loaded catalogue row, hand-kept content
that any mod may add, so unlisted furniture stays absent instead of being discovered
from the registry; `docs/pack-split.md`, "Debug mods", gives the reason rows are their
own section and which debug mod holds which rows. The test-house debug mod's layout override
hosts the floor but holds no row, so the floor shows only the rows of the debug mods
selected with it. For the full showroom, start at the test house, as the launcher's test
house site does, with them together:
`?mods=skelly.deadvox.scenario.test-house.debug,skelly.deadvox.scenario.debug,skelly.deadvox.scenario.gauntlet.debug,skelly.deadvox.scenario.playtest.debug,skelly.deadvox.scenario.tutorial.debug`.
See `mods/skelly.deadvox.scenario.debug/catalogue.jsonnet`, `catalogueRows`, and
`packages/engine/src/core/showroom.ts`, `ShowroomCatalogue`.

Each row starts a new line, in load order, so each mod's pieces stay together; a short row
leaves a gap at its line's end. Keep the floor beyond the startup ring to avoid delaying
every fixture visit, and separate it from the haven to preserve the home's view. Empty
catalogue pieces must stay off the house grid so evaluation cannot change house supply.
Item and vehicle looks still belong to a slot or their owning zone.

## Focus

The hash `focus` key (`#{focus:<furniture>}`) starts a fresh session in front of a showroom prop of that type,
on the floor it stands on and facing it, so a look request can send BR straight to the
thing to look at. A slot wins over the catalogue, because a slot is that feature's own
staging. Unavailable focus must use the default spawn with a visible message rather than
silently, so a mistyped request or absent scenario mod is noticed. A restored session
ignores focus, as it ignores other
start overrides. See `packages/engine/src/game/config.ts`, `focus`, and `packages/engine/src/game/worldSetup.ts`,
`playerStartFromWorld`.

## Garage

The garage gathers vehicle and repair work so one visit can evaluate both. Keep work
space and drive-out routes clear rather than making the parked vehicle occupy every
bay. Bays and parked placements share a content owner so moving a bay moves what stands
in it. See `mods/skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet`, `bays`.

The building and its ordinary furnishings stay in normal mode. Shared house power makes
its lighting part of the same home, and roof access must not cross a vehicle bay. See
`mods/skelly.deadvox.scenario.test-house/templates-test-house.jsonnet`, `test_house_garage_ladder`.

Evaluation stock is hand-kept `buildings[].fixedLoot` in the debug scenario mod, not
runtime synthesis. This keeps scenario identity and debug checks out of stock admission.
Accept an author edit for each new tool or changed recipe: an unlisted tool is silently
absent, and recipe changes do not replenish or rearrange the shelves. No completeness
checker is implied. See `mods/skelly.deadvox.scenario.test-house.debug/layouts.jsonnet`, `layouts`, and
`mods/skelly.deadvox.scenario.test-house.debug/test-house-garage.libsonnet`.

Repair targets and components must remain within reach of their stations. Their authored
conditions and contents belong with their container destinations, not a second runtime
placement owner. Ordinary authored spawning owns arrival and restoration. See
`packages/engine/src/core/schema/layouts.ts`, `FixedLootOverride`, and `packages/engine/src/core/authoredSite.ts`,
`AuthoredSite`.

Keep floor-standing service equipment visible by the bays rather than hiding it in a
shelf pocket. Hand placement of an item loot never rolls is allowed by `docs/content.md`.
See `mods/skelly.deadvox.scenario.test-house/templates-test-house.jsonnet`, `test_house_garage`.

## Benchmark scale

Authored sites use the template block scale; do not retain a code-built house as a
fallback for other scales. A mixed-scale benchmark plan runs on a generated site such as the
forest through its start mod, since an authored site requires the authored scale; the launcher picks
the forest for such a plan. See `src/bench/run.ts`, `benchStartConfig`, `site/launcher.js`, `startSite`,
and `packages/engine/src/core/authoredSite.ts`, `AuthoredSite`.
