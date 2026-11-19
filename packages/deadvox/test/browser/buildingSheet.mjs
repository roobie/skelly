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
 * @import { Browser } from 'playwright'
 * @import { HashState } from '../../src/hashState.ts'
 * @import { SheetPart, SheetView } from './buildingSheetPage.ts'
 * @import { Variants } from './buildingSheetVariants.ts'
 */

/** @typedef {'template' | 'assembly' | 'layout'} SheetKind */

/**
 * @typedef {object} SheetRequest
 * @property {string} id A template, an assembly or a layout; which one is read from the content that authors it.
 * @property {string} [start] The id of a start whose site places the template or assembly; without one, it stands
 *   alone on flat ground. A layout is always drawn on its own.
 * @property {Variants} [variants] The alternative to draw in each named slot.
 * @property {string} out The folder the sheet lands in; when the request draws several, each gets a folder in it.
 * @property {{ width: number, height: number }} viewport
 * @property {HashState} [hash] Hash keys on top of the sheet's own.
 * @property {(line: string) => void} [log]
 */

/**
 * @typedef {object} SheetEntry How the sheet's pages start: the start mod and the opt-in packs it needs.
 * @property {import('./gameUrl.mjs').InlineStartMod | string} startMod
 * @property {readonly string[]} mods
 */

/**
 * @typedef {object} PackContent
 * @property {string} id
 * @property {boolean} optIn Whether a page must name the pack to load it.
 * @property {Partial<Record<string, string[]>>} ids The ids the pack's content files author, by section.
 */

export const STAGE = 'building-sheet';
export const SHEET_INDEX = 'sheet.md';
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const MOD_ROOTS = [resolve(projectRoot, 'mods'), resolve(projectRoot, '../mods')];
const DAY_CYCLE = resolve(projectRoot, '../mods/skelly.day-cycle/dayCycle.json');
/** @type {Readonly<Record<string, SheetKind>>} */
const SHEET_KINDS = { templates: 'template', mapAssemblies: 'assembly', layouts: 'layout' };
const INDEXED_SECTIONS = [...Object.keys(SHEET_KINDS), 'starts'];
const FIXTURE_ID = 'tools.building-sheet';
const FIXTURE_SITE = 'buildingSheet';
// Any half-metre level works for flat ground; this one matches the authored demo sites.
const FIXTURE_GROUND_M = 20.5;
// Flat ground this far round the building, past any view's frame.
const FIXTURE_REACH_M = 128;
// The player stands this far west of the building's lowest corner, out of the front and side shots.
const FIXTURE_SPAWN_OFFSET_M = 3;
const WORLD_ONLY =
  'body > :not(#view), #view * { visibility: hidden !important } #view canvas { visibility: visible !important }';

/** Every pack under the mod roots, with the building and start ids its content files author. */
const readPacks = () =>
  MOD_ROOTS.flatMap((root) =>
    readdirSync(root).flatMap((folder) => {
      const manifestPath = join(root, folder, 'pack/manifest.json');
      if (!existsSync(manifestPath)) {
        return [];
      }
      /** @type {{ id: string, optIn?: boolean, files: { kind: string, path: string }[] }} */
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      /** @type {Record<string, string[]>} */
      const ids = {};
      for (const file of manifest.files.filter(({ kind }) => kind === 'content')) {
        /** @type {Record<string, { id: string }[] | undefined>} */
        const content = JSON.parse(readFileSync(join(root, folder, file.path), 'utf8'));
        for (const section of INDEXED_SECTIONS) {
          ids[section] = [...(ids[section] ?? []), ...(content[section] ?? []).map((row) => row.id)];
        }
      }
      return [{ id: manifest.id, optIn: manifest.optIn === true, ids }];
    }),
  );

/** @type {PackContent[] | undefined} */
let packsRead;
const contentPacks = () => {
  packsRead ??= readPacks();
  return packsRead;
};

/**
 * What `id` names, and the pack that authors it.
 * @param {readonly PackContent[]} packs
 * @param {string} id
 * @returns {{ kind: SheetKind, pack: PackContent }}
 */
export const sheetTarget = (packs, id) => {
  const owners = packs.flatMap((pack) =>
    Object.entries(SHEET_KINDS).flatMap(([section, kind]) => (pack.ids[section]?.includes(id) ? [{ kind, pack }] : [])),
  );
  const [owner, ...others] = owners;
  if (!owner) {
    throw new Error(`No pack authors a template, assembly or layout "${id}"`);
  }
  if (others.length > 0) {
    const found = owners.map(({ kind, pack }) => `a ${kind} in ${pack.id}`).join(' and ');
    throw new Error(`"${id}" names more than one thing: ${found}`);
  }
  return owner;
};

/**
 * The pack that supplies start `id`, which the page's `start-mod` names; misuse lists the start ids.
 * @param {readonly PackContent[]} packs
 * @param {string} id
 */
export const startPack = (packs, id) => {
  const owner = packs.find(({ ids }) => ids.starts?.includes(id));
  if (owner) {
    return owner.id;
  }
  const named = packs.find((pack) => pack.id === id && (pack.ids.starts?.length ?? 0) > 0);
  const hint = named ? ` ${id} is the pack that supplies start ${named.ids.starts?.join(', ')}.` : '';
  const starts = packs.flatMap(({ ids }) => ids.starts ?? []).sort();
  throw new Error(
    `--start takes a start id, and no pack supplies "${id}".${hint} The starts are: ${starts.join(', ')}`,
  );
};

/**
 * What a request draws and the start mod a named start loads, read from the content on disk so a misnamed id fails
 * before any browser starts.
 * @param {Pick<SheetRequest, 'id' | 'start'>} request
 * @param {readonly PackContent[]} [packs]
 */
export const checkSheetRequest = ({ id, start }, packs = contentPacks()) => {
  const { kind, pack } = sheetTarget(packs, id);
  if (start && kind === 'layout') {
    throw new Error(`${id} is a layout, which the sheet draws on its own; drop --start`);
  }
  return { kind, pack, ...(start ? { startMod: startPack(packs, start) } : {}) };
};

/**
 * `--variant` values, each `<slot>=<choice>`, as the choice per slot.
 * @param {readonly string[]} values
 * @returns {Variants}
 */
export const parseVariants = (values) => {
  /** @type {Record<string, string>} */
  const variants = {};
  for (const value of values) {
    const [slot, choice, ...rest] = value.split('=');
    if (!(slot && choice) || rest.length > 0) {
      throw new Error(`--variant expects <slot>=<choice>, got "${value}"`);
    }
    if (slot in variants) {
      throw new Error(`--variant names slot "${slot}" twice`);
    }
    variants[slot] = choice;
  }
  return variants;
};

/** The day cycle's noon, so a sheet's own start is drawn in the light the game's day gives it. */
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
 * The sheet's own start at noon on `site`, depending on the pack that authors what it draws, and the opt-in pack
 * list that loads that pack.
 * @param {string} site
 * @param {PackContent} pack
 * @param {Record<string, unknown>[]} [layouts] Layouts the start adds.
 */
const sheetStart = async (site, pack, layouts) => {
  const start = {
    id: 'buildingsheet',
    site,
    debugOnly: true,
    startTimeGameTimeOfDay: await noon(),
    kit: [],
    wounds: [],
    skills: {},
    recipes: [],
  };
  return {
    startMod: inlineStartMod(FIXTURE_ID, start, { dependencies: [pack.id], ...(layouts ? { layouts } : {}) }),
    mods: pack.optIn ? [pack.id] : [],
  };
};

/**
 * A site placing the template or assembly once, unturned, on flat ground, with the player off to its west.
 * @param {string} id
 */
const loneLayout = (id) => {
  const ground = FIXTURE_GROUND_M;
  return {
    id: FIXTURE_SITE,
    demo: true,
    lootContext: { tier: 'Tier1', usage: ['Residential'] },
    bounds: { x0: -FIXTURE_REACH_M, z0: -FIXTURE_REACH_M, x1: FIXTURE_REACH_M, z1: FIXTURE_REACH_M },
    ground,
    terrain: [],
    buildings: [{ template: id, position: [0, ground, 0], rotation: 0 }],
    player: { position: [-FIXTURE_SPAWN_OFFSET_M, ground + TEMPLATE_BLOCK_SIZE, 0], bearing: 90 },
    actors: [],
    woodlands: [],
    tracks: [],
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
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  log('menu');
  // A refused start keeps the menu closed and says why in the error log, so that ends the wait too.
  const menu = await page.waitForFunction(() => {
    if (document.querySelector('#go')?.getAttribute('aria-disabled') === 'false') {
      return { refusal: '' };
    }
    const shown = document.querySelector('#errors')?.textContent?.trim();
    return shown ? { refusal: shown } : undefined;
  });
  const refusal = (await menu.jsonValue())?.refusal;
  if (refusal) {
    await context.close();
    throw new Error(`The game refused the sheet's start: ${refusal}`);
  }
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
 * @typedef {SheetPart & { cam?: number[] }} PlannedPart
 */

/**
 * Finds the sheets' placements on a page of the site, where to stand beside each and the seed that draws the chosen
 * variants, since the start's spawn may be far from a building and the world streams in round the body.
 * @param {Browser} browser
 * @param {string} url
 * @param {SheetRequest} request
 * @param {string | undefined} placed The template or assembly to find; nothing finds the whole site.
 * @returns {Promise<{ parts: PlannedPart[], seed: number | undefined }>}
 */
const scoutSheet = async (browser, url, { viewport, variants, log = () => undefined }, placed) => {
  log('find-building');
  const { context, page, errors } = await openWorld(browser, url, viewport, { ready: false, log });
  try {
    const found = await page.evaluate(
      async ([id, chosen]) => {
        const { scoutSheet: scout } = await import('/test/browser/buildingSheetPage.ts');
        return scout(globalThis.skellyPlayTest, id ?? undefined, chosen ?? undefined);
      },
      /** @type {const} */ ([placed ?? null, variants ?? null]),
    );
    refuseErrors(errors, 'while finding the building');
    return found;
  } finally {
    await context.close();
  }
};

/**
 * @typedef {object} SheetShot
 * @property {SheetView} view
 * @property {number} renderRealMs
 */

/**
 * The game page path that opens the sheet's start with its hash, so a reviewer walks in from where the sheet stood;
 * a page path, not an address, because the review origin is supplied outside the sheet.
 * @param {SheetEntry} start
 * @param {HashState} hash
 */
const walkInPath = ({ startMod, mods }, hash) => {
  const url = new URL(gameUrl('http://review.invalid/', { startMod, mods, hash: { debug: true, ...hash } }));
  return `${url.pathname}${url.search}${url.hash}`;
};

/**
 * What a sheet shows, for its opening line.
 * @param {SheetRequest} request
 * @param {SheetKind} kind
 * @param {PlannedPart} part
 * @param {string} site
 */
const shownLine = ({ id, start }, kind, part, site) => {
  if (kind === 'layout') {
    return part.folder === 'site'
      ? `Every building the layout \`${id}\` places, seen as one site.`
      : `The \`${part.names[0]}\`, placement ${part.placements[0]} of the layout \`${id}\`.`;
  }
  return start
    ? `The ${kind} \`${id}\`, placement ${part.placements[0]} on site \`${site}\`, from start \`${start}\`.`
    : `The ${kind} \`${id}\`, alone on flat ground.`;
};

/**
 * @param {Variants | undefined} variants
 * @param {number} seed
 */
const variantsLine = (variants, seed) =>
  variants
    ? [
        `Slot variants: ${Object.entries(variants)
          .map(([slot, choice]) => `\`${slot}\` draws \`${choice}\``)
          .join(', ')}, as seed ${seed} draws them.`,
        '',
      ]
    : [];

/**
 * @param {{ title: string, shown: string, variants: string[], walkIn?: string }} head
 * @param {{ seed: number, clock: string, revision: string, shots: SheetShot[] }} facts
 */
const sheetMarkdown = ({ title, shown, variants, walkIn }, { seed, clock, revision: commit, shots }) =>
  [
    `# ${title}`,
    '',
    shown,
    '',
    ...variants,
    ...(walkIn ? [`Walk in beside it: \`${walkIn}\``, ''] : []),
    ...shots.flatMap(({ view: { file, title: viewTitle, direction }, renderRealMs }) => [
      `## ${viewTitle}`,
      '',
      `![${viewTitle}](${file})`,
      '',
      `${viewTitle}: ${direction}. Commit ${commit}, seed ${seed}, ${clock}, rendered in ${(renderRealMs / 1000).toFixed(1)} s.`,
      '',
    ]),
  ].join('\n');

/**
 * The index of a request that draws several sheets, linking each.
 * @param {string} id
 * @param {SheetKind} kind
 * @param {PlannedPart[]} parts
 */
const indexMarkdown = (id, kind, parts) =>
  [
    `# ${id}`,
    '',
    `The ${kind} \`${id}\`, one sheet per part:`,
    '',
    ...parts.map(({ folder, names, placements }) =>
      folder === 'site'
        ? `- [The whole site](site/${SHEET_INDEX}): ${names.join(', ')}`
        : `- [Placement ${placements[0]}, ${names[0]}](${folder}/${SHEET_INDEX})`,
    ),
    '',
  ].join('\n');

/** @param {PlannedPart} part */
const sheetPart = ({ folder, placements, names }) => ({ folder, placements, names });

/**
 * @typedef {object} PartDrawing One part's page and where its sheet lands.
 * @property {string} url
 * @property {SheetRequest} request
 * @property {PlannedPart} part
 * @property {readonly PlannedPart[]} parts Every part the request draws, which the variant seed was searched for.
 * @property {string} out
 * @property {(facts: { seed: number, site: string }) => { title: string, shown: string, variants: string[], walkIn?: string }} head
 */

/**
 * Draws one part's views and writes one PNG per view and a captioned index into its folder. Returns the written
 * files' paths.
 * @param {Browser} browser
 * @param {PartDrawing} drawing
 */
const drawPart = async (browser, { url, request, part, parts, out, head }) => {
  const { viewport, variants, log = () => undefined } = request;
  const { context, page, errors } = await openWorld(browser, url, viewport, { ready: true, log });
  try {
    const plan = await page.evaluate(
      async ([shown, chosen]) => {
        const { enterSheet, planSheet } = await import('/test/browser/buildingSheetPage.ts');
        const handle = globalThis.skellyPlayTest;
        enterSheet(handle);
        return planSheet(handle, shown, chosen ?? undefined);
      },
      /** @type {const} */ ([sheetPart(part), variants ? { variants, parts: parts.map(sheetPart) } : null]),
    );
    // Only the world's canvas shows, so no HUD or debug overlay, present or added later, lands in a picture.
    await page.addStyleTag({ content: WORLD_ONLY });
    await mkdir(out, { recursive: true });
    const canvas = page.locator('#view canvas');
    /** @type {Map<SheetView, number>} */
    const renderRealMs = new Map();
    // A clipped view waits only for its own columns and an unclipped one for the whole view radius, so the
    // clipped views go first while the rest of the radius streams in.
    const clippedFirst = plan.views.toSorted((a, b) => Number(!a.keep) - Number(!b.keep));
    for (const view of clippedFirst) {
      log(view.file);
      const begun = performance.now();
      await page.evaluate(async (shown) => {
        const { showView } = await import('/test/browser/buildingSheetPage.ts');
        await showView(globalThis.skellyPlayTest, shown);
      }, view);
      await writeFile(join(out, view.file), await canvas.screenshot());
      renderRealMs.set(view, performance.now() - begun);
    }
    refuseErrors(errors, 'while drawing the sheet');
    const shots = plan.views.map((view) => ({ view, renderRealMs: renderRealMs.get(view) ?? 0 }));
    const sheet = join(out, SHEET_INDEX);
    await writeFile(sheet, sheetMarkdown(head(plan), { ...plan, revision: revision(), shots }));
    return [...shots.map(({ view }) => join(out, view.file)), sheet];
  } finally {
    await context.close();
  }
};

/**
 * The sheet's own start for a lone building or a layout, or the named start's pack.
 * @param {string} id
 * @param {ReturnType<typeof checkSheetRequest>} target
 * @returns {Promise<SheetEntry>}
 */
const sheetEntry = (id, { kind, pack, startMod }) => {
  if (startMod) {
    return Promise.resolve({ startMod, mods: [] });
  }
  return kind === 'layout' ? sheetStart(id, pack) : sheetStart(FIXTURE_SITE, pack, [loneLayout(id)]);
};

/**
 * @param {string} id
 * @param {PlannedPart} part
 */
const partTitle = (id, { folder }) => {
  if (folder === '') {
    return id;
  }
  return `${id}: ${folder === 'site' ? 'the whole site' : folder}`;
};

/**
 * Renders the sheets of one request through the game page at `origin`: one for a lone building, one per placement
 * the start's site has of it, or for a layout one of the whole site and one per placement. Returns the written
 * files' paths.
 * @param {Browser} browser
 * @param {string} origin
 * @param {SheetRequest} request
 */
export const renderBuildingSheet = async (browser, origin, request) => {
  const { id, start, variants, out, hash = {} } = request;
  const target = checkSheetRequest(request);
  const { kind } = target;
  const entry = await sheetEntry(id, target);
  /** @type {HashState} */
  const sheetHash = { debug: true, freeze: true, ...hash };
  /** @param {HashState} at */
  const url = (at) => browserStageUrl(STAGE, gameUrl(origin, { ...entry, harness: { 'play-test': 1 }, hash: at }));
  // A lone building stands beside the spawn on a site that places only it, so without variants to search for it
  // needs no scout page.
  /** @type {{ parts: PlannedPart[], seed: number | undefined }} */
  const { parts, seed } =
    kind !== 'layout' && !start && !variants
      ? { parts: [{ folder: '', placements: [0], names: [id] }], seed: undefined }
      : await scoutSheet(browser, url(sheetHash), request, kind === 'layout' ? undefined : id);
  /** @type {string[]} */
  const files = [];
  for (const part of parts) {
    /** @type {HashState} */
    const partHash = { ...(part.cam ? { cam: part.cam } : {}), ...(seed === undefined ? {} : { seed }) };
    const walkIn = Object.keys(partHash).length > 0 ? { walkIn: walkInPath(entry, partHash) } : {};
    const drawn = await drawPart(browser, {
      url: url({ ...sheetHash, ...partHash }),
      request,
      part,
      parts,
      out: join(out, part.folder),
      head: (facts) => ({
        title: partTitle(id, part),
        shown: shownLine(request, kind, part, facts.site),
        variants: variantsLine(variants, facts.seed),
        ...walkIn,
      }),
    });
    files.push(...drawn);
  }
  if (parts.length > 1) {
    const index = join(out, SHEET_INDEX);
    await writeFile(index, indexMarkdown(id, kind, parts));
    files.push(index);
  }
  return files;
};
