---
read_if:
  - you change the test house, its garage, its fixture stock or its debug gate
  - you change parking bays or where the test house places vehicles
  - you change the haven's rooms, landscape, lake or south-facing view
  - you add a feature demonstration near the test-house spawn
  - you change the opt-in ragdoll sample's staging or normal/debug boundary
  - you change the liquid-service demonstration's normal-mode boundary or the authored liquid-recovery look
  - you benchmark the test house at a different block scale
  - you change house supply, powered furnishings or player power controls
  - you add a feature's test prop to the showroom, or change its slot placement or catalogue
  - you use or change the focus URL parameter
  - you stage or inspect the debug repair entry
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
needs no walk. Changes to showroom staging must preserve that reach for the charger
and its service stock, so facing a feature prop does not put charging out of reach.
Site power reads finished authored placements independently of streaming; see
`src/core/sitePower.ts`, `placedPowerDevices`.

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
The liquid-recovery look also belongs in normal mode: authored instance state lets
ordinary inventory choices be inspected without privileged setup. See
`src/content/base/layouts-test-house.jsonnet`, `liquidRecoveryStock`.
Derived repair stock and the handling range are debug-only because their purpose is
repeatable system evaluation. See `src/game/play.ts`, `populateTestHouseRepairCorner`, and
`src/game/worldSetup.ts`, `DebugTestHouseSite`. The range's owning rule remains in
`DESIGN.md`, "Debug scenes".

The repair entry is opt-in and debug-only because its staged damage and supplies are
evaluation setup, not ordinary rewards. It reuses the showroom's authored prop and shared
recipe admission so evaluating repair does not require a separate world or privileged
content path. Its recipe must restore the staged damage so completion visibly differs from
cancellation; a tiny repair can finish within one compressed-time update while leaving the
same worn appearance. Derive that restoration from the target's authored durability rather
than maintaining a separate damage budget. The staged prop also exposes ordinary
movement alongside repair so service availability can be judged in the same spatial
choice rather than in an isolated widget. See `src/config/repair-look.jsonnet`, `furniture`.
The target's turnable 3D view waits for #1469; requirements belong to the
shared panel under `DESIGN.md`, "World repair selection". See
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

The destruction slot stays in normal mode because its tool, stock and breakable deck
exercise ordinary combat and furniture floor loss without privileged setup. See
`src/content/base/layouts-test-house.jsonnet`, `showroom`.

The build-mode block-strike shortcuts are debug-only: bypassing weapon swings is an
evaluation convenience, not a player ability. They use the session's ordinary terrain
strike so floor loss and supply admission remain real. The existing target HUD shows
stored damage because terrain damage has no rendered appearance; the direct editor
delete remains separate and does not test destruction. See `src/debug/build.ts`,
`BuildMode`, and `src/game/session.ts`, `strikeTerrainCell`.

Mixed supply lets the same home demonstrate both direct generation and stored energy;
a generator-only fixture would hide their independence. Electrical values belong to
content so balancing the haven does not change its mechanisms. See
`src/content/base/furniture.jsonnet`, `furniture`, and
`src/content/base/power.jsonnet`, `powerDevices`.

## Showroom

Keep feature looks in showroom slots at spawn, not in the home, garage or yard. Changing
those zones needs a design round so an evaluation prop does not repurpose the haven.
Retiring older slots keeps the display small enough to take in at a glance. The pavilion
stays unlit because light tests need dark
ground at night. See `src/content/base/templates-test-house.jsonnet`, `test_house_showroom`.

The crate is the approved repair-look target and the workbench owns the liquid-recovery
look. Keep the shelf reachable behind the player's starting point instead of crowding
their row. Its independent placement remains a showroom slot so fixture stock, focus,
house power and deck validation retain their existing owners rather than gaining a runtime
staging overlay. Content owns the placement; see
`src/content/base/layouts-test-house.jsonnet`, `showroom`; `src/core/schema.ts`,
`ShowroomSchema`; and `src/core/showroom.ts`, `slotProps` and `slotPlacement`.

The catalogue needs no per-feature slot because its purpose is to expose furniture
content wholesale, not stage a feature's supplies. Keeping it beyond the startup ring
avoids delaying every debug session, while its separation from the haven preserves the
home's view. Its empty pieces stay off the house grid so the catalogue cannot change
house supply. See `src/core/showroom.ts`, `ShowroomCatalogue`, and
`src/core/authoredLayout.ts`, `showroomIssues`. Item and vehicle looks still belong to a
slot or their owning zone.

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
