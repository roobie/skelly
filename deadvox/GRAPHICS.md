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
| 4 | Wider-radius ambient occlusion from the voxel grid, computed while meshing | next |
| 5 | Skylight: light flooding in from the sky, so interiors are dark (planned for Slice 4 in [CHALLENGES.md](CHALLENGES.md#9-lighting)) | later |

Also done along the way: block colours decoded from sRGB (they were rendered as if linear,
so paler than authored); the flashlight fades with daylight; the pause card docks right
with no dimming; the test house gained stonework, colour blocks and furniture.

## The default look

Set in `src/core/mood.ts` (`DEFAULT_LOOK`, `DEFAULT_MOOD`, `DEFAULT_SHADOWS`) and
`DEFAULT_FOGGINESS` in `src/core/weather.ts`:

- ACES Filmic tone mapping, exposure 3.0, sRGB block-colour decode, surface patterns on.
- Post-processing on: grade at full strength, film, bloom (threshold 1/exposure).
- Fogginess 0.2. It is render-only for now; the Slice 4 weather system will drive it, and
  then it becomes saved simulation state (see [ADR 0002](docs/decisions/0002-saves.md)).
- Sun and flashlight shadows on; sun shadow distance 40 m. No shadows from the night
  light, because there is no moon yet.

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
- **Debug keys on planned bindings.** `Q` (all post-processing) is reserved for lean and
  `L` (fogginess down) is planned for sleep in [CONTROLS.md](CONTROLS.md); move both
  before those verbs are bound.
- **Shader warm-up gaps.** glTF model materials and the `post=0` path compile on first use.
- **Not merged.** Everything is on `deadvox/look-experiments` (draft PR #104).
