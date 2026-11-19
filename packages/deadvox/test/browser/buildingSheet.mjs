// biome-ignore-all lint/correctness/noNodejsModules: drives the game page from Node and writes the sheet's files
// biome-ignore-all lint/performance/noAwaitInLoops: one page draws the views, each posed and drawn before the next
// The Node side of the building contact sheet, shared by `tools/building-sheet.mjs` and its browser stage. Why:
// `docs/building-sheet.md`.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATE_BLOCK_SIZE } from '@skelly/engine/world';
import { gameUrl, inlineStartMod } from './gameUrl.mjs';
import { browserStageUrl } from './stage-mode.mjs';

/**
 * @import { Browser, Page } from 'playwright'
 * @import { HashState } from '../../src/hashState.ts'
 * @import { SheetView } from './buildingSheetPage.ts'
 */

/** @typedef {'template' | 'assembly'} SheetKind */

/**
 * @typedef {object} SheetRequest
 * @property {SheetKind} kind
 * @property {string} id
 * @property {string} [start] A committed start mod whose site places the building; without one, a template
 *   stands alone on flat ground.
 * @property {string} out
 * @property {{ width: number, height: number }} viewport
 * @property {HashState} [hash] Hash keys on top of the sheet's own.
 * @property {(line: string) => void} [log]
 */

export const STAGE = 'building-sheet';
export const SHEET_INDEX = 'sheet.md';
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const MOD_ROOTS = [resolve(projectRoot, 'mods'), resolve(projectRoot, '../mods')];
const DAY_CYCLE = resolve(projectRoot, '../mods/skelly.day-cycle/dayCycle.json');
const FIXTURE_ID = 'tools.building-sheet';
const FIXTURE_SITE = 'buildingSheet';
// Any half-metre level works for flat ground; this one matches the authored demo sites.
const FIXTURE_GROUND_M = 20.5;
// Flat ground this far round the building, past any view's frame.
const FIXTURE_REACH_M = 128;
// The player stands this far west of the building's lowest corner, out of the front and side shots.
const FIXTURE_SPAWN_OFFSET_M = 3;

/**
 * The pack that authors template `id`, and whether a page must opt in to load it.
 * @param {string} id
 */
const owningPack = (id) => {
  for (const root of MOD_ROOTS) {
    for (const folder of readdirSync(root)) {
      const manifestPath = join(root, folder, 'pack/manifest.json');
      if (!existsSync(manifestPath)) {
        continue;
      }
      /** @type {{ id: string, optIn?: boolean, files: { kind: string, path: string }[] }} */
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      for (const file of manifest.files.filter(({ kind }) => kind === 'content')) {
        /** @type {Record<string, { id: string }[] | undefined>} */
        const content = JSON.parse(readFileSync(join(root, folder, file.path), 'utf8'));
        if (content.templates?.some((row) => row.id === id)) {
          return { id: manifest.id, optIn: manifest.optIn === true };
        }
      }
    }
  }
  throw new Error(`No pack under ${MOD_ROOTS.join(' or ')} authors the template ${id}`);
};

/** The day cycle's noon, so a lone template is drawn in the light the game's day gives it. */
const noon = async () => {
  /** @type {{ dayCycle?: { noonGameTimeOfDay?: string } }} */
  const content = JSON.parse(await readFile(DAY_CYCLE, 'utf8'));
  const time = content.dayCycle?.noonGameTimeOfDay;
  if (!time) {
    throw new Error(`${DAY_CYCLE} names no dayCycle.noonGameTimeOfDay`);
  }
  return time;
};

/**
 * A start mod placing the template once, unturned, on flat ground at noon, with the player off to its west, and
 * the opt-in pack list that loads the template's own pack.
 * @param {string} templateId
 */
const loneTemplateStart = async (templateId) => {
  const pack = owningPack(templateId);
  const ground = FIXTURE_GROUND_M;
  const layout = {
    id: FIXTURE_SITE,
    demo: true,
    lootContext: { tier: 'Tier1', usage: ['Residential'] },
    bounds: { x0: -FIXTURE_REACH_M, z0: -FIXTURE_REACH_M, x1: FIXTURE_REACH_M, z1: FIXTURE_REACH_M },
    ground,
    terrain: [],
    buildings: [{ template: templateId, position: [0, ground, 0], rotation: 0 }],
    player: { position: [-FIXTURE_SPAWN_OFFSET_M, ground + TEMPLATE_BLOCK_SIZE, 0], bearing: 90 },
    actors: [],
    woodlands: [],
    tracks: [],
  };
  const start = {
    id: 'buildingsheet',
    site: FIXTURE_SITE,
    debugOnly: true,
    startTimeGameTimeOfDay: await noon(),
    kit: [],
    wounds: [],
    skills: {},
    recipes: [],
  };
  return {
    startMod: inlineStartMod(FIXTURE_ID, start, { dependencies: [pack.id], layouts: [layout] }),
    mods: pack.optIn ? [pack.id] : [],
  };
};

/** The checkout's short commit, marked when the tree has changes, so a sheet names what drew it. */
const revision = () =>
  execFileSync('git', ['describe', '--always', '--dirty', '--exclude', '*'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();

/**
 * Opens the game in a fresh context, so no earlier world's save is offered, and enters the world.
 * @param {Browser} browser
 * @param {string} url
 * @param {SheetRequest['viewport']} viewport
 * @param {{ ready: boolean, log: (line: string) => void }} options
 */
const openWorld = async (browser, url, viewport, { ready, log }) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  // Software rendering's pace follows machine load; the caller's own deadline bounds a hung wait.
  page.setDefaultTimeout(0);
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const hudless = document.createElement('style');
      hudless.textContent = '#hud, #bottom-hud, #crosshair { visibility: hidden }';
      document.head.append(hudless);
    });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  log('menu');
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  await page.locator('#go').click();
  await page.waitForFunction(() => Boolean(globalThis.skellyPlayTest));
  if (ready) {
    log('pointer-lock');
    await page.waitForFunction(
      () => globalThis.skellyPlayTest.input.locked && !globalThis.skellyPlayTest.input.menuPointer,
    );
    log('world-ready');
    await page.waitForFunction(() => {
      const mask = document.querySelector('#world-loading');
      return mask instanceof HTMLElement && mask.dataset.state === 'ready' && mask.hidden;
    });
  }
  return { context, page, errors };
};

/**
 * @param {string[]} errors
 * @param {string} when
 */
const refuseErrors = (errors, when) => {
  if (errors.length > 0) {
    throw new Error(`The page threw ${when}:\n${errors.join('\n')}`);
  }
};

/**
 * @param {Page} page
 * @param {string} id
 */
const besideCam = (page, id) =>
  page.evaluate(async (templateId) => {
    const { camBeside } = await import('/test/browser/buildingSheetPage.ts');
    return camBeside(globalThis.skellyPlayTest, templateId);
  }, id);

/**
 * @typedef {object} SheetShot
 * @property {SheetView} view
 * @property {number} renderRealMs
 */

/**
 * @param {SheetRequest} request
 * @param {{ site: string, seed: number, clock: string, revision: string, shots: SheetShot[] }} facts
 */
const sheetMarkdown = ({ kind, id, start }, { site, seed, clock, revision: commit, shots }) =>
  [
    `# ${id}`,
    '',
    `The ${kind} \`${id}\` on site \`${site}\`${start ? `, from start mod \`${start}\`` : ', alone on flat ground'}.`,
    '',
    ...shots.flatMap(({ view: { file, title, direction }, renderRealMs }) => [
      `## ${title}`,
      '',
      `![${title}](${file})`,
      '',
      `${title}: ${direction}. Commit ${commit}, seed ${seed}, ${clock}, rendered in ${(renderRealMs / 1000).toFixed(1)} s.`,
      '',
    ]),
  ].join('\n');

/**
 * Renders the sheet's views of one building through the game page at `origin` and writes one PNG per view and a
 * captioned index into `request.out`. Returns the written files' paths.
 * @param {Browser} browser
 * @param {string} origin
 * @param {SheetRequest} request
 */
export const renderBuildingSheet = async (browser, origin, request) => {
  const { kind, id, start, out, viewport, hash = {}, log = () => undefined } = request;
  if (kind === 'assembly' && !start) {
    throw new Error('An assembly is drawn where a start places it; name that start with --start');
  }
  /** @type {HashState} */
  let sheetHash = { debug: true, freeze: true, ...hash };
  const { startMod, mods } = start ? { startMod: start, mods: [] } : await loneTemplateStart(id);
  /** @param {HashState} at */
  const url = (at) =>
    browserStageUrl(STAGE, gameUrl(origin, { startMod, mods, harness: { 'play-test': 1 }, hash: at }));
  if (start) {
    // The start's spawn may be far from the building; a reload with `cam` streams the world in around it.
    log('find-building');
    const scout = await openWorld(browser, url(sheetHash), viewport, { ready: false, log });
    const cam = await besideCam(scout.page, id);
    refuseErrors(scout.errors, 'while finding the building');
    await scout.context.close();
    sheetHash = { ...sheetHash, cam };
  }
  const { context, page, errors } = await openWorld(browser, url(sheetHash), viewport, { ready: true, log });
  try {
    const plan = await page.evaluate(async (templateId) => {
      const { enterSheet, planSheet } = await import('/test/browser/buildingSheetPage.ts');
      const handle = globalThis.skellyPlayTest;
      enterSheet(handle);
      return planSheet(handle, templateId);
    }, id);
    await mkdir(out, { recursive: true });
    const canvas = page.locator('#view canvas');
    /** @type {SheetShot[]} */
    const shots = [];
    for (const view of plan.views) {
      log(view.file);
      const begun = performance.now();
      await page.evaluate(async (shown) => {
        const { showView } = await import('/test/browser/buildingSheetPage.ts');
        await showView(globalThis.skellyPlayTest, shown);
      }, view);
      await writeFile(join(out, view.file), await canvas.screenshot());
      shots.push({ view, renderRealMs: performance.now() - begun });
    }
    refuseErrors(errors, 'while drawing the sheet');
    const sheet = join(out, SHEET_INDEX);
    await writeFile(sheet, sheetMarkdown(request, { ...plan, revision: revision(), shots }));
    return [...shots.map(({ view }) => join(out, view.file)), sheet];
  } finally {
    await context.close();
  }
};
