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

- ACES Filmic tone mapping, exposure 3.0, sRGB block-colour decode, surface patterns on.
- Post-processing on: grade at full strength, film, bloom. Bloom starts where a grey reaches about 0.95 on screen
  for the active tone mapper, not at post-exposure 1: a post-exposure clip of 2.0 for ACES, 5.0 for AgX, 1.1 for
  Neutral and 1.0 with no tone mapping (`BLOOM_CLIP_BY_TONE`, derived in `src/core/mood.ts`), divided by the
  exposure for the pass's threshold. The clip is never below 1, which keeps the sky from blooming. Debug: Delete /
  Insert step it (`?bloomclip=`), by default it follows the tone mapper.
- The flashlight beam is 3.5 cd with a decay of 1 (`src/render/flashlight.ts`, arithmetic in the comment): about 0.7
  after exposure on a mid-albedo block at 2 to 3 m, 0.15 at 10 m. Debug: numpad - / + scale it by 1.25 per press
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
  laptop is unmeasured, and the benchmark renders without the new look. Re-benchmark;
  pulling in the view distance is the agreed lever if it costs too much.
- **Sun shadows rely on a three.js internal.** `src/render/shadows.ts` wraps
  `renderer.shadowMap.render` to choose casters, which a three.js upgrade could break.
  Needs a proper solution before merging.
- **Wide occlusion is tuned by eye on the test house only.** Floor 0.35 and gamma 1 are first
  guesses; revisit them with indoor scenes once skylight (item 5) lands, which will
  overlap with it. The extra quads (up to 47% in the city) are the main cost to watch.
- **Debug keys on planned bindings.** `Q` (all post-processing) is reserved for lean and
  `L` (fogginess down) is planned for sleep in [CONTROLS.md](CONTROLS.md); move both
  before those verbs are bound.
- **Shader warm-up gaps.** glTF model materials and the `post=0` path compile on first use.
- **Not merged.** Everything is on `deadvox/look-experiments` (draft PR #104).
