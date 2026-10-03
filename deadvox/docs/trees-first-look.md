# Slice 2.13 trees — approved shapes and frozen workload (d24-2)

BR approved the three shapes and the hedges on **2026-10-03**. The same ruling
replaces the first look's solid foliage: leaves and hedges are passable but opaque.
Neither geometry, density nor view distance is reduced for performance.

## Declared rules and lead defaults

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

Hedges default to leaf behavior, per the lead's interpretation; BR can override.
The player brushing an actual leaf/hedge body-overlap cell admits a positioned
rustle through F4, committing hearing and seeded sound before output. Entry and
continued-motion cooldown, not every frame; stillness makes no rustle. Gentle/fast
content events use 0.45/0.15 s intervals, gain 0.4/0.75 and noise radius 4/10 m.
`assets/audio/footstep-leaves-01.ogg` is the bundled **placeholder**, not a new bush
recording. Leaf litter still uses player/shambler leaf footsteps. The rustle source
is the brushed voxel centre; it is not a listener-relative UI sound.

## Frozen workload

- Seed **1**, blocks **0.5 m**, radius **96 m**, normal look/shadows (`post=1`).
- Default forest: `density = min(0.75, 0.2 + valueNoise2(seed + 137, x/128, z/128))`,
  with coordinates in metres. Smooth low-frequency noise, 128 m wavelength,
  floor 0.2, gain 1, ceiling 0.75. No chunk-order or loaded-neighbour input.
- Placement samples the field at fixed **8 m** cell centres; root jitter **±1.5 m**.
  `?density=0..1` is an explicit fixed-density override, including zero. Omitted
  or invalid density selects the field (`density:null` in config/save/results).
- Seed-derived **50% broadleaf / 25% conifer / 25% young**, unchanged shapes.
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

## Measurement status

Pre-feature uniform-0.75 profiling identified whole-site litter lookups: about
165 ms per generated column on the coder host, versus worker meshing p95 about
7 ms. BR's frozen `603a64a` real-GPU Firefox run independently measured jog/sprint
main-thread work p95 **310/467 ms**, while look achieved **60 fps**. The coder's
SwiftShader GPU is not BR's laptop; its render timings cannot establish the
reference budget. Frozen-field before/after measurements are recorded separately
in Slice 2 Results. The Slice 1 budget is unchanged: 60 fps, at most 1% of frames
above 18 ms in every phase, and no sprint holes. Unmet budgets remain unmet.
