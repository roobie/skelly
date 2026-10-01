# deadvox — lessons

What we learned the hard way, and what to understand before troubleshooting the same
area again. A sidecar to [CHALLENGES.md](CHALLENGES.md): challenges are the problems
ahead; lessons are what past problems taught us. Newest first. Each entry says what
happened, why, and what to do differently.

## Shader varyings under MSAA (2026-10-01)

**What happened.** White pixels, and with bloom on white discs, appeared on block edges at
some view angles. Three fixes were needed before they were gone: the chunk vertex colour
(`438e1bb`, `dbc7759`) and the height-fog depth (`1b65f7d`). The last one was only found
on a real GPU.

**Why.** The scene renders with MSAA, so an edge pixel can be shaded at a point outside
its triangle, and every non-`flat` varying is then extrapolated past its vertex values.
Maths that looks bounded is not: an interpolated colour, AO factor or fog depth can go
negative or overshoot, and `exp()`, ACES and bloom turn that into white pixels or discs at
grazing angles. Clamping alone moved the symptom (a negative colour clamped is fine, but
an overshoot clamped to 1 is white).

**What to do.**

- Declare varyings that feed shading `centroid` (per-quad ids `flat`), and clamp what you
  derive from them to its valid range, as a guard for drivers without proper centroid.
- Run the debug hot check (`hotcheck=1`) after the last colour change (after fog), or it
  misses values that fog or later steps produce.
- Reproduce at the reported `cam=` pose with `tools/render-probe.mjs` (see
  [TROUBLESHOOTING.md](TROUBLESHOOTING.md)), but SwiftShader did not reproduce every case:
  confirm on a real GPU.
- Bisect with the debug toggles one at a time (`post=0`, `bloom=0`, `patterns=0`,
  `sunshadow=0`, `actors=boxes`, `crackcheck=1`, `hotcheck=1`) before theorising; two
  plausible hypotheses (mesh cracks, a too-low bloom threshold) were wrong here.
