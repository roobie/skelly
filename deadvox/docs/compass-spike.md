---
read_if:
  - you review the held compass's readability, lighting or placement
  - you change dominant and off-hand debug loadout preferences
---

# Held compass readability spike (d34)

The `compass` is a 120 g, 1×2-cell electronic compass, available to authored item
placements and the debug spawn menu; it is intentionally not in hamlet loot tables yet.
The display is actual held-scene geometry, never DOM/HUD text. Putting it in a pocket
removes it. Either hand works.

## North and heading

`WORLD_NORTH` in `deadvox/src/core/coords.ts` is the single canonical declaration. It agrees
with the existing authored-template facing convention (`deadvox/src/core/templates.ts`).
`deadvox/src/game/aim.ts` and `deadvox/src/game/input.ts` use counterclockwise camera yaw; the compass
converts it to clockwise bearings. The heading unit test covers the cardinal points
and both sides of the wrap at north. The triangle points toward north; the numeric
bearing and cardinal abbreviation describe the direction the player faces.

## What the spike chose

A small procedural casing, a canvas-textured illuminated screen, a continuously
rotating north indicator, and a permanently raised reading pose. Text updates only
when its rounded degree changes; the pointer follows every rendered camera yaw.
This avoids a new raise-to-read key or a second gameplay/input authority.

An ordinary magnetic dial with printed rotating cardinals was not chosen: small
rotated letters are harder to read, and held objects currently receive sky lights,
not the world's flashlight beam. The electronic display is honestly self-lit,
including at night without another light; it does not pretend to receive torch light.
The prototype models neither battery consumption nor light spill onto the hand/world.

The first centered-at-wrist prototype was occluded by the palm. Moving the physical
casing above its bottom grip solved it; depth testing is still on. No render-order or
HUD overlay trick draws through the arm. At the default 75° FOV and 1280×720 the
heading is readable in daylight and at midnight with a real flashlight enabled.
These are development observations, not BR's final readability verdict.

## Try it

Run the normal dev server, then open:

`/?debug=1&loadout=compass&site=testHouse&time=12%3A00&seed=7&radius=64&god=1`

A fresh debug game puts the compass in the dominant hand and the existing
flashlight in the off hand. See `src/core/character.ts`, `dominantSide` and
`offSide`, and `src/debug/index.ts`, `attachDebugTools`, for loadout role resolution.
The special loadout never alters restored physical hands. For night use
`time=00%3A00`. The default HUD remains off. Outside that debug loadout, spawn/find
the item and put it in a hand normally.

## What a finished item needs

- BR's readability/size/pose verdict, improved casing/grip art and a real ground model.
- A decision between electronic and magnetic compass; electronics need a proper
  battery/backlight policy and appropriate light spill, not an eternal display.
- Loot placement and authored-map use. Adding the item changes exact-version save
  identity normally; there is no migration or compatibility path.

A wristwatch can reuse the held projection and owned canvas-texture lifetime: feed
read-only calendar time instead of yaw, update text once per displayed minute (or
rotate analog hands), provide suitable wrist/grip art, and make its illumination and
power policy explicit. Reading it must not advance the simulation clock.
