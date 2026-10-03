# Slice 2.13 trees — first look (d24-1)

This round stops at workload approval. There is no cut-out renderer, LOD, wind,
visibility exception or performance optimization. BR must freeze the workload
before solid/cut-out measurement; density and view radius will not be reduced to
meet a budget without BR's decision.

## Declared block rules

| Block ID | Movement | Player raycast / zombie sight | Player footstep | Shambler footstep |
| --- | --- | --- | --- | --- |
| `tree_trunk` | solid | blocks | `footstep_wood` | `shambler_step_wood` |
| `tree_branch` | solid | blocks | `footstep_wood` | `shambler_step_wood` |
| `leaves` | solid | blocks | `footstep_leaves` | `shambler_step_leaves` |
| `hedge` | solid | blocks | `footstep_leaves` | `shambler_step_leaves` |
| `leaf_litter` | solid ground | blocks | `footstep_leaves` | `shambler_step_leaves` |

`solid` in the content definitions drives the shared `worldSolid` predicate used
by collision and raycasts, including zombie sight. All blocks draw with today's
opaque voxel mesh. No separate foliage collision or sight system is introduced.

## Proposed workload (not yet approved)

- Seed **1**, blocks **0.5 m**, view **96 m**, normal look and shadows (`post=1`).
- Forest density candidates **0.25, 0.5, 0.75**. Density is the probability that
  a fixed **8 m** placement cell contains a tree, not a draw-distance multiplier.
  Root jitter is at most **1.5 m** on each horizontal axis.
- Seed-derived mix: **50% broadleaf / 25% conifer / 25% young**, no seed sweep.
  Broadleaf is about 7.5 m tall, conifer 8.5 m, young about 4.75 m.
- Forest extent **768 × 768 m**, centred on spawn, with flat inland ground.
  Only the spawn's **8 × 8 m** clearing is reserved; no route is thinned.
- Existing full benchmark routes are unchanged: 12 s rotating look (plus 6 s
  blocking render timing), then 15 s jog at 4.3 m/s and 15 s sprint at 6.5 m/s,
  heading `[-0.9, 0.44]`, following ground at player eye height. Travel is about
  **162 m**, so every phase plus the 96 m view stays inside the forest extent.
- First looks by day (`time=12:00`) and night (`time=23:30`). Later results must
  record resolution, DPR and host; BR's reference-laptop Firefox run is BR's.

The benchmark keeps site/density/seed/time/post on later runs. JSON records retain
mix, extent, cell size, solid foliage and full route parameters under `forest`;
Markdown includes the same workload. Quick mode is diagnostics, not performance
results. Forest density is also kept in the generated-world save identity, so a
Continue cannot silently regenerate a different forest; old saves are refused.

## Placement and consolidation

Hamlet trees reserve the entire canopy footprint against lot padding, road
frontage/entrance access, spawn and the handling range. Hedges line alternating
back-garden edges only, leaving front and side access open. Leaf litter follows
broadleaf/young footprints and never replaces asphalt or range surfaces.

Trees reuse `structure.ts`'s metre-box rasterization and `stampChunk` clipping.
They do not add a second stamping engine. `stackTemplate` remains for authored
multi-storey building layers: vegetation has no furniture, doors, entrances,
storeys or template-loot semantics, so forcing tree crowns through it would add
an unrelated contract. Both use the same chunk-owned voxel destination. Shape
recipes and the coordinate-keyed placement helper are shared by Hamlet and
Forest, with no runtime dependence on neighbour load order.
