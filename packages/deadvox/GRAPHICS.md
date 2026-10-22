---
read_if:
  - you're changing procedural surface weathering or building appearance
  - you're changing the solar-phase look, flashlight daylight adaptation, beam shape or spill, how lights switch on and off, or evaluating renderer performance or a look change it makes
  - you're changing wide ambient occlusion or its interaction with skylight
  - you're changing content-defined graphics policy or per-machine graphics settings, or evaluating GPU quality trials
  - you're adding or evaluating GPU quality options, including cached surface noise and its comparison against the arithmetic shader
  - you're interpreting or changing debug draw submission counters
---

# Deadvox graphics

The graphics direction is driven by atmosphere and readability, not realism. The detailed rationale for the look is in [DESIGN.md](DESIGN.md#a-world-that-feels-real); visual debugging guidance is in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Look decisions

The default look is tone mapping off, low exposure, the mood pass off and no weathering, because it was judged by eye to look better and costs less. Content owns it, so a mod can change it; every part stays tunable through URL parameters and the debug panel. See `src/core/schema.ts`, `LookDefaultsSchema`, and `src/core/lookDefaults.ts`, `lookDefaultsOf`.

Tone mapping can follow the solar cycle instead: neutral in bright daylight, shifting toward ACES at dawn and dusk and using ACES at night, which gives daylight a natural palette while retaining depth in darkness. Weathering adds render-only age without replacing material identity; named profiles let authored scenes vary it. See `src/render/autoTone.ts`.

Distance fog, the clear background and height mist share the camera's diffuse sky visibility so they cannot glow where the sky cannot reach. Use the interior field's spatial interpolation rather than a separate transition, keeping doorway changes aligned with held-item lighting. See `src/render/playView.ts`, `prepareLighting`; `src/render/sky.ts`, `applySky`; and `src/render/mood.ts`, `Mood.setSky`.

A flashlight beam fades in full daylight because its pool is not worth drawing or shadowing against the sun. Adapt its strength to the sky where the beam lands, not where the player stands, so a lit player can still illuminate a dark doorway. See `src/render/playView.ts`, `prepareLighting`, and `src/render/flashlight.ts`, `flashlightDaylightScale`.

Item light content owns focused-cone brightness, reach, shape and decay so authors can tune different kinds of beam without renderer constants. Spill is optional: omit it, or author it with `enabled` false, for the exact plain cone with an unwidened shadow camera. Base battery beams author a dim spill switched off, because the plain cone is the look the game ships with; the tunables stay in content so a mod can turn it on. Blend both lobes in one spot and widen its shadow camera so spill cannot bypass occluders or require another shadow pass. Install the spill shader before warm-up and express plain beams through neutral uniforms, so both existing and later-created materials use one program without switch-on recompilation or stale variants. See `src/core/schema.ts`, `BeamSpillSchema`, `src/content/base/items-tools.libsonnet`, `batteryBeam`, and `src/render/flashlight.ts`, `Flashlight`.

Switching a light on or off, or dimming it, changes only uniforms, never which lights exist or cast shadows. three.js keys every lit program on the light and shadow-caster counts, so a changed count rebuilds the program of every visible lit material that warm-up did not compile for it, including those created after warm-up such as held items and mobs, and stalls the frame for up to seconds. Carried point lights are a fixed pool with zero intensity when unused, and every beam casts while beam shadows are on. While it is off or faint its depth pass is skipped and its shadow strength is zero, so a map it no longer refreshes cannot leave stale shadows and a faint beam looks the same whatever it did before. See `src/render/lightPool.ts`, `LightPool`, `src/render/flashlight.ts`, `Flashlight.shadowsAllowed`, and `src/render/shadows.ts`, `beamMapDue`.

Retune beam intensity and decay against three targets. A mid-grey surface at 10 m stays readable. Close surfaces stay under the bloom clip and the ACES shoulder, where a bright warm colour skews towards orange. Brightness varies by under 2x between 0.5 m and 2 m, where plain inverse-distance falloff varies 4x. The near-field offset makes the last two hold while keeping the reach, so a lower offset needs a lower intensity and a higher one allows more. See `src/render/lightFalloff.ts`, `NEAR_FIELD_M`, and `test/lightFalloff.test.ts`, which checks the close-up variation.

Use `torchspill=1` in the URL to turn on authored spill that content leaves disabled, and `torchspill=0` to force the plain cone, without enabling debug mode. This render-only override neither invents absent spill nor changes simulation awareness. See `src/render/playView.ts`, `createPlayView`. Handheld, head-mounted and weapon-mounted beams share this path; a mounted light takes its lens from the held weapon's model. See `src/render/flashlightCone.ts`, `withFlashlightSpill`.

Post-processing and shadows support the intended mood. Compare the same workload on a real GPU before claiming a performance win; SwiftShader cannot establish reference-GPU cost. Keep image changes separate from waste removal so visual quality remains an operator decision. See `src/bench/post.ts`, `benchDraw`.

Tone mapping, display transfer and colour grading share a fullscreen draw because storing and sampling an intermediate display-space image adds GPU work without adding an effect. Grade remains after tone mapping and transfer so its controls keep their display-referred meaning; bloom stays before them in linear light. See `src/render/moodOutput.ts`, `createMoodOutputPass`, and `src/render/mood.ts`, `Mood`.

A performance change may alter the default look only slightly, and each such change needs the operator's by-eye approval of a before/after comparison (`docs/PROCESS.md`, "Reviews by eye and by play"): a person's eye, not a metric, judges whether a change is small, so a measured cost reduction alone never authorizes it. Reduce scene resolution rather than canvas resolution so DOM/HUD readability and display-space film stay independent of scene sharpness. Resolution policy must not depend on enabling post effects. See `src/render/mood.ts`, `Mood.setRenderScale` and `Mood.setBloomScale`, and `src/render/screenScale.ts`, `ScreenScale`.

Coarser surface detail can retain weathering and camouflage while changing their appearance, so it is a visual choice rather than equivalent-image waste removal. World anchoring still matters for continuity across faces and chunks; changing detail does not justify changing geometry or shadow-caster visibility. See `src/render/chunks.ts`, `ChunkMeshes.setCoarseWeathering` and `ChunkMeshes.setFastCamo`, and `src/render/surfacePatterns.ts`, `camoColor`. Smaller sun maps keep biases and grid snapping tied to their actual texel size to avoid trading raster cost for acne or unstable edges; see `src/render/shadows.ts`, `Shadows.setSmallSunMap`.

Cached surface noise exchanges repeated arithmetic hashes for a filtered, repeating lattice. The cell coordinates and smoothing keep world anchoring, but CPU float evaluation, byte quantization and hardware filtering do not promise the arithmetic shader's exact image. It is on by default because it cuts chunk fragment cost substantially while its image differs from the arithmetic shader only imperceptibly, which was approved by eye. The option and the debug URL switch stay so a player or a look review can compare against the arithmetic path. See `src/render/surfaceNoise.ts`, `createSurfaceNoise`; `src/render/surfacePatterns.ts`, `SURFACE_PATTERN_GLSL`; and `src/core/graphics.ts`, `GRAPHICS_KNOBS`.

Wide ambient occlusion darkens indirect light according to enclosure, while direct sun and flashlight lighting remain separate. The mesher's corner AO remains unchanged. Weathering changes rendering only; building-geometry changes are tracked separately by #396. See `src/core/occlusion.ts` and `src/render/chunks.ts`, `chunkMaterial`.

## Graphics policy

Keep graphics defaults and permitted choices in the core mod, while the player owns the
choice for their machine: a content pack cannot know their GPU. Debug URL overrides must
win over player choices, which must win over content defaults. Explicit false values are
choices, not absence. See `src/content/base/graphics.jsonnet`,
`src/core/graphics.ts`, `resolveGraphics`, and `src/game/graphicsSettings.ts`.

Benchmarks isolate machine preferences and debug graphics overrides so saved choices cannot
silently change a comparison workload. Scene scale stays fixed at the content default because
GPU-dependent adaptation would change the pixel workload during a run. The full-post workload keeps
an independent look so visual-policy changes cannot redefine it. The goggles comparison instead follows
play's content-default look and shares its flare update: measuring another look or omitting source
occlusion would not establish the cost players pay. Source placement belongs to the benchmark query
so comparisons can vary the workload without changing code. Content-owned benchmark weathering
lets mods choose that workload without changing benchmark logic. See
`src/game/engine.ts`, `createEngine`, `src/game/graphicsControls.ts`, `GraphicsControls`,
`src/bench/post.ts`, `benchDraw` and `applyBenchWeathering`,
`src/bench/lightFixture.ts`, `benchFlareSourcesFromUrl`, and
`src/render/nightVisionFlare.ts`, `createNightVisionFlareUpdate`.

Automatic scene resolution applies with or without post effects, because choosing the plain
look must not disable the machine's quality trade. It follows GPU execution cost rather than
frame intervals: reducing pixels cannot fix simulation work, browser scheduling or a slow display. Windowed measurements
and a dead band suppress transient spikes and visible pumping; recovery reserves headroom for
the next size instead of immediately undoing a reduction. Unsupported GPU timing leaves the
content default intact. Explicit player or debug URL scene-scale choices suspend adaptation;
clearing a player choice returns ownership to content. See `src/render/adaptiveScale.ts`,
`AdaptiveScale`, `src/render/gpuFrameTime.ts`, `GpuFrameTime`, and
`src/render/mood.ts`, `Mood.recordGpuTime`. Plain presentation copies already display-encoded
pixels so scaling cannot apply tone mapping or display transfer twice; see
`src/render/screenScale.ts`, `ScreenScale`. Abandon scene and post targets when a WebGL context is
lost: the context has already freed their GPU storage, while disposal would try to delete dead
handles. Rebuilding after restoration also prevents stale disposal listeners from deleting old
handles on the first resolution change. See
`src/render/mood.ts`, `Mood.releaseComposer`.

Persist only explicit player choices, not resolved defaults or debug overrides, so a mod's
policy can change without stale defaults becoming machine preferences. Validate stored
choices against the effective content policy before using them; unavailable storage must
not prevent play. See `src/core/graphics.ts`, `validGraphicsSettings`.

Graphics options are meta controls because hardware preferences are not character knowledge.
Clearing a preference returns ownership to content rather than saving its resolved default.
Debug overrides remain separate from preferences, and unrelated look changes must not promote
player or mod values into the URL. See `src/ui/graphicsOptions.ts`, `renderGraphicsOptions`,
`src/game/graphicsControls.ts`, `GraphicsControls`, and `src/debug/lookUrl.ts`, `writeLookParams`.

## Performance diagnostics

Debug-only whole-frame CPU submission counters distinguish batching growth from drawing-buffer pixel load alongside frame-time percentiles. Repeated geometry submissions count again; these are not unique geometry counts or GPU timings. GPU cost requires asynchronous timing probes on real hardware. See `src/render/drawCounters.ts`, `DrawCounters`, for frame-scoped collection; `src/debug/index.ts`, `readoutTemplate`, and `src/debug/lookDump.ts`, `lookDump`, for the readout and dump.

## Unresolved constraints

- Sun-shadow rendering and flashlight falloff rely on three.js internals; a three.js upgrade must fail loudly, not change them silently.
- Wide occlusion is tuned by eye on limited indoor scenes. Recheck its strength whenever it or skylight changes.
- Dawn/dusk tone transitions and weathering profiles need review on a real GPU.
- Debug-only look controls must move before their reserved gameplay inputs are bound.
- Shader warm-up gaps remain for model materials and the no-post-processing path.
