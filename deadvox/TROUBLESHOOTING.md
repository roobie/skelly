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

In a fresh `?debug=1` game, the player wears a hiking backpack loaded with every content item that has a melee weapon definition; normal games and restored saves are unchanged. `G` opens the spawn menu with its search field focused. Type to filter, use Up/Down to move the highlighted selection, Enter to spawn and close, or Tab to dismiss without spawning. Search-field keys do not control the player.

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
node tools/render-probe.mjs "http://localhost:5173/?debug=1&site=testHouse&cam=-5.21,23.00,5.01,-87.8,-10.2,0.0&hotcheck=1&bloom=0" --out "$XDG_RUNTIME_DIR/shot.png"
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

## Render-free browser logic stages

`?render=0` is a development-only, ordinary-play opt-in that skips WebGL presentation
(Mood and shadow resources) while keeping world setup, simulation and input active. It is
ignored by production builds and benchmark URLs. Chromium logic stages pair it with
`--disable-gpu`; visual stages retain SwiftShader and pixel coverage.

The stages assigned render-free mode in `test/browser/stage-mode.mjs` are `inventory-scroll`,
`melee-build-click`, `primary-action`, `full-auto`, `save-controller-regressions`, the normal
`save-storage` cases, `insecure-saves`, `stairs-traversal`, both `reading` contracts, `firefox-ui`,
and quarantined `firefox-first-click`. The OPFS Continue autosave scenario is the intentional
pixel-mode exception: it builds the production bundle and loads it through Vite preview.

The `melee-build-click` logic stage is newly render-free. Add future stages to the shared mode
helper and use its URL/launch helpers together so the render choice and browser flags stay aligned.
Verify that the stage creates no WebGL context while its simulation and input assertions still
pass; put pixel-only checks in an existing visual stage.

Install Firefox once with `npx playwright install --with-deps firefox`, then from
`deadvox/` run `xvfb-run -a npm run test:browser:firefox` (no `xvfb-run` on a desktop).
This matches CI's enabled cases: explicitly synthetic pointer-lock UI coverage, storage
protocol/kill stages, an independent busy-lock relaunch, and IndexedDB replacement.
The UI checks wait for positive simulation advance, paused nonadvance across observed
frames, and resumed advance—not a HUD minute reached within a wall-clock interval.

Two single-case quarantines remain; a fresh pass does not establish a fix:
- [#168](https://github.com/roobie/skelly/issues/168): native first-gesture pointer-lock
  refusal. Investigate with `xvfb-run -a npm run test:browser:firefox:native`.
- [#170](https://github.com/roobie/skelly/issues/170): built IndexedDB Continue's canvas
  timeout. Investigate with `xvfb-run -a npm run test:browser:firefox:continue`.
Neither is in the default Firefox command. No retries or increased bounds; record a
fixed trial plan and before/after/restored-before evidence before reinstating a case.

Set `DEBUG=pw:browser` for native browser launch/stderr/exit traces. The Chromium UI
launcher emits `UI_LAUNCH_FAILURE` with both executable/argument/PID/exit/signal records,
bounded output tails, ports, HTTP status, discovery error (including its cause), and CDP
targets. Startup fetches and JSON bodies share their stage's remaining deadline.

Save-browser waits emit `BROWSER_FAILURE` without changing the failing result. It
separates absent, hidden/zero-size and unresponsive canvases; records navigation/load,
crash/close/context-loss events, page/console errors, last responsive frame/simulation
time, child output/exit status, and parent/child cgroup memory limits/events/pressure.
Each failure page evaluation is bounded to five seconds. Firefox's public managed
server API supplies child-process diagnostics; this is test infrastructure, not product
persistence policy. Cgroup deltas cover the entire named group, not just the renderer:
`high` reclaim pressure is not an OOM or proof of an app leak.

The busy-lock fixture owns a real exclusive Web Lock in a same-origin blank document.
It needs no second world, renderer or save worker; seeding and recovery use the built
app. It explicitly simulates pointer lock and does not claim native-gesture coverage.
