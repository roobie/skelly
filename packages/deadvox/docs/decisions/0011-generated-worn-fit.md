---
read_if:
  - you add or change how a wearable item looks on a figure
  - you write or change a worn-fit template
  - you change the body's measures or a figure's attachment frames
  - you decide between rigid worn segments and skinned clothing
  - you plan crowd or corpse clothing presentation
tags: [deadvox, adr, wearables, figures, rendering]
---

# 11. Generated worn fit

**Status:** accepted.

## Decision

Soft goods get no hand-made worn model. A worn-fit template builds each item's
worn shells per body segment from the measures the body itself is built from, plus a
clearance for the item's layer. The author writes one line per item: template,
options and the ground row's finish map. The template returns both the export rows
and the item's `figureModels`, so segment, frame and `covers` have one source. See
`packages/thing-authoring-tool/worn-fit.libsonnet`; the body's measures in
`packages/thing-authoring-tool/arm-measures.libsonnet` and
`packages/thing-authoring-tool/leg-measures.libsonnet`.

Rigid goods such as hats, helmets and goggles reuse their ground model, seated on
the figure with a fit scale. See `src/core/schema.ts`, `ItemSchema`, and
`src/render/wornModels.ts`, `WornModels`.

Worn shells stay rigid per segment, with overlap at the seams. Skinning is left to
long coats and cloaks, the one case rigid segments cannot dress.

An item's size changes its stats only. The worn look always fits the wearer,
because shells come from the body's measures, not from the item's size.

Far from the camera, a dressed figure bakes into one mesh; far crowds and corpses
fall back to tinting the body's segments from the item's finish.

## Reasons

Hand-placed worn rows take several rows of tuned geometry per item, and they drift
silently whenever the body changes. At catalogue scale, that is about a thousand
rows to write and keep fitted. Generated shells follow the body by construction.

Tint alone loses collars, brims, laces and pockets, and colour alone cannot stand
in for an equipped item (`DESIGN.md`, "Worn items seen"). It is acceptable only
where the figure is too small for those details to read.

The rigid prototype read well standing, walking and crouched, so skinning would
pay only where cloth spans two moving segments.

Shells are cheap in triangles because their flat faces merge, but each finish
slot on each segment is its own draw call. A dressed figure doubles a bare one's
calls, which is why distant figures bake or tint.
