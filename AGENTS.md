# Notes for coding agents

## Worktrees

Put git worktrees in `.claude/worktrees/<name>` inside this repo, not beside
the clone:

```sh
git worktree add .claude/worktrees/<name> -b <branch>
```

The directory is in `.gitignore`. Each worktree needs its own `npm install`
in the subprojects it runs.

## Installing check dependencies

Root lint resolves imports across every subproject, so install them all, as CI does, before
you trust a lint failure (a missing `node_modules` looks like an unresolved import):

```sh
npm ci
npm ci --prefix gungen
npm ci --prefix deadvox
npm ci --prefix mobgen
npm ci --prefix deadvox/tools/lit-check   # for deadvox's lint:lit
```

Firefox and xvfb for deadvox's `test:browser:firefox`: see `.github/workflows/deadvox.yml`.

## Seeing the game without a display

`deadvox/tools/render-probe.mjs` renders a URL in headless Chromium on SwiftShader
(software WebGL), screenshots it, and scans the pixels. Use it to verify shader or
rendering changes and to reproduce a reported visual bug at an exact `cam=` pose.
Headless Firefox cannot create a WebGL context on a display-less host; use this instead.

One-time per host: `npx playwright install chromium`. Then, with `npm run dev` running
in `deadvox/`:

```sh
cd deadvox
node tools/render-probe.mjs "http://localhost:5173/?debug=1&site=testHouse&cam=-5.21,23.00,5.01,-87.8,-10.2,0.0&hotcheck=1&bloom=0" --out /tmp/shot.png
```

It prints the WebGL renderer, console errors, page errors, and scan counts with the first
hits; `--window x,y,w,h` dumps raw RGB. Exit 1 on a page error, no WebGL, or flagged
pixels; 2 on bad usage. Read the screenshot with the Read tool. Debug params live in
`deadvox/src/debug/lookUrl.ts` and `camUrl.ts`.

- Hot check (`hotcheck=1`): colour = material; full / half / checker fill = NaN /
  Inf-or->8 / negative. Any cyan-family pixel is flagged.
- Crack check (`crackcheck=1`): magenta = background visible through a gap. Flagged.
- The renderer line says what drew the pixels. SwiftShader is not a GPU: a clean run
  does not rule out GPU- or driver-specific issues. It is slow; keep the 25 s default wait.

### Shader varyings under MSAA

The scene renders with MSAA, so an edge pixel can be shaded at a point outside its
triangle, and every non-`flat` varying is then extrapolated past its vertex values. Maths
that looks bounded is not: an interpolated colour, AO factor or fog depth can go negative
or overshoot, and `exp()`, ACES and bloom turn that into white pixels or discs at grazing
view angles. It took three fixes to find them all: the chunk vertex colour (`438e1bb`,
`dbc7759`) and the height-fog depth (`1b65f7d`). When you add or patch a shader:

- Declare varyings that feed shading `centroid` (per-quad ids `flat`), and clamp what you
  derive from them to its valid range, as a guard for drivers without proper centroid.
- Run the hot check after the last colour change (after fog), or it misses values that
  fog or later steps produce.
- SwiftShader did not reproduce every case; confirm on a real GPU at the reported `cam=`.

## Before pushing

From the repository root, run `npm run ci` and `npm run test:site`. For a
subproject change, also run that project's CI checks before pushing (typecheck,
tests, and build; Gungen also runs `test:sweeps`, and Deadvox also runs
`test:ui-browser`). The installed pre-push hook runs the root checks; the root `prepare` script
configures Git to use `.githooks`. If the hook is not installed, run
`git config core.hooksPath .githooks`. Fix failures before pushing; do not use
`--no-verify` to bypass a real failure. It is for emergencies only.
