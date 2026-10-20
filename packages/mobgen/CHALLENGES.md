---
read_if:
  - "you're reviewing the amalgam's open visual-quality pass in #378"
  - "you're assessing the exact-shape movement cost tracked by #574"
  - "you're changing how generated voxel identity is used across JavaScript engines"
  - "you're assessing animated joint-range and self-overlap risk"
---

# mobgen — open design risks

This page keeps unresolved reasons to revisit Mobgen; implementation and test contracts live in `src/core`, `src/mob` and `test`.

## Amalgam appearance (#378)

The first-look body is approved, but the scope of the requested visual improvement remains open. Treat the composition as a visual proposal rather than a permanent gameplay or encounter constraint. See `src/mob/amalgam.ts`, `buildAmalgam`, `src/viewer/main.ts`, and `test/amalgam.test.ts`.

## Exact-shape movement cost (#574)

The generated amalgam shape is also a gameplay collision input, so rendering budgets alone do not establish the cost of movement in tight spaces. Keep collision-query measurements distinct from Mobgen's voxel and triangle budgets. See `deadvox/src/core/amalgamShape.ts`, `AmalgamShape`, and `deadvox/src/core/zombies.ts`, `pushTurn`.

## Animated-pose limits

Rest-pose feasibility cannot establish that every animated pose stays within useful joint ranges or avoids self-overlap. See `src/core/rules.ts`, `FULL_RULES`, `src/mob/gait.ts`, and `test/pose.test.ts`.

## Cross-engine voxel identity

A seed is repeatable within a JavaScript engine, but floating-point differences near shape boundaries can change voxel ownership across engines. Deadvox hit and carving behavior depends on the generated figure, so seed identity alone does not promise identical geometry across browsers. See `src/core/random.ts`, `seededRng`, `src/core/voxelize.ts`, `voxelize`, `deadvox/src/core/amalgamFigure.ts`, `amalgamFigure`, and `deadvox/src/core/saveFormat.ts`.
