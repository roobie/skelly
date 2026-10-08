---
read_if:
  - you're changing tree or hedge movement, sight, sound or rendering rules
  - you're revisiting the frozen forest workload or its performance evidence
---

# Slice 2.13 trees — shapes and frozen workload (d24-2)

Leaves and hedges are passable but opaque, replacing the first look's solid
foliage. Geometry, density and view distance are not reduced for performance.

## Declared rules

| Blocks | Movement / physics / melee / bites / acoustics | Sight / aim / LOS / picking |
| --- | --- | --- |
| `tree_trunk`, `tree_branch`, `leaf_litter` | solid | opaque |
| `leaves`, `hedge` | passable, no acoustic attenuation | opaque |

Content `solid` drives `worldSolid` (bodies, attacks and hearing); content `opaque`
drives `worldOpaque`. Ordinary blocks inherit `solid` when `opaque` is omitted.
Furniture and closed/open doors retain their existing entity semantics in both.
Player, zombie, corpse, detached-part and case physics use movement. Player melee
and zombie attacks use movement blockers; aim, debug/furniture picking, zombie
sight and benchmark placement rays use opacity. Placement bodies use movement.
`isLit` still only checks daylight/flashlight; renderer non-air occupancy is unchanged.

Hedges use leaf behavior by default; BR may override.
The player brushing an actual leaf/hedge body-overlap cell admits a positioned
rustle through F4, committing hearing and seeded sound before output. Entry and
continued-motion cooldown, not every frame; stillness makes no rustle. Gentle/fast
content events use 0.45/0.15 s intervals, gain 0.4/0.75 and noise radius 4/10 m.
`assets/audio/footstep-leaves-01.ogg` is the bundled **placeholder**, not a new bush
recording. Leaf litter still uses player/shambler leaf footsteps. The rustle source
is the brushed voxel centre; it is not a listener-relative UI sound. Physical
brushing includes vertical travel (falling/jumping), but ignores displacement
of at most two contact skins: 0.0002 blocks, or 0.1 mm at 0.5 m blocks. This
excludes ordinary contact correction, including one skin per axis and floating
point slack, rather than treating a resting body's settling as motion.

## Frozen workload

- Seed **1**, blocks **0.5 m**, radius **96 m**, normal look/shadows (`post=1`).
- Default forest: `density = min(0.75, 0.2 + valueNoise2(seed + 137, x/128, z/128))`,
  with coordinates in metres. Smooth low-frequency noise, 128 m wavelength,
  floor 0.2, gain 1, ceiling 0.75. No chunk-order or loaded-neighbour input.
- Placement samples the field at fixed **8 m** cell centres; root jitter **±1.5 m**.
  `?density=0..1` is an explicit fixed-density override, including zero. Omitted
  or invalid density selects the field (`density:null` in config/save/results).
- Seed-derived **50% broadleaf / 25% conifer / 25% young**, unchanged shapes.
  Frozen seed 1 has **5,341** placements: 2,676 broadleaf, 1,321 conifer, 1,344 young.
- Extent **768 × 768 m**, flat inland ground; only the **8 × 8 m** spawn clearing
  is reserved. No thinned camera corridors.
- Full routes unchanged: look 12 s, blocking render 6 s, jog 15 s at 4.3 m/s,
  sprint 15 s at 6.5 m/s, normalized `[-0.9,0.44]`, ground-following eye height.
  Travel about **162 m**, plus 96 m view, remains inside the extent.
- At route distance **16 m**, beyond the clearing, the field is **0.75**; at 96 m
  it is about **0.60134**. The route crosses dense foliage, then sparser ground.
- Day **12:00**, night **23:30**. Full runs, not quick; record host, resolution,
  DPR, rendering choice, timeout/holes and every phase's slow-frame fraction.

Site, override/field, seed, time and post survive later benchmark URLs. JSON and
Markdown retain the field parameters and routes. Saves retain `density:null` or
the exact override; schema 7 refuses earlier saves, with no migration.

## Placement and consolidation

Hamlet canopies reserve lots/padding, road/frontage/entrances, spawn and handling
range. Alternating back-garden hedges leave front/side access open. Litter follows
broadleaf/young footprints, never replacing road/range surfaces. Both sites reuse
metre-box `rasterize`/`stampChunk` and coordinate-keyed placement. `stackTemplate`
remains for building storeys/furniture/doors/loot, not a second vegetation engine.

## Localized lookup

`TreeIndex` is built once from seed-owned footprint rectangles. Litter lookup and
clipped stamping inspect only trees overlapping the queried column, preserving
their original order. The upper bounds are **exclusive** (last cell `x1-1`), not
inclusive; this matters at negative and positive column borders. No tree, leaf
face, route, reservation, mix or distance is removed. Existing meshing already
culls internal non-air faces and runs in workers.

## Measurement status

Whole-site litter lookups measured about 165 ms per generated column, compared
with worker meshing p95 of about 7 ms. On SwiftShader, generation improved from
about 129–132 ms to 1.3 ms, while frames remained about one second and sprint
holes persisted. Those software-rendering results do not establish reference-GPU
performance. All functional Chromium browser gates passed.

The same-workload cut-out experiment applied an alpha mask to camera and depth
shadows, retaining about 63.6% of each leaf face. It changed neither voxel rules
nor geometry, draw-call totals or peak mesh payload bytes; ordered runs showed
no reliable budget advantage. Opaque drawing remains. The reference-GPU runs
met the frame budget for fixed density 0.75 by day, and for the frozen field by
day and night: 60 fps, no slow frames and no sprint holes. Semi-occluding leaves and
ground-level foliage remain follow-ups in #187.
