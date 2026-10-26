---
read_if:
  - you change the held compass's look, readability, lighting or placement
  - you change the debug compass loadout or its hand preferences
---

# Held compass

The compass is a held object, not HUD text, so its information stays attached to the item. It must not add a second gameplay input or hand-motion authority. See `src/render/compass.ts`, `createCompass`, and `src/core/coords.ts`, `compassBearing`.

The compass reads as a magnetic needle compass: a light card with bold cardinal marks and a long needle with a coloured north end, on a centre pin. A screen is illegible at hand distance, while a few large analogue shapes still read at that size. Its colours, marks and proportions are content on the model. See `src/content/base/models-items.jsonnet`, `dial`, and `src/core/schema.ts`, `CompassDialSchema`.

The whole card turns with the needle, so its letters always name real directions and the mark on the rim reads the heading. It uses the world's canonical north convention and converts actor yaw to a clockwise bearing. See `src/core/coords.ts`, `WORLD_NORTH`.

A live handheld uses its exported model plus live parts on the model's display and named anchors. The world and hand therefore share one model while the card stays dynamic. How a display is held is in `DESIGN.md`, "Held screens". See `src/render/actorAnimator.ts`, `ActorAnimator`, and `packages/thing-authoring-tool/src/catalogue.ts`, `buildItem`.

The compass is dark at night: it has no glow and no light of its own. It is a plain physical object with no self-lit parts, so it is lit like the rest of the held model and darkens with the world's light.

The compass remains a prototype: its casing and grip art and its final size are unresolved. The debug loadout is for a fresh game only and must not replace restored hands. See `src/debug/index.ts`, `attachDebugTools`.

A wristwatch may reuse held-display ownership, but it must show read-only calendar time and must not advance the simulation clock.
