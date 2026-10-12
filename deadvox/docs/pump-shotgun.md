---
read_if:
  - you change pump handling, ammunition ownership or held-gun presentation
  - you review the pump's acceptance or decide whether estimates may be pinned
---

# Pump shotgun rationale

## Acceptance

The pump, rack-cant and sound look/listening gate passed. Acceptance does not freeze presentation or balance estimates into release specifications; assertion policy remains in `docs/deferred-assertions.md`.

## Manual handling

Cycling and ammunition handling are player choices, not presentation pretending an automatic action occurred. Simulation mechanics remain authoritative when rendering or audio fails. See `src/game/firearmHandling.ts`, `FirearmMechanics`, and `src/game/reloadInput.ts`, `ReloadInput`.

A sealed ammunition box is not a container: opening it is a handling decision, not immediate access to hidden ammunition. Refusing placement must not destroy committed ammunition. See `src/game/unpacking.ts`, `Unpacking`.

## Presentation

The rack cant exposes the manual action; it does not change aim or ammunition state. The dedicated shell feed makes insertion readable without giving rendering a second ammunition owner or clock. The visible round is a model clone, while the load job owns consumption and cancellation. Wrist departure alone does not prove insertion: the visible round must reach the authored port under the load job's clock. Support-hand placement follows the occupied physical slot, preserving the authored port. Reprojection from rest lets cancellation and late model availability converge without replaying work. See `src/render/firearmModel.ts`, `rackCant`, and `src/render/shellLoadPose.ts`, `shellLoadPose`.

Cartridge-derived gameplay estimates are not measured wound ballistics. Preserve gameplay properties while keeping tuning adjustable. The accepted sound set includes a labelled hull placeholder; acceptance does not make it an authentic recording. Public asset provenance belongs in `src/content/base/assets/manifest.json`, `sources`.
