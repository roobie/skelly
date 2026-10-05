---
read_if:
  - you change pump handling, ammunition ownership or held-gun presentation
  - you review the pump's acceptance or decide whether its estimates may be pinned
---

# Pump shotgun rationale

## Acceptance

BR approved #209 as-is on 2026-10-04: "i'll approve 209 as is - there's still
improvements to be made, but we're deferring". This closes the pump, rack-cant
and sound look/listening gate. It does not freeze presentation or balance
estimates into release specifications. Their assertion policy remains in
`docs/deferred-assertions.md`.

## Why manual handling matters

The pump makes cycling and ammunition handling player choices rather than
presentation pretending that an automatic action occurred. Its mechanics must
remain authoritative even when rendering or audio fails. See
`deadvox/src/game/firearmHandling.ts`, `FirearmMechanics`, and
`deadvox/src/game/reloadInput.ts`, `ReloadInput`.

The sealed ammunition box is deliberately not a container: opening it should be
a handling decision, not immediate access to hidden nested ammunition. See
`deadvox/src/game/unpacking.ts`, `Unpacking`. Ordinary placement ownership also
matters when opening or ejecting into a crowded scene; refusing placement must
not destroy committed ammunition.

## Why presentation stays separate

A port hidden by the held pose makes the manual action hard to read. The cant
exists to expose that action, not to change aim or ammunition state. See
`deadvox/src/render/firearmModel.ts`, `rackCant`. BR's acceptance of the look is
not a reason to assert a particular angle.

The dedicated shell feed makes insertion readable without giving rendering a
second ammunition owner or clock. The visible round is a model clone, not an
inventory item; the load job still owns consumption and cancellation. See
`deadvox/src/render/shellLoadPose.ts`, `shellLoadPose`, and
`deadvox/src/render/hands.ts`, `HeldItems`. The support hand follows the gun's
occupied physical slot, not actor preference, so moving the gun does not move
its authored port or reverse its geometry. Reprojecting from rest each frame
lets cancellation and late model availability converge without replaying work.
The path and apparent thumb push are presentation estimates for BR's look,
not a reason to freeze pose coordinates or change handling duration.

Cartridge-derived gameplay estimates are not measured wound ballistics. See
`deadvox/src/core/pellets.ts`, `pelletShot`. Preserve gameplay properties while
leaving tuning adjustable under the deferred-assertion policy.

The sound choices are accepted as-is, including the labelled hull placeholder;
acceptance does not turn it into an authentic hull recording. The listening
sheet is `/sounds.html`; see `deadvox/src/ui/soundGuide.ts`, `SOUND_TRIGGER_GUIDE`,
for verdict notes. Public source credits and processing provenance belong to
`deadvox/src/content/base/assets/manifest.json`, `sources`, rather than a second
list here.
