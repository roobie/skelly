---
read_if:
  - you change the test house, its fixture stock or its debug gate
  - you add a feature demonstration near the test-house spawn
  - you benchmark the test house at a different block scale
---

# Test house

## Content ownership

The test house is both an evaluation bed and a personal haven. Its layout belongs to
content so changing the place does not require changing game logic. Keep the authored
house in `src/content/base/templates-test-house.jsonnet`, `templates`, and the lot in
`src/content/base/layouts-test-house.jsonnet`, `layouts`. Derivation of repair stock
and range supply remains logic, not a second copy of the place.

Keep fixture layouts marked as demos so their containers do not contribute world
loot supply. The demo flag is an economy boundary, not a save policy; see
`src/core/authoredSite.ts`, `AuthoredSite`.

## Normal and debug additions

The house must remain selectable without debug mode. The range and test stock belong
behind debug mode so evaluation supplies do not become ordinary play rewards. Every
addition must explicitly decide whether it belongs in normal mode or only debug mode,
and record its reason here. Re-evaluate this choice whenever the house gains something;
there is no blanket permission based on where an earlier prop was placed.

The ordinary furnishings, reading sample and parked vehicle remain in normal mode:
they demonstrate ordinary interactions without the derived supply catalogue. Derived
repair stock and the handling range are debug-only because their purpose is repeatable
system evaluation. See `src/game/play.ts`, `populateTestHouseRepairCorner`, and
`src/game/worldSetup.ts`, `DebugTestHouseSite`. The range's owning rule remains in
`DESIGN.md`, "Debug scenes".

## Benchmark scale

Authored sites use the template block scale; do not retain a code-built house as a
fallback for other scales. Mixed-scale benchmark plans use a scale-independent default
scene instead. Explicitly selecting the house requires the authored scale. See
`src/bench/run.ts`, `benchRunFromUrl`, and `src/core/authoredSite.ts`, `AuthoredSite`.
