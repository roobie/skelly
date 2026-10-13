// biome-ignore-all lint/correctness/noNodejsModules: a local measuring tool run with Node and Playwright
// Prints `GLYPH_WIDTHS_EM` for src/core/inventoryGridName.ts: each glyph's widest advance among the UI fonts the grid
// name layout covers, measured in Chromium and Firefox and rounded up to 0.01 em (`DESIGN.md`, "Inventory screen").
// DejaVu Sans, Liberation Sans and Nimbus Sans must be installed. Adwaita Sans is fetched from its pinned release and
// measured in Firefox only: Chromium snaps a fetched font's advances to whole pixels at these sizes, which players,
// who have it installed, don't get.
import { createHash } from 'node:crypto';
import process from 'node:process';
import { loadPlaywright } from '../test/browser/chromium.mjs';

const { chromium, firefox } = loadPlaywright();
const INSTALLED_FAMILIES = ['DejaVu Sans', 'Liberation Sans', 'Nimbus Sans'];
const ADWAITA_SANS = {
  family: 'Adwaita Sans',
  url: 'https://gitlab.gnome.org/GNOME/adwaita-fonts/-/raw/51.0/sans/AdwaitaSans-Regular.ttf',
  sha256: '8381c33b9a44f066f2b99dba3d416a2342891e28c956a35dfd8d16ee2987e6d4',
};
// Sizes around the grid name's 11 px, so a browser that rounds advances at some size still shows its widest.
const SIZES_PX = [8.25, 11, 13.75, 16.5];
const GLYPHS = [
  ...new Set([
    ...Array.from({ length: 95 }, (_, i) => String.fromCodePoint(0x20 + i)),
    ...Array.from({ length: 95 }, (_, i) => String.fromCodePoint(0xa1 + i)).filter(
      (glyph) => glyph.codePointAt(0) !== 0xad,
    ),
    ...'–—‘’“”…',
  ]),
];

const fetchAdwaitaSans = async () => {
  const response = await fetch(ADWAITA_SANS.url);
  if (!response.ok) {
    throw new Error(`${ADWAITA_SANS.url}: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== ADWAITA_SANS.sha256) {
    throw new Error(`${ADWAITA_SANS.url}: sha256 ${sha256}, expected ${ADWAITA_SANS.sha256}`);
  }
  return bytes.toString('base64');
};

const measure = async (engine, fetched) => {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    return await page.evaluate(
      async ({ installed, font, glyphs, sizes }) => {
        if (font) {
          const bytes = Uint8Array.from(atob(font.base64), (char) => char.charCodeAt(0));
          document.fonts.add(await new FontFace(font.family, bytes).load());
        }
        const span = document.createElement('span');
        span.style.cssText = 'position: absolute; white-space: pre; line-height: 1';
        document.body.append(span);
        const width = (css, text) => {
          span.style.font = css;
          span.textContent = text;
          return span.getBoundingClientRect().width;
        };
        // A missing family falls back, so its width then follows the fallback named after it.
        const missing = installed.filter(
          (family) => width(`100px "${family}", monospace`, 'mlil') === width('100px monospace', 'mlil'),
        );
        if (missing.length > 0) {
          throw new Error(`fonts not installed: ${missing.join(', ')}`);
        }
        const widestEm = (glyph) =>
          Math.max(
            ...(font ? [...installed, font.family] : installed).flatMap((family) =>
              sizes.map((size) => width(`${size}px "${family}"`, glyph.repeat(40)) / 40 / size),
            ),
          );
        return Object.fromEntries(glyphs.map((glyph) => [glyph, widestEm(glyph)]));
      },
      { installed: INSTALLED_FAMILIES, font: fetched, glyphs: GLYPHS, sizes: SIZES_PX },
    );
  } finally {
    await browser.close();
  }
};

const quote = (text) => {
  const mark = text.includes("'") && !text.includes('"') ? '"' : "'";
  return `${mark}${text.replaceAll('\\', '\\\\').replaceAll(mark, `\\${mark}`)}${mark}`;
};

const adwaitaSans = { family: ADWAITA_SANS.family, base64: await fetchAdwaitaSans() };
const perEngine = await Promise.all([measure(chromium, null), measure(firefox, adwaitaSans)]);
const groups = new Map();
for (const glyph of GLYPHS) {
  const em = Math.ceil(Math.max(...perEngine.map((widest) => widest[glyph])) * 100 - 1e-6) / 100;
  groups.set(em, `${groups.get(em) ?? ''}${glyph}`);
}
const rows = [...groups].sort(([a], [b]) => a - b).map(([em, glyphs]) => `  [${em}, ${quote(glyphs)}],`);
process.stdout.write(`const GLYPH_WIDTHS_EM: readonly (readonly [number, string])[] = [\n${rows.join('\n')}\n];\n`);
