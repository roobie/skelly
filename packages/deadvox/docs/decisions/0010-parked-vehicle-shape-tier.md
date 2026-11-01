---
read_if:
  - you decide what collision shape a parked vehicle uses
  - you adopt parked-vehicle collision into gameplay
  - you evaluate the parked-vehicle Rapier query spike
  - you change vehicle-shape authoring values
  - you change vehicle construction so it can author a collision shape
tags: [deadvox, adr, vehicles, collision, rapier]
---

# 10. Convex hulls for parked vehicle collision

**Status:** accepted.

## Decision

Parked vehicle collision shapes are convex hulls under a volumetric contract.
Content owns the values that build those hulls.

Collision work assumes no authored shape. Vehicles are built rather than selected
from fixed bodies; see `packages/deadvox/DESIGN.md`, "A car builder, not a car customizer."

## Reasons and limits

Convex hulls are the most realistic solid tier. They give parked vehicles a
volumetric collision shape without treating the drawn model's surface as a
solid interior.

A hull ray can land slightly outside a part's bounds. Building hulls costs more
than building boxes. At the decomposition depth cap, most shell pieces remain
concave and close their hollows.

## Query-spike finding

The Rapier parked-query fixture agreed for boxes, hulls and triangle mesh across
Node, Chromium and Firefox over repeated runs using the npm f32 build. It is a
test fixture rather than gameplay.

Hulls cost several times as much as boxes to build and detach. Hull rays land
millimetres outside part bounds. Boxes are not a superset of the drawn model,
and a triangle mesh has no solid interior.

The bench code for this finding lives at PR #1509's old head
`9f31f6d0e7507255071d1d20c03ea88353978d6d`.
