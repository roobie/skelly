# deadvox — troubleshooting

How to look at the game and narrow down a problem. Lessons from past problems are in
[LESSONS.md](LESSONS.md).

## Debug parameters

`?debug=1` turns on the debug panel (Backquote) and debug keys. With it, the look and
camera settings live in the URL and update as you change them, so a reload or a pasted
link reproduces what you saw:

- `cam=x,y,z,yaw,pitch,roll`: the player's feet in metres and the view in degrees. Copy it
  from the address bar to share an exact pose.
- `site=testHouse`: the small test scene (block sizes, materials, furniture).
- Look and diagnostics: see `src/debug/lookUrl.ts` and `camUrl.ts` for the full list
  (`post=0`, `bloom=0`, `patterns=0`, `vao=0`, `sunshadow=0`, `fog=…`, `freeze=1`, …).
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
