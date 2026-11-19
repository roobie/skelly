---
read_if:
  - you review item-lamp view culling, glass visibility or a returning lamp's shadow
---

# Lamp view look

Open the [fixture](/?start-mod=skelly.deadvox.scenario.test-house.lamp-view-look#{debug:true}).
The closed room must not spend shadow work while the glazed room remains lit through its pane.
This separates seeing the source from seeing what it illuminates, without ignition or skill setup.

Use the debug panel's item-shadow readout while facing the rooms, then turn away and back.
The closed room must contribute to culled lamps, not drawn maps. The glazed room must remain illuminated;
a settled dropped map need not draw again until a caster changes. Turning back must refresh it before
showing its shadow. Walk around the closed room: its exterior must not glow from the lamp inside.

The authored scene lives in `templates.jsonnet`, `room`, and the lit sources in `starts.jsonnet`, `kit`.
The counters come from `packages/presentation/src/render/shadows.ts`, `Shadows.itemStats`;
`drawn` counts maps refreshed in that frame, not lamps whose cached maps are still in use.
