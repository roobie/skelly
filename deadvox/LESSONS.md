# deadvox — lessons

What we learned the hard way, and what to understand before troubleshooting the same
area again. A sidecar to [CHALLENGES.md](CHALLENGES.md): challenges are the problems
ahead; lessons are what past problems taught us. Newest first. Each entry says what
happened, why, and what to do differently.

## Item bindings must not own item lifetimes (2026-10-03)

**What happened.** Eating a quickbar-bound can of beans removed it from inventory but
left the quickbar's `Item` alias alive. A snapshot stored that dangling UID and Continue
refused it. An active light selection could likewise outlive removal of its owner.

**What to do.** Hands, worn slots and container/pile/furniture trees own Items. Quickbar
bindings and the persistent light selection store only UIDs and resolve through
`Inventory.itemByUid`; a missing live item is empty. Full consumption, container-subtree
removal and whole-stack merging therefore need no per-consumer cleanup hooks. Transfers
and partial consumption keep the same live UID. Queued actions already resolve their UID
parameters at execution. Keep the canonical traversal lazy and carried-first, so a held
light lookup does not collect the entire world's items each frame.

Check non-owning references at the synchronous snapshot boundary. Restore still refuses
a dangling saved reference: normalizing a missing *live* binding is not permission to
repair malformed saved state under ADR 0002. Future crafting/take-apart consumption must
use the inventory ownership boundary, not retain aliased Items after removal.

## Case visuals and instanced-resource ownership (2026-10-03)

**What happened.** Case visuals were cloned on every shot and dirty pile update.
When a case GLB failed to load, clearing and rebuilding the fallback scatter also
left one instance buffer and VAO behind per rebuild. `renderer.info.memory.geometries`
stayed flat: it did not count those resources.

**What to do.** Keep flying visuals per pool slot/model and pile instances per
pile/model. Skip scatter generation and matrix writes when capped counts are
unchanged. Call `InstancedMesh.dispose()` on removal, upgrade and presentation
teardown; never dispose the shared model geometry or materials. When a delayed
load replaces cached flying fallbacks, only the slot's current model may be visible.

`test/browser/case-visual-pool.mjs` checks real WebGL buffer/VAO creation and deletion
with loaded, failed and delayed GLBs, plus flat visual clone counts across 100
retire/refire cycles. It is a resource-lifetime contract, not a laptop performance
benchmark or an explanation for the earlier large browser-memory incident.

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
