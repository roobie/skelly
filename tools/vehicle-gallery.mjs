// Builds one review page from the folders `tools/vehicle-look.mjs` writes, so a fleet can be watched as it is authored.
// Each folder may also hold a review file naming the family and listing faults, written by whoever looked at the renders.
// Usage: node tools/vehicle-gallery.mjs --look dirOfOutFolders --out page.html
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

const { values } = parseArgs({
  options: { look: { type: 'string' }, out: { type: 'string', default: 'vehicle-gallery.html' } },
});
if (!values.look) {
  throw new Error('name the folder of vehicle-look outputs with --look');
}

const lookDir = resolve(values.look);
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined);
// Flat-shaded renders lose little to a palette, and a whole fleet must still fit one published page.
const dataUri = async (path) =>
  `data:image/png;base64,${(await sharp(path).png({ palette: true, colours: 128 }).toBuffer()).toString('base64')}`;
const escapeHtml = (text) =>
  String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

let unmarked = 0;

async function readRender(folder, summary) {
  const id = summary.id ?? folder;
  const dir = join(lookDir, folder);
  const front = join(dir, 'sheet', 'tiles', `${id}_front.png`);
  const rear = join(dir, 'sheet', 'tiles', `${id}.png`);
  const sheet = readJson(join(dir, 'sheet', 'sheet.json')) ?? [];
  const reviewPath = join(dir, 'review.json');
  const review = readJson(reviewPath);
  if (review && !Array.isArray(review.faults)) {
    throw new Error('review.json has no faults list');
  }
  const current = summary.state === 'ok' && !sheet.some(({ error }) => error);
  const pictured = current || (existsSync(front) && existsSync(rear));
  return {
    ...summary,
    id,
    name: summary.name ?? id,
    current,
    review,
    reviewStale: Boolean(review) && pictured && statSync(reviewPath).mtimeMs < statSync(rear).mtimeMs,
    sizeCm: sheet.find((row) => row.id === id)?.sizeCm,
    ...(pictured ? { front: await dataUri(front), rear: await dataUri(rear) } : {}),
  };
}

async function readVehicle(folder) {
  try {
    const summary = readJson(join(lookDir, folder, 'summary.json'));
    if (!summary) {
      return;
    }
    // Only `tools/vehicle-look.mjs` marks a state, so a part sheet with no vehicle stays off the page.
    if (summary.state === undefined) {
      unmarked += 1;
      return;
    }
    return await readRender(folder, summary);
  } catch (error) {
    return { id: folder, name: folder, broken: String(error) };
  }
}

// The sheet measures length, height, width; a plate reads length, width, height.
const metres = ([length, height, width]) =>
  `${(length / 100).toFixed(2)} × ${(width / 100).toFixed(2)} × ${(height / 100).toFixed(2)} m`;

function verdict({ broken, review, reviewStale }) {
  if (broken) {
    return '<span class="pill fault">Could not be read</span>';
  }
  if (!review) {
    return '<span class="pill pending">Not reviewed</span>';
  }
  if (reviewStale) {
    return '<span class="pill pending">Review predates render</span>';
  }
  const count = review.faults.length;
  return count === 0
    ? '<span class="pill clear">No faults listed</span>'
    : `<span class="pill fault">${count} ${count === 1 ? 'fault' : 'faults'}</span>`;
}

function card(vehicle) {
  const faults = vehicle.review?.faults ?? [];
  const notCurrent = !(vehicle.broken || vehicle.current);
  const staleNote = vehicle.front ? 'The pictures and numbers are from an older render.' : 'No render has finished.';
  return `<article class="card" id="${escapeHtml(vehicle.id)}">
  <header><h3>${escapeHtml(vehicle.name)}</h3>${notCurrent ? '<span class="pill fault">No current render</span>' : ''}${verdict(vehicle)}</header>
  ${vehicle.broken ? `<p class="note">${escapeHtml(vehicle.broken)}</p>` : ''}
  ${notCurrent ? `<p class="note">${staleNote}</p>` : ''}
  ${
    vehicle.fittings === undefined
      ? ''
      : `<dl>
    <div><dt>L × W × H</dt><dd>${vehicle.sizeCm ? metres(vehicle.sizeCm) : '–'}</dd></div>
    <div><dt>Part mass</dt><dd>${Math.round(vehicle.massKg).toLocaleString('en-GB')} kg</dd></div>
    <div><dt>Fittings</dt><dd>${vehicle.fittings}</dd></div>
    <div><dt>Shared parts</dt><dd>${vehicle.sharedParts} of ${vehicle.parts}</dd></div>
  </dl>`
  }
  ${
    vehicle.front
      ? `<div class="views">
    <figure><img src="${vehicle.front}" alt="${escapeHtml(vehicle.name)}, four views from the front" loading="lazy"><figcaption>Front</figcaption></figure>
    <figure><img src="${vehicle.rear}" alt="${escapeHtml(vehicle.name)}, four views from the rear" loading="lazy"><figcaption>Rear</figcaption></figure>
  </div>`
      : ''
  }
  ${faults.length > 0 ? `<ul class="faults${vehicle.reviewStale ? ' old' : ''}">${faults.map((fault) => `<li>${escapeHtml(fault)}</li>`).join('')}</ul>` : ''}
</article>`;
}

const vehicles = (await Promise.all(readdirSync(lookDir).sort().map(readVehicle))).filter(Boolean);
const families = new Map();
for (const vehicle of vehicles) {
  const family = vehicle.review?.family ?? 'Awaiting review';
  families.set(family, [...(families.get(family) ?? []), vehicle]);
}
const sections = [...families]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(
    ([family, members]) => `<section>
  <h2>${escapeHtml(family)} <span>${members.length}</span></h2>
  <div class="grid">${members.map(card).join('\n')}</div>
</section>`,
  )
  .join('\n');
const faultCount = vehicles.reduce(
  (sum, { review, reviewStale }) => sum + (reviewStale ? 0 : (review?.faults.length ?? 0)),
  0,
);
const brokenFolders = vehicles.filter(({ broken }) => broken);
const notCurrentCount = vehicles.filter(({ broken, current }) => !(broken || current)).length;
const staleReviewCount = vehicles.filter(({ reviewStale }) => reviewStale).length;
const tallyExtra = [
  [brokenFolders.length, 'could not be read'],
  [notCurrentCount, 'with no current render'],
  [staleReviewCount, 'with an old review'],
]
  .filter(([count]) => count > 0)
  .map(([count, label]) => `<span>${count} ${label}</span>`)
  .join('');

const page = `<!doctype html><meta charset="utf-8"><title>Skelly Vehicle Yard</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* A yard inventory: each vehicle is a row of drawings with its data plate beside the name. */
:root {
  --ground: #dfe3de; --sheet: #f1f3ef; --ink: #20261f; --quiet: #586156; --rule: #b5bcb2;
  --plate: #2f4a3a; --on-plate: #eef3ec; --clear: #2d6a42; --fault: #a3321f; --pending: #6b6f5d;
  --display: "Barlow Condensed", "Arial Narrow", sans-serif;
  --data: "IBM Plex Mono", ui-monospace, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --ground: #161a16; --sheet: #20251f; --ink: #e4e8e1; --quiet: #a2aa9e; --rule: #3c443a;
  --plate: #3f6450; --on-plate: #f0f5ee; --clear: #79c394; --fault: #ee8a75; --pending: #b5b9a5; color-scheme: dark;
} }
:root[data-theme="dark"] {
  --ground: #161a16; --sheet: #20251f; --ink: #e4e8e1; --quiet: #a2aa9e; --rule: #3c443a;
  --plate: #3f6450; --on-plate: #f0f5ee; --clear: #79c394; --fault: #ee8a75; --pending: #b5b9a5; color-scheme: dark;
}
body { background: var(--ground); color: var(--ink); font: 14px/1.45 var(--data);
  padding-block: 24px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
main { display: grid; gap: 32px; }
h1, h2, h3 { font-family: var(--display); font-weight: 600; margin: 0; text-wrap: balance; }
h1 { font-size: 2.6rem; line-height: 1; letter-spacing: .01em; }
.tally { display: flex; flex-wrap: wrap; gap: 4px 20px; margin: 8px 0 0; color: var(--quiet); font-variant-numeric: tabular-nums; }
section { display: grid; gap: 12px; }
h2 { font-size: 1.5rem; text-transform: capitalize; border-bottom: 2px solid var(--ink); padding-bottom: 4px; }
h2 span { font: 500 .85rem var(--data); color: var(--quiet); }
.grid { display: grid; gap: 16px; }
.card { background: var(--sheet); border: 1px solid var(--rule); display: grid; gap: 8px; padding: 12px; min-width: 0; }
.card header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
h3 { font-size: 1.45rem; line-height: 1.1; }
.pill { font-size: .75rem; font-weight: 500; padding: 1px 8px; border: 1px solid currentColor; }
.clear { color: var(--clear); } .fault { color: var(--fault); } .pending { color: var(--pending); }
dl { display: flex; flex-wrap: wrap; gap: 2px 16px; margin: 0; padding: 6px 10px; background: var(--plate); color: var(--on-plate); font-size: .8rem; font-variant-numeric: tabular-nums; }
dl div { display: flex; gap: 6px; } dt { opacity: .75; } dd { margin: 0; font-weight: 500; }
.views { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
figure { margin: 0; min-width: 0; }
figure img { display: block; width: 100%; height: auto; border: 1px solid var(--rule); }
figcaption { font-size: .75rem; color: var(--quiet); padding-top: 2px; }
.faults { margin: 0; padding-left: 1.2em; color: var(--fault); font-size: .85rem; }
.faults.old { color: var(--quiet); }
.note { margin: 0; color: var(--fault); font-size: .85rem; overflow-wrap: anywhere; }
.empty { color: var(--quiet); }
@media (max-width: 30rem) { .views { grid-template-columns: 1fr; } }
</style>
<main>
  <header>
    <h1>Skelly Vehicle Yard</h1>
    <p class="tally"><span>${vehicles.length} ${vehicles.length === 1 ? 'vehicle' : 'vehicles'}</span><span>${faultCount} open ${faultCount === 1 ? 'fault' : 'faults'}</span>${tallyExtra}</p>
  </header>
  ${sections || '<p class="empty">No vehicle has been rendered yet.</p>'}
</main>
`;
writeFileSync(resolve(values.out), page);
console.log(
  `${vehicles.length} vehicles, ${faultCount} faults, ${Math.round(page.length / 1024)} KB: ${resolve(values.out)}`,
);
for (const { id, broken } of brokenFolders) {
  console.error(`BROKEN ${id}: ${broken}`);
}
if (unmarked > 0) {
  console.error(`folders left off, summary.json has no render state (re-render any that are vehicles): ${unmarked}`);
}
if (brokenFolders.length > 0) {
  process.exitCode = 1;
}
