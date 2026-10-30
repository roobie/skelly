---
read_if:
  - you change the test house, its garage, its fixture stock or its debug gate
  - you change parking bays or where the test house places vehicles
  - you change the haven's rooms, landscape, lake or south-facing view
  - you add a feature demonstration near the test-house spawn
  - you change the opt-in ragdoll sample's staging or normal/debug boundary
  - you change the liquid-service demonstration's normal-mode boundary
  - you benchmark the test house at a different block scale
  - you change house supply, powered furnishings or player power controls
  - you add a feature's test prop to the showroom, or change its slot row or catalogue
  - you use or change the focus URL parameter
  - you stage or inspect the debug repair-targeting preview
---

# Test house

## Content ownership

The test house is both an evaluation bed and a personal haven. Its layout belongs to
content so changing the place does not require changing game logic. Keep the authored
house in `src/content/base/templates-test-house.jsonnet`, `templates`, and the lot in
`src/content/base/layouts-test-house.jsonnet`, `layouts`. Derivation of repair stock
and range supply remains logic, not a second copy of the place.

The charging corner belongs to the same template and layout sources, rather than a
separate runtime look-piece overlay, so furniture, fixture loot and power share one
authored placement owner. It stands on the showroom deck beside the spawn, so charging
needs no walk. Site power reads finished authored placements independently of
streaming; see `src/core/sitePower.ts`, `placedPowerDevices`.

Keep fixture layouts marked as demos so their containers do not contribute world
loot supply. The demo flag is an economy boundary, not a save policy; see
`src/core/authoredSite.ts`, `AuthoredSite`.

## Haven and land

The home is a haven rather than another demonstration room: rooms hold domestic
furnishings, while the showroom and garage own evaluation props and derived stock.
Separate kitchen, bedroom and lounge spaces make that boundary legible. The south
window and roof terrace give the lounge and the outdoor sitting space the same open
view, rather than looking into a test yard. Warm powered light, plaster and timber
make the interior welcoming without turning it into a weathering demonstration.
See `src/content/base/templates-test-house.jsonnet`, `test_house_home`.

The land must feel like a real place to return to: rolling meadow leads south to a
lake and distant hills, with woodland on one side rather than trees closing every
sightline. The lake belongs beside the property, not around it; the home stands on
land, not an island. Its scale must read as a lake rather than a garden pond. Values
and placements belong to `src/content/base/layouts-test-house.jsonnet`, `layouts`;
water uses the shared mechanism in `DESIGN.md`, "Water". The woodland has no loot
placements, because it is the haven's backdrop, not another supply catalogue.

The house and landscape remain normal-mode play space. Entering the lake uses ordinary
water rules, including swimming and drowning, rather than a decorative barrier.
The debug wrapper preserves the home's water surface: a debug visit must not dry the
lake out. Its range placement is independent of the landscape bounds so enlarging the
view cannot move the rack out of reach at startup. See `src/game/worldSetup.ts`,
`DebugTestHouseSite`, and `src/core/schema.ts`, `handlingRange`.

Debug floors reserve their derived footprints against authored vegetation before
streaming. Sharing those rectangles avoids trees in the firing corridor or catalogue
and prevents a separate content clearing from drifting away from its floor. See
`src/core/authoredSite.ts`, `reserveVegetation`.

No mobs belong here: an unsafe garden would defeat the haven's purpose. Weathering
stays off because this is a cared-for home, not a ruin. These choices do not exempt
later additions from the normal/debug decision below.

## Normal and debug additions

The house must remain selectable without debug mode. The range and test stock belong
behind debug mode so evaluation supplies do not become ordinary play rewards. Every
addition must explicitly decide whether it belongs in normal mode or only debug mode,
and record its reason here. Re-evaluate this choice whenever the house gains something;
there is no blanket permission based on where an earlier prop was placed.

Ordinary furnishings, charging and liquid-service stock stay in normal mode because
they demonstrate ordinary interactions without a derived supply catalogue. Sharing the
house supply makes charging respond to the same blackout as other appliances, while
nearby portable equipment avoids debug inventory edits or travel. Liquid service shares
the charging corner so the player can compare portable light sources without privileged
setup. See `src/content/base/templates-test-house.jsonnet`, `test_house_showroom`.
Derived repair stock and the handling range are debug-only because their purpose is
repeatable system evaluation. See `src/game/play.ts`, `populateTestHouseRepairCorner`, and
`src/game/worldSetup.ts`, `DebugTestHouseSite`. The range's owning rule remains in
`DESIGN.md`, "Debug scenes".

The repair-targeting preview is opt-in and debug-only because its staged damage and
supplies are evaluation setup, not ordinary rewards. It reuses the showroom's authored
prop so looking at repair never requires a second empty fixture page. Its recipe goes
through shared content admission; confirmation records an intent without starting work,
so inspection can be judged independently of work execution. The live game loop owns
aim updates, and the side panel leaves the selected piece visible. See
`src/game/config.ts`, `repairLookEnabled`; `src/game/testHouseRepairLook.ts`,
`stageRepairLook`; and
`src/game/play.ts`, `startPlay`.

The ragdoll sample is opt-in and debug-only because staged deaths are evaluation fixtures,
not residents of the haven. It uses the handling range rather than adding bodies or a
floor to domestic space. See `src/debug/ragdollSweep.ts`, `stageRagdollSweep`, and
`src/render/ragdollConfig.ts`, `sweepFromUrl`.

House power and its controls belong in normal mode: mixed generation and storage,
lighting, refrigeration demand and charging demonstrate ordinary home systems rather
than privileged test equipment. The generator switch saves fuel; the main breaker
makes a blackout test possible without pretending solar and storage stop with the
generator. See `src/content/base/templates-test-house.jsonnet`, `templates`, and
`docs/electricity.md`, "Authored building wiring".

The showroom pavilion and its slot row belong in normal mode. A look request must work
in the profile BR plays without debug keys, and a slot holds ordinary furniture that a
player meets in the world anyway; the demo rule keeps its fixture stock out of world
supply. The derived catalogue is debug-only: it shows all content wholesale, including
test equipment and pieces the world never stands alone, so in normal mode it would turn
the haven into a warehouse and put evaluation props in play. The focus parameter works
in both modes because it only chooses where a fresh session starts. See
`src/game/worldSetup.ts`, `DebugTestHouseSite`.

Mixed supply lets the same home demonstrate both direct generation and stored energy;
a generator-only fixture would hide their independence. Electrical values belong to
content so balancing the haven does not change its mechanisms. See
`src/content/base/furniture.jsonnet`, `furniture`, and
`src/content/base/power.jsonnet`, `powerDevices`.

## Showroom

The showroom is where a new feature's prop is tried first, so it stands at spawn: the
open-sided pavilion on the lot holds a short authored row of slots, and the default
spawn faces the newest slot. The pavilion has no lights of its own: they would light the
ground around the spawn, and light tests need it dark at night. See
`src/content/base/templates-test-house.jsonnet`, `test_house_showroom`.

A feature's test prop goes in the layout's slot list, never inside the house, garage or
yard, because zone content changes only by a design round and the home must stay a
home. A slot holds one prop and its fixture stock. The list is oldest first and has a
fixed capacity; when it is full, adding a slot removes the oldest, so the row stays
short enough to take in at a glance. A slot's furniture is an ordinary authored
placement, so house power, the demo loot rule and fixture stock reach it as they reach
the house. Content owns the row's position, spacing and capacity; game logic lays the
slots out and `validate` rejects a slot that leaves the deck. See
`src/content/base/layouts-test-house.jsonnet`, `showroom`, and `src/core/showroom.ts`,
`slotPlacement`.

The catalogue shows every furniture piece in content, so a new piece of furniture needs
no slot: it appears by being content. Derivation is game logic and placement settings
are content, as with the repair stock: content says where the floor lies and how the
rows are spaced, and code packs the pieces into rows, each facing its own aisle so a
focus has somewhere to stand. The catalogue shows furniture, not supply, so its
pieces stand empty and stay off the house grid. It lies west of the haven on a levelled
floor, clear of the lake and range, because its warehouse-like scale must not fill
the home's view. Keeping it beyond the startup ring avoids delaying every debug
session with wholesale catalogue construction; a focus reaches it directly. `validate`
rejects a catalogue inside that ring; see `src/core/authoredLayout.ts`, `showroomIssues`.
See `src/core/showroom.ts`, `ShowroomCatalogue`. Features
that are not furniture, such as an item or a vehicle, still need a slot or their owning
zone.

## Focus

`?focus=<furniture>` starts a fresh session in front of a showroom prop of that type,
on the floor it stands on and facing it, so a look request can send BR straight to the
thing to look at. A slot wins over the catalogue, because a slot is that feature's own
staging. A focus the site does not show, including a catalogue piece outside debug
mode, falls back to the default spawn with a visible message rather than silently, so a
mistyped request is noticed. A restored session ignores focus, as it ignores other
start overrides. See `src/game/config.ts`, `focus`, and `src/game/worldSetup.ts`,
`playerStartFromWorld`.

## Garage

The garage gathers vehicle and repair work in one building so that a single visit can
evaluate both. Bay 1 holds the parked vehicle and bay 2 stays empty floor, so part work
has a place to stand that the parked vehicle does not take. Bays are layout content and
vehicles are placed from them, so moving a bay moves everything parked in it. See
`src/content/base/layouts-test-house.jsonnet`, `bays`. The doors open onto open ground
because a vehicle must be able to drive out of either bay; `test/testHouse.test.ts`
checks that for every parked blueprint.

The garage building, its workbench, grinding wheel, shelving, ceiling lights and roof
ladder stay in normal mode as ordinary furnishings. The lights are on the house supply
like the home's lamps, because the site is one grid. The ladder climbs the doorless west
wall so that roof access never crosses a bay. See
`src/content/base/templates-test-house.jsonnet`, `test_house_garage_ladder`.

The repair stock in its containers is debug-only, as above. The layout's `repairStock`
names the building that receives it, so the house no longer needs piles of its own. See
`src/core/authoredLayout.ts`, `repairStock`.

The shelves hold the spawnable tools, vehicle service tools included, so that any repair
or service can be tried in one place. The list is derived from content, so a new
spawnable tool reaches the shelves without a test-house edit. A tool that never spawns is
not derived: content places it by hand, so it stands where an author chose rather than
wherever the next pocket is free. See `src/game/testHouseRepair.ts`, `garageToolTypes`.

The engine hoist is such a tool. It is floor-standing, and a shelf pocket hid it, so the
garage template stands it on the floor by the bays, where it reads at a glance. Hand
placement of an item loot never rolls is allowed by the rule in `docs/content.md`. See
`src/content/base/templates-test-house.jsonnet`, `test_house_garage`.

A repair needs its target and its station in reach together, so repair targets and
components go in the containers nearest a workstation. See `src/game/testHouseRepair.ts`,
`nearStations`.

Debug stock is placed at session start, before the garage's column arrives, so its
containers are spawned then, from the site's own furniture spawns, so they keep their
authored pose and contents. Arrival finds them standing and adds nothing twice, which
keeps the stock where it was placed. See `src/game/testHouseRepair.ts`,
`standingContainer`.

## Benchmark scale

Authored sites use the template block scale; do not retain a code-built house as a
fallback for other scales. Mixed-scale benchmark plans use a scale-independent default
scene instead. Explicitly selecting the house requires the authored scale. See
`src/bench/run.ts`, `benchRunFromUrl`, and `src/core/authoredSite.ts`, `AuthoredSite`.
