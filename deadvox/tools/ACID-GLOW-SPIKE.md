---
read_if:
  - you're reproducing the acid glow render-cost spike
  - you're interpreting the spike's scope before implementing mob emission
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
