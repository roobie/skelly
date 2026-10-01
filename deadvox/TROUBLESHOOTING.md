# deadvox — troubleshooting

How to look at the game and narrow down a problem. Lessons from past problems are in
[LESSONS.md](LESSONS.md).

## Debug parameters

`?debug=1` turns on the debug panel (Backquote) and debug keys. With it, the look and
camera settings live in the URL and update as you change them, so a reload or a pasted
link reproduces what you saw. Only deviations from the defaults are written; values and
their ranges are in `src/debug/lookUrl.ts` and `src/debug/camUrl.ts`.

The panel is split into the groups below, each a header that shows its keys and collapses
on a click (remembered per browser). The wheel scrolls the panel, locked or not. The table
is generated from the action table in `src/debug/index.ts` and `src/debug/groups.ts`; a
test fails when it drifts.

<!-- debug-keys:start -->
| Group | Key | Control | URL parameter |
| --- | --- | --- | --- |
| Tools | `B` | Build tools | — |
| Tools | `G` | Spawn item menu | — |
| Tools | `P` | Noclip | — |
| Survival | `H` | God mode | — |
| Survival | `T` | Compress / rest | — |
| Survival | `N` | Emit noise | — |
| Survival | `U` | Danger test | — |
| Survival | `K` | Take 25 damage | — |
| Shamblers | `V` | Spawn shamblers | — |
| Shamblers | `Y` | Melee aim boxes | — |
| Shamblers | `O` | Freeze shamblers | — |
| Time | `M` | Freeze game | `freeze=1` |
| Time | `,` | Skip +23 h (−1 h tomorrow) | — |
| Time | `.` | Skip +1 h | — |
| Look | `J` | Tone mapping | `tone=auto/neutral/aces/agx/none` |
| Look | `-` | Exposure − | `exposure=0.2..3` |
| Look | `=` | Exposure + | `exposure=0.2..3` |
| Look | `I` | sRGB block colours | `srgb=0` |
| Look | `;` | Surface patterns | `patterns=0` |
| Post-processing | `Q` | Mood post-processing (all) | `post=0` |
| Post-processing | `'` | Bloom | `bloom=0` |
| Post-processing | `Del` | Bloom clip − | `bloomclip=1..8` |
| Post-processing | `Ins` | Bloom clip + | `bloomclip=1..8` |
| Post-processing | `\` | Film (vignette, grain) | `film=0` |
| Post-processing | `[` | Grade − | `grade=0..1` |
| Post-processing | `]` | Grade + | `grade=0..1` |
| Lighting | `9` | Wide ambient occlusion | `vao=0` |
| Lighting | `Num -` | Flashlight strength − | `torch=0.1..16` |
| Lighting | `Num +` | Flashlight strength + | `torch=0.1..16` |
| Lighting | `0` | Sun shadows | `sunshadow=0` |
| Lighting | `Home` | Flashlight shadows | `torchshadow=0` |
| Lighting | `PgUp` | Sun shadow distance | `shadowdist=16..96` |
| Atmosphere | `L` | Fogginess − | `fog=0..1` |
| Atmosphere | `/` | Fogginess + | `fog=0..1` |
| Diagnostics | `End` | Crack check (magenta background) | `crackcheck=1` |
| Diagnostics | `PgDn` | Hot-pixel check (coloured) | `hotcheck=1` |
| Diagnostics | — | Mouse readout (bottom left, always on) | — |
| Diagnostics | `F4` | Performance overlay | — |
| Share | — | Camera pose, kept in the address bar | `cam=x,y,z,yaw,pitch,roll` |
| Share | — | Dump look settings (JSON), a button | — |
<!-- debug-keys:end -->

- `cam=x,y,z,yaw,pitch,roll`: the player's feet in metres and the view in degrees. Copy it
  from the address bar to share an exact pose.
- `site=testHouse`: the small test scene (block sizes, materials, furniture).
- `hotcheck=1` (PageDown): world fragments whose colour is NaN, infinite, negative or
  above 8 are painted by material (legend in the debug panel); full / half / checker fill =
  NaN / Inf-or->8 / negative. It runs after fog.
- `crackcheck=1` (End): the background is cleared to magenta, so holes show.

Bisect a visual bug by flipping one toggle at a time before theorising.

## Seeing the game without a display

`tools/render-probe.mjs` renders a URL in headless Chromium on SwiftShader (software
WebGL), screenshots it, and scans the pixels. Use it to verify shader or rendering changes
and to reproduce a reported visual bug at an exact `cam=` pose. Headless Firefox cannot
create a WebGL context on a display-less host; use this instead.

One-time per host: `npx playwright install chromium`. Then, with `npm run dev` running in
`deadvox/`:

```sh
cd deadvox
node tools/render-probe.mjs "http://localhost:5173/?debug=1&site=testHouse&cam=-5.21,23.00,5.01,-87.8,-10.2,0.0&hotcheck=1&bloom=0" --out /tmp/shot.png
```

It prints the WebGL renderer, console errors, page errors, and scan counts with the first
hits; `--window x,y,w,h` dumps raw RGB. Exit 1 on a page error, no WebGL, or flagged
pixels; 2 on bad usage. Look at the screenshot itself too.

- Any hot-check or crack-check pixel is flagged.
- The renderer line says what drew the pixels. SwiftShader is not a GPU: a clean run does
  not rule out GPU- or driver-specific issues. It is slow; keep the 25 s default wait.

## Browser contracts on software GL

On software GL (SwiftShader, headless or under Xvfb) the look slows start-up: in a cut-down
Firefox start-up probe, page load took 6.1 s with the default look against 2.5 s with
`post=0&sunshadow=0&torchshadow=0`. `npm run test:ui-browser` therefore opens the game with
those three parameters (commit `3299e50`; on the full look the contract took 8m09s against
its 300 s cap). It tests the UI, not the look.

`npm run test:browser:firefox` still runs with the full look, on purpose, as it covers the
real start-up path. On a loaded machine it can time out at its 10 s pointer-lock and overlay
wait (`test/browser/firefox-first-click.mjs:103`): on this branch it failed once and then
passed twice on a host at load ~5, and it passed on `main` at the branch point and on a real
GPU. Re-run it before suspecting the code, and compare with a real-GPU run. Install Firefox
once with `npx playwright install --with-deps firefox`, then from `deadvox/` run
`xvfb-run -a npm run test:browser:firefox` (no `xvfb-run` on a desktop), as
`.github/workflows/deadvox.yml` does.
