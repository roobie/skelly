---
read_if:
  - you're troubleshooting a deadvox problem and want to know whether the same area went wrong before
  - you're about to change a deadvox area that has a lesson here (each heading names its area)
  - you've just solved a hard deadvox problem and want to record what it taught
---

# deadvox — lessons

## Gate actions when the input edge is captured (2026-10-04)

**What happened.** `Input` latched a primary click on canvas `mousedown`, but build-mode exclusion was checked only when the later fixed-step player tick consumed it. If B toggled build mode off first, an editor click could start melee and spend stamina; the next click could then be rejected as busy. That mechanism is consistent with the positive-control failure on PR #223 (run 37234915439), but the CI trace did not capture the prior input/tick order, so attribution remains open in #224.

**What to do.** Apply mode-specific suppression at the input edge, using the mode at `mousedown`; keep the tick-time guard as defense in depth. A rendering frame is not proof that the fixed-step simulation consumed a latched input.

**Proof.** `test/input.test.ts`'s `does not queue primary clicks rejected at press time` failed before the gate (the build-mode click was latched) and passed after it. First-load and Firefox OPFS startup failures are separate unresolved evidence tracked in #224; do not attribute them to this input race.

What we learned the hard way, and what to understand before troubleshooting the same
area again. A sidecar to [CHALLENGES.md](CHALLENGES.md): challenges are the problems
ahead; lessons are what past problems taught us. Newest first. Each entry says what
happened, why, and what to do differently.

## Isolate browser-test profiles from the desktop keyring (2026-10-03)

**What happened.** Custom Chromium launches let Chrome select the OS password store.
On the shared desktop-session host, cookie encryption-key initialization took about
25 seconds. TCP connected immediately, but Chrome did not send the first HTTP request
until the key loaded. First navigation then took 28 seconds or crossed its unchanged
30-second bound (#190). A late response `Date` header did not mean Vite was slow:
its first curl response took 8 ms, and its browser-request handler took 4–15 ms.

**What to do.** Keep throwaway Chromium launches on Playwright's managed launch path;
`test/browser/save-storage.mjs` and `tools/ui-browser-contract.mjs` use that boundary.
Retain test-profile isolation because #190 showed that desktop password-store
initialization can delay the first navigation. Issue #287 established that save-storage's
separate TCP DevTools discovery is another pre-test failure boundary; do not restore a
custom Chrome spawn, hand-allocated debug port or `/json/version` polling there. This is
test-profile isolation, not a setting for players' browsers. Do not warm up a request,
retry or raise the timeout.

**Proof.** Three fresh-profile launches without the flag took 27.76–28.89 seconds;
three with it took 2.87–2.91 seconds. Cookie-key loading fell from 25.16–25.20 seconds
to 112–138 ms; first-request arrival fell from about 24.8 seconds to 8–13 ms.
Restoring the original launch after a fast flagged run restored the stall despite
shared file-cache warming. Same-profile warm navigations were fast even without the
flag: distinguish fresh browser/server state from OS-cache coldness. No OS caches
were reset or certified cold. The exact slow D-Bus endpoint was not identified by
the bounded metadata-only capture; do not label the promptly completed GNOME prompt
as the 25-second call. Hosted headless CI lacks this desktop-keyring precondition;
other repository browser tests already use Playwright's isolated launch defaults.

## Ask for persistence only when the player chooses (2026-10-03)

**What happened.** Save startup called `navigator.storage.persist()`, which could
open Firefox's native permission popup before the player acted. Its boolean false
was then described as a refusal, although querying an existing best-effort grant
is not a request. An unknown metadata result also hid the explicit request button.

**What to do.** Startup uses non-prompting `persisted()` under the existing bounded
advisory-metadata deadline. Only the title/pause `#save-persist` click calls `persist()`;
show it whenever that API exists and a grant is not known, including unknown state.
Say best-effort until granted, explain the permission request, and update both cached
storage metadata and the button after the result. Never restore an automatic path.

**Firefox audit.** The maintained synthetic UI and storage stages do not pre-grant
persistence or assert an automatic grant. Earlier r6 default/deny popup controls were
scratch diagnostics, not CI setup. They now query the existing state rather than
creating a popup; synthetic pointer-lock coverage and native #168/#170 quarantines
stay distinct. This policy does not prove the historical native flakes fixed.

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
