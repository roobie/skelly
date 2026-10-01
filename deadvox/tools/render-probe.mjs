// biome-ignore-all lint/correctness/noNodejsModules: dev tool; launches headless Chromium and writes a screenshot
// biome-ignore-all lint/suspicious/noConsole: CLI report goes to stdout/stderr
//
// Headless render probe: see the game without a display.
//
//   node tools/render-probe.mjs <url> [--out shot.png] [--wait ms]
//                               [--scan cyan,magenta|none] [--window x,y,w,h]
//
// Opens <url> in Playwright Chromium on SwiftShader (software WebGL), waits, screenshots,
// and scans the screenshot's pixels. It prints the WebGL renderer string, filtered console
// output, page errors, and scan results. Use it to verify shader/render changes and to
// reproduce a visual bug at an exact camera pose on a host with no GPU or display (headless
// Firefox cannot create a WebGL context there at all).
//
// Scans (only the page's first <canvas> area, so the debug UI panel is ignored):
//   cyan     hot-check family (`hotcheck=1`): b > r+40 && g > r+40. The hot check colours by
//            material; full/half/checker fill = NaN / Inf-or->8 / negative.
//   magenta  crack-check (`crackcheck=1`): r > 180 && g < 80 && b > 180 = background showing
//            through. Any hit is flagged.
//   Strongly saturated pure-colour counts are also printed (informational, never flagged).
//
// --window x,y,w,h dumps raw "r,g,b" pixels of that screenshot rectangle (max 4096 pixels).
//
// Exit codes: 0 ok; 1 page error, navigation failure, WebGL not initialised, missing
// browser, or a scan found flagged pixels; 2 usage error. Console errors are reported but
// do not fail the run (they include harmless noise such as 404s).
//
// Caveat: SwiftShader is a CPU rasteriser. A clean run does not prove a real GPU/driver is
// clean (and vice versa); the renderer line says which one produced the pixels. It is slow,
// hence the long waits/timeouts.
//
// Relates to the debug toggles in src/debug/lookUrl.ts and src/debug/camUrl.ts:
// `?debug=1`, `cam=x,y,z,yaw,pitch,roll`, `hotcheck=1`, `crackcheck=1`, `bloom=0`, `post=0`,
// `film=0`, `srgb=0`, `patterns=0`, `sunshadow=0`, `torchshadow=0`, `freeze=1`, `tone=`.
//
// One-time per host: `npx playwright install chromium`.

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const { chromium } = await import('playwright');

const USAGE =
  'usage: node tools/render-probe.mjs <url> [--out shot.png] [--wait ms] [--scan cyan,magenta|none] [--window x,y,w,h]';
const NOISE = /Lit is in dev mode|MobActorMeshes|\[vite\] (connecting|connected)/;
const SCAN_KINDS = ['cyan', 'magenta'];
const MAX_WINDOW_PIXELS = 4096;
const SCREENSHOT_TIMEOUT_MS = 90_000;
const NAV_TIMEOUT_MS = 60_000;

const usage = (message) => {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
};

const parseNumbers = (text, count, label) => {
  const parts = text.split(',').map(Number);
  if (parts.length !== count || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    usage(`${label} expects ${count} non-negative integers, got "${text}"`);
  }
  return parts;
};

// One handler per option; each validates its value and stores it on the parsed-options object.
const OPTION_HANDLERS = {
  '--out': (target, value) => {
    target.out = value;
  },
  '--wait': (target, value) => {
    target.wait = parseNumbers(value, 1, '--wait')[0];
  },
  '--scan': (target, value) => {
    target.scan = value === 'none' ? [] : value.split(',');
    const bad = target.scan.find((k) => !SCAN_KINDS.includes(k));
    if (bad) {
      usage(`--scan: unknown kind "${bad}"`);
    }
  },
  '--window': (target, value) => {
    target.window = parseNumbers(value, 4, '--window');
    const area = target.window[2] * target.window[3];
    if (area > MAX_WINDOW_PIXELS || area === 0) {
      usage(`--window must cover 1..${MAX_WINDOW_PIXELS} pixels`);
    }
  },
};

const parseArgs = (argv) => {
  const opts = { url: undefined, out: undefined, wait: 25_000, scan: [...SCAN_KINDS], window: undefined };
  const rest = [...argv];
  while (rest.length > 0) {
    const arg = rest.shift();
    if (!arg.startsWith('--')) {
      if (opts.url !== undefined) {
        usage(`unexpected argument "${arg}"`);
      }
      opts.url = arg;
      continue;
    }
    const handler = OPTION_HANDLERS[arg];
    if (!handler) {
      usage(`unknown option ${arg}`);
    }
    if (rest.length === 0) {
      usage(`${arg} needs a value`);
    }
    handler(opts, rest.shift());
  }
  if (opts.url === undefined) {
    usage('missing <url>');
  }
  return opts;
};

// Runs inside the page: decodes the PNG on a 2D canvas (no Node image dependency) and scans.
const scanInPage = async ({ b64, rect, scan, window: win }) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const cyan = { count: 0, first: [] };
  const magenta = { count: 0, first: [] };
  const saturated = {};
  const record = (bucket, hit) => {
    bucket.count += 1;
    if (bucket.first.length < 12) {
      bucket.first.push(hit);
    }
  };
  // Pure-colour class: every channel high (>=200) or low (<=55), mixed; e.g. "RB" = magenta.
  const pureClass = (r, gg, b) => {
    const chans = [r, gg, b];
    const allHigh = chans.every((v) => v >= 200);
    const allLow = chans.every((v) => v <= 55);
    if (allHigh || allLow || !chans.every((v) => v >= 200 || v <= 55)) {
      return '';
    }
    return ['R', 'G', 'B'].filter((_, k) => chans[k] >= 200).join('');
  };
  const scanPixel = (x, y) => {
    const i = (y * c.width + x) * 4;
    const [r, gg, b] = [d[i], d[i + 1], d[i + 2]];
    if (scan.includes('cyan') && b > r + 40 && gg > r + 40) {
      record(cyan, [x, y, r, gg, b]);
    }
    if (scan.includes('magenta') && r > 180 && gg < 80 && b > 180) {
      record(magenta, [x, y, r, gg, b]);
    }
    const key = pureClass(r, gg, b);
    if (key) {
      saturated[key] = (saturated[key] ?? 0) + 1;
    }
  };
  const x1 = Math.min(c.width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(c.height, Math.ceil(rect.y + rect.height));
  for (let y = Math.max(0, Math.floor(rect.y)); y < y1; y += 1) {
    for (let x = Math.max(0, Math.floor(rect.x)); x < x1; x += 1) {
      scanPixel(x, y);
    }
  }
  const dumpRow = (wx, ww, y) => {
    const row = [];
    for (let x = wx; x < Math.min(wx + ww, c.width); x += 1) {
      const i = (y * c.width + x) * 4;
      row.push(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    }
    return `${y}: ${row.join(' | ')}`;
  };
  const rows = [];
  if (win) {
    const [wx, wy, ww, wh] = win;
    for (let y = wy; y < Math.min(wy + wh, c.height); y += 1) {
      rows.push(dumpRow(wx, ww, y));
    }
  }
  return { size: [c.width, c.height], cyan, magenta, saturated, rows };
};

// Runs inside the page. Re-requesting the page's own context type returns that context.
const probeGl = () => {
  const cv = document.querySelector('canvas');
  if (!cv) {
    return { ok: false, renderer: 'no <canvas> on page', rect: undefined };
  }
  const ctx = cv.getContext('webgl2') ?? cv.getContext('webgl');
  const box = cv.getBoundingClientRect();
  const rect = { x: box.x, y: box.y, width: box.width, height: box.height };
  if (!ctx) {
    return { ok: false, renderer: 'no webgl context', rect };
  }
  const ext = ctx.getExtension('WEBGL_debug_renderer_info');
  return {
    ok: true,
    renderer: ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER),
    rect,
  };
};

const opts = parseArgs(process.argv.slice(2));
const out = opts.out ?? join(await mkdtemp(join(tmpdir(), 'render-probe-')), 'shot.png');

let browser;
try {
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
} catch (error) {
  console.error(`could not launch Chromium: ${error.message.split('\n')[0]}`);
  if (/Executable doesn't exist|playwright install/.test(error.message)) {
    console.error('hint: run `npx playwright install chromium` once on this host');
  }
  process.exit(1);
}

let failed = false;
const logs = [];
const pageErrors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 920 } });
  page.on('console', (m) => logs.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    await page.goto(opts.url, { timeout: NAV_TIMEOUT_MS });
  } catch (error) {
    console.error(`navigation failed: ${error.message.split('\n')[0]}`);
    process.exit(1);
  }
  await page.waitForTimeout(opts.wait);
  const png = await page.screenshot({ path: out, timeout: SCREENSHOT_TIMEOUT_MS });
  const gl = await page.evaluate(probeGl);
  const scan = await page.evaluate(scanInPage, {
    b64: png.toString('base64'),
    rect: gl.rect ?? { x: 0, y: 0, width: 1360, height: 920 },
    scan: opts.scan,
    window: opts.window,
  });

  console.log(`screenshot: ${out} (${scan.size[0]}x${scan.size[1]})`);
  console.log(`renderer: ${gl.renderer}`);
  if (!gl.ok) {
    console.log('FAIL: WebGL did not initialise');
    failed = true;
  }

  const shown = logs.filter((l) => !NOISE.test(l.text) && ['error', 'warning'].includes(l.type));
  console.log(`console errors/warnings (${shown.length}):`);
  for (const l of shown.slice(0, 20)) {
    console.log(`  ${l.type}: ${l.text.slice(0, 400)}`);
  }
  console.log(`page errors (${pageErrors.length}):`);
  for (const e of pageErrors.slice(0, 20)) {
    console.log(`  ${e.slice(0, 400)}`);
  }
  if (pageErrors.length > 0) {
    failed = true;
  }

  for (const kind of opts.scan) {
    const r = scan[kind];
    console.log(`scan ${kind}: ${r.count} pixels${r.count ? ' FLAGGED' : ''}`);
    for (const p of r.first) {
      console.log(`  x=${p[0]} y=${p[1]} rgb=${p.slice(2).join(',')}`);
    }
    if (r.count > 0) {
      failed = true;
    }
  }
  if (opts.scan.length > 0) {
    console.log(`saturated pure colours (info): ${JSON.stringify(scan.saturated)}`);
  }
  if (opts.window) {
    console.log(`window ${opts.window.join(',')} (r,g,b):`);
    for (const row of scan.rows) {
      console.log(`  ${row}`);
    }
  }
} finally {
  await browser.close();
}
console.log(failed ? 'RESULT: FAIL' : 'RESULT: ok');
process.exit(failed ? 1 : 0);
