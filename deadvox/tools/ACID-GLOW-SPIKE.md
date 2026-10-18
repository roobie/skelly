---
read_if:
  - you're reproducing the acid glow render-cost spike
  - you're interpreting the spike's scope before implementing mob emission
  - you're evaluating the disposable tiled crowd-light path
---

# Acid glow spike

This is disposable measurement tooling, not a game feature or a choice of glow appearance.
The perf build alone imports `deadvox/tools/acid-glow-spike-browser.mjs`,
`installAcidGlow`; see `deadvox/tools/perf-baseline.mjs`, `options`.
Keep measurements and screenshots outside tracked files, as required by
`deadvox/tools/PERF-BASELINE.md`.

The normal horde route can submit actors hidden by roofs or outside the camera.
The spike therefore isolates existing shambler render rows and translates their poses into
an exposed grid, without moving simulation actors. It restores those rows before the next
normal pose update so cached transforms cannot accumulate the fixture translation.
Freezing simulation prevents AI cadence and crowd migration from changing the comparison.
The frame callback includes this fixture work on every option, including the no-glow control.
This measures a controlled render workload, not live horde simulation performance.

See `deadvox/tools/acid-glow-spike-config.mjs`, `routes`, for the measurement matrix;
invoke that script with an external output JSON path, then pass that config to the perf
runner with `--acidGlow=1`. The runner's `--angle` selects the installed ANGLE backend;
verify the reported hardware identity rather than trusting environment selection alone.

The body has no acid sac or eye material yet. Whole existing bones deliberately stand in
for those surfaces, so these measurements cannot predict the final model's pixel coverage.
The translucent batch uses ordinary instanced alpha blending, not order-independent
transparency. The bounded light-casting trial borrows the existing inventory point-light
pool; it neither proves unbounded crowd lighting nor supplies an occlusion solution.
See `deadvox/tools/acid-glow-spike-browser.mjs`, `installAcidGlow` and `installFixture`.

## Crowd illumination

The bounded inventory pool cannot represent independently emitting crowds without displacing
item lights. The separate trial uses world-space columns because short-range ground and wall
lighting can reject distant emitters without a G-buffer, a screen-depth dependency, or a pass
per light. See `deadvox/tools/crowd-light-grid.mjs`, `createLightGrid` and `packLightGrid`, and
`deadvox/tools/crowd-light-spike-browser.mjs`, `installCrowdLightSpike`.

Every patched receiver pays for the world-position varying and grid bounds check; nearby
columns additionally pay texture reads and an uncapped candidate loop. Columns intentionally
do not distinguish stacked floors: distance rejects happen after candidate fetches. There
is no shadowing, occlusion query, contact darkening or lighting of actors by this path.

The receiver apron and walls keep the larger render-only grid from floating beyond the
site's roof with nothing in light range. They also exist in both controls, because adding
receiving geometry only to the lit case would confound the comparison. This fixture change
means its absolute timings cannot be subtracted from the unmodified emission trial.
See `deadvox/tools/crowd-light-spike-browser.mjs`, `addReceivers`, and
`deadvox/tools/crowd-light-spike-config.mjs`, `routes`.

A full scan of every emitter would charge unrelated fragments for the whole crowd.
Screen clusters would need camera/depth-dependent list machinery. Additive volumes would
need receiver normals and accumulation/compositing work absent from the forward path.
Growing Three's point-light count would expand ordinary lighting loops across materials
and abandon the fixed inventory budget. Those are deliberately not additional prototypes.
