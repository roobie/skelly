# deadvox — lessons

What we learned the hard way, and what to understand before troubleshooting the same
area again. A sidecar to [CHALLENGES.md](CHALLENGES.md): challenges are the problems
ahead; lessons are what past problems taught us. Newest first. Each entry says what
happened, why, and what to do differently.

## Keep cosmetic play changes outside simulation identity (2026-10-03)

**What happened.** Changing the HUD's FPS/seed wording changed the save's simulation
fingerprint because formatting, camera/mesh rendering and gameplay shared `play.ts`.

**What to do.** Project readonly data into `ui/playHud.ts`/`ui/playReadout.ts`; own
render resources, draw/warm-up and pile/case pagehide cleanup in `render/playView.ts`.
`render/playFrames.ts` only wires RAF callbacks. Keep dt policy, input sampling,
action/target selection, simulation advancement, saves and death in fingerprinted
`play.ts`/session. Don't exclude all of `play.ts`. Test observable draw/lifecycle
routing, not exact callback spelling; keep the HUD-wording and gameplay-reach hash
canaries together. Module extraction deliberately invalidates exact-version saves
once; subsequent cosmetic wording edits should not.

## Admit sound and hearing before playback (2026-10-03)

**What happened.** `SessionAudio.play` returned a boolean that gated player vocal
noise. `GameAudio` owned the saved picker and could return false after picking an
unbundled asset, so output packaging changed zombie hearing.

**What to do.** The DOM-free session owns the picker and commits its seeded choice,
cooldown and hearing stimulus once. It emits positioned `sound`/`noise` observations
and calls the void playback adapter with the immutable selected sound. WebAudio may
report/skip missing files, unavailable output or failed decoding, never undo admission.
Keep output voice allocation separate from simulation admission. Handling cues and
debug firearm shots use this same session picker; manifest previews remain exact-file
playback, not gameplay events. Content noise-disabled footsteps/doors/melee stay disabled;
continuous movement hearing is a separate perception input, not a second discrete noise.

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

## Save-lock queue deadlines (2026-10-03)

**What happened.** BR reported an intermittent Firefox close/relaunch hang at
“Scanning saved-world versions…”, often after changing the launch time. A controlled
second page holding the exclusive save lock reproduces that exact state with no canvas
or page error; releasing it lets startup finish. Six normal Firefox close/relaunch
trials did not reproduce the intermittent trigger, so its tab-teardown origin remains
unconfirmed.

**Why.** The worker's 15-second request deadline starts only after the shared read lock
is acquired. Waiting in the Web Locks queue had no deadline at all, on reads or writes.

**What to do.** Bound lock acquisition with `AbortSignal.timeout`, separately from
worker I/O. Cancel only the queued request, never steal a held writer lock. On failed
discovery offer a title-screen retry or an explicitly unsaved world; preserve the A/B
records. Test with a controlled lock holder rather than a timing race, and verify both
retry recovery and the queued writer's inability to encode or commit. Quota estimates
are advisory: give them the same one-second metadata deadline as persistence status,
so a browser metadata promise cannot block startup either.

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

## Pointer-lock scrolling belongs to the menu cursor, not an individual panel (d33)

CSS overflow cannot retarget a locked wheel to the drawn cursor. Inventory, vicinity and
item details all had real overflow but no locked wheel route; native free-pointer scrolling
and #67's redraw preservation already worked. Route to the nearest scrollable ancestor in
`ui/menuPointer.ts`, including the debug panel, normalise line/page units with `wheelPixels`,
and consume at pane edges to prevent page/game chaining. Keep the separate main-card and
build-wheel routes. Browser proofs should measure actual overflow and distinguish native
free-pointer input from explicitly synthetic locked-cursor input.
