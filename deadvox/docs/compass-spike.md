---
read_if:
  - you change the held compass's readability, lighting or placement
  - you change the debug compass loadout or its hand preferences
---

# Held compass

The compass is a held object with a self-lit heading display, not HUD text. That choice keeps its information attached to the item and readable at night because held objects do not receive the world's flashlight beam. It must not add a second gameplay input or hand-motion authority. See `src/render/compass.ts`, `createCompass`, and `src/core/coords.ts`, `compassBearing`.

The display uses the world's canonical north convention and converts camera yaw to clockwise bearings. The numeric bearing and cardinal label describe facing; the triangle points north. See `src/core/coords.ts`, `WORLD_NORTH` and `headingLabel`.

The compass remains a prototype: BR's choice between electronic and magnetic operation, battery use, light spill, ground model, casing/grip art and final size/readability verdict are unresolved. Do not treat the eternal display as a power policy. The debug loadout is for a fresh game only and must not replace restored hands. See `src/debug/index.ts`, `attachDebugTools`.

A wristwatch may reuse held-display ownership, but it must show read-only calendar time and must not advance the simulation clock.
