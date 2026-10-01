# deadvox — graphics

Status of the look workstream: what's in, what the default look is, what's open, and
what's next. Started on branch `deadvox/look-experiments` (PR #104) to make the game
look less bland and make things easier to tell apart. Debugging the renderer:
[TROUBLESHOOTING.md](TROUBLESHOOTING.md); lessons: [LESSONS.md](LESSONS.md).

## The plan

From the 2026-10-01 discussion, ranked by mood gained per cost:

| # | Item | Status |
| --- | --- | --- |
| 1 | Procedural surface patterns per block material, in the chunk shader | done |
| 2 | Sun shadows (dawn to dusk) and flashlight shadows | done |
| 3 | Colour grading, film (vignette, grain), bloom, height fog driven by fogginess | done |
| 4 | Wider-radius ambient occlusion from the voxel grid, computed while meshing | done |
| 5 | Skylight: light flooding in from the sky, so interiors are dark (planned for Slice 4 in [CHALLENGES.md](CHALLENGES.md#9-lighting)) | later |

Also done along the way: block colours decoded from sRGB (they were rendered as if linear,
so paler than authored); the flashlight fades with daylight; the pause card docks right
with no dimming; the test house gained stonework, colour blocks and furniture.

## The default look

Set in `src/core/mood.ts` (`DEFAULT_LOOK`, `DEFAULT_MOOD`, `DEFAULT_SHADOWS`) and
`DEFAULT_FOGGINESS` in `src/core/weather.ts`:

- `auto` tone mapping, exposure 3.0, sRGB block-colour decode, surface patterns on. Auto blends three's Neutral
  and ACES Filmic by time of day: by eye, Neutral looks best in bright daylight, ACES (or AgX) at dawn and dusk,
  and ACES at night, where it gives the dark and the flashlight their depth. The weight (0 is Neutral, 1 is ACES)
  is the sky keyframes' `tone` field (`src/core/sky.ts`), interpolated like `bloom`: 0 for full day (08:30 to
  17:30), 0.85 at dawn (06:30) and dusk (19:30), 1 at night (21:00 to 05:00). It ramps linearly between the keyframes,
  so sunrise has no step, and the weather does not move it. `aces`, `agx`, `neutral` and `none` stay selectable
  (debug key J cycles through all, `?tone=`).
  - How it is wired: `src/render/autoTone.ts` replaces the empty `CustomToneMapping` stub in three's
    `tonemapping_pars_fragment` with `mix(NeutralToneMapping(c), ACESFilmicToneMapping(c), autoToneWeight)`, so each
    curve (and its own exposure scaling) is three's code and the ends equal the plain options. `auto` is
    `renderer.toneMapping = CustomToneMapping`; OutputPass picks it up and the weight is a uniform shared with its
    material (`Mood.setSky` writes it every frame). Plain materials have no such uniform, so with `post=0` the frame is
    drawn with Neutral below weight 0.5 and ACES above (`screenToneMapping` in `src/render/mood.ts`).
  - The panel and look dump show `Auto (0.85)`, the current weight.
- Post-processing on: grade at full strength, film, bloom. Bloom starts where a grey reaches about 0.95 on screen
  for the active tone mapper, not at post-exposure 1: a post-exposure clip of 2.0 for ACES, 5.0 for AgX, 1.1 for
  Neutral and 1.0 with no tone mapping (`BLOOM_CLIP_BY_TONE`, derived in `src/core/mood.ts`), divided by the
  exposure for the pass's threshold. Under `auto` the clip is the Neutral and ACES values mixed by the same weight
  (`bloomClipFor(tone, weight)`), 1.1 by day and 2.0 at night. The clip is never below 1, which keeps the sky from
  blooming. Debug: Delete / Insert step it (`?bloomclip=`), by default it follows the tone mapper; under `auto` an
  override is always written to the URL, as the value it would follow moves with the time of day.
- The flashlight beam is 5 cd with a near-field-capped falloff, 1 / (d + 4 m) (`src/render/flashlight.ts` and
  `lightFalloff.ts`, arithmetic in the comment): after exposure about 0.4 on a mid-albedo block at 2 m, 0.15 at
  10 m, and 0.86 on a white block at 1 m. Debug: numpad - / + scale it by 1.25 per press
  (`?torch=`, 1 by default).
- Fogginess 0.2. It is render-only for now; the Slice 4 weather system will drive it, and
  then it becomes saved simulation state (see [ADR 0002](docs/decisions/0002-saves.md)).
- Sun and flashlight shadows on; sun shadow distance 40 m. No shadows from the night
  light, because there is no moon yet.
- Wide ambient occlusion on (`?vao=0` or key `9` turns it off): see below.

## Wide ambient occlusion

The mesher (`src/core/mesher.ts`, `src/core/occlusion.ts`) darkens ambient light only, never
the sun or flashlight, by how enclosed a spot is. Per quad corner it measures the solid
fraction of the half-space box in front of the face: R = 8 blocks (4 m) along the normal
and 8 either side of the vertex across, from a summed-volume table over a solidity array
that reaches 8 blocks beyond the chunk (`extractWide`). Open ground scores 1; a wall foot
about 0.5; an inside corner of two walls about 0.25. The score maps to a factor through
`mix(0.35, 1, openness)` quantized to 6 levels, kept in a separate normalized Uint8 vertex
attribute and multiplied into the indirect irradiance in the chunk shader. The levels are
part of the greedy-merge key, so a merged quad shades as its separate faces would. The
3-neighbour corner AO baked into vertex colours is unchanged. The tuning constants
(radius, floor, gamma, levels) are together at the top of `occlusion.ts`.

- Cells that aren't loaded read as air and everything below the world's bottom layer as
  solid, as for the 1-block padding.
- A block edit now remeshes every chunk within 8 blocks of the cell, diagonals included
  (`affectedChunks`), up to 8 chunks instead of 1 to 3.
- The strength is a uniform, so the debug toggle (`9`, `?vao=0`) needs no remesh.
- Cost, measured in Node on 50 hamlet and city chunks (ms per chunk, median): extraction
  fell from about 0.7 (1-block array) to about 0.4 (both arrays), because it now copies
  rows rather than looking up a chunk per cell; meshing rose from about 1.0 to about 1.6,
  and quads per chunk by 15% (hamlet) to 47% (city). Not yet measured on a real GPU,
  where the extra vertex attribute and quads also cost.

[DESIGN.md](DESIGN.md#rendering) still describes the look as flat colour with textures
only if needed; the surface patterns supersede that and DESIGN.md needs updating once the
look is settled.

## Open

- **Not benchmarked.** The cost of patterns, post-processing and shadows on the reference
  laptop is unmeasured. The benchmarks render without the new look unless given `&post=1`
  (`src/bench/post.ts`), which draws through the mood pass with the default look and shadows; run
  both variants on the reference laptop and compare (commands in the PR note). Pulling in the view
  distance is the agreed lever if it costs too much. Do not read SwiftShader timings as cost.
- **Sun shadows rely on a three.js internal.** `src/render/shadows.ts` wraps
  `renderer.shadowMap.render` to choose casters, which a three.js upgrade could break.
  Needs a proper solution before merging.
- **The flashlight falloff patches a three.js internal.** `src/render/lightFalloff.ts` rewrites one line of
  `ShaderChunk.lights_pars_begin` (the distance falloff) once at start-up, for every material. It throws if the
  line is not found and `test/lightFalloff.test.ts` checks that, so an upgrade fails loudly, but it still needs
  a proper solution (like the shadow hook above) before merging. The flashlight is the only punctual light.
- **The auto tone mapping patches a three.js internal.** `src/render/autoTone.ts` rewrites the `CustomToneMapping` stub
  of `ShaderChunk.tonemapping_pars_fragment` once at start-up (from the `Mood` constructor). It throws if the stub is
  not found and `test/autoTone.test.ts` checks that, so an upgrade fails loudly, but it needs a proper solution (like
  the hooks above) before merging. The ends of the keyframe weights (0 by day, 1 at night) follow the by-eye findings on
  a real GPU; 0.85 at dawn and dusk and the linear ramps are first guesses, not yet looked at on one (dusk starts easing
  towards ACES at 17:30, while the sun is still high).
- **Wide occlusion is tuned by eye on the test house only.** Floor 0.35 and gamma 1 are first
  guesses; revisit them with indoor scenes once skylight (item 5) lands, which will
  overlap with it. The extra quads (up to 47% in the city) are the main cost to watch.
- **Debug keys on planned bindings.** `Q` (all post-processing) is reserved for lean and
  `L` (fogginess down) is planned for sleep in [CONTROLS.md](CONTROLS.md); move both
  before those verbs are bound.
- **Shader warm-up gaps.** glTF model materials and the `post=0` path compile on first use.
- **Not merged.** Everything is on `deadvox/look-experiments` (draft PR #104).
