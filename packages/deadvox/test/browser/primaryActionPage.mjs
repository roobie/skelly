import process from 'node:process';
import { gameUrl } from './gameUrl.mjs';
import { installPrimaryActionProof } from './primary-action-observation.mjs';
import { browserStageUrl } from './stage-mode.mjs';

/**
 * @import { Browser, Page, ViewportSize } from 'playwright'
 * @import { HashState } from '../../src/hashState.ts'
 * @import * as InputBindings from '../../src/product/input.ts'
 * @import { GameUrlParts } from './gameUrl.mjs'
 * @import { BrowserStageMode } from './stage-mode.mjs'
 */

/** The page URL of the game's player input bindings, for page code that dispatches or labels commands. */
export const inputBindingsModule = '/src/product/input.ts';

/**
 * Headless and Xvfb pages grant no pointer lock, so a lock request succeeds at once on the element that asked, as a
 * player's click would. Runs in the page as an init script.
 * @returns {void}
 */
export const fakePointerLock = () => {
  /** @type {Element | null} */
  let locked = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
  Element.prototype.requestPointerLock = function () {
    locked = this;
    document.dispatchEvent(new Event('pointerlockchange'));
    return Promise.resolve();
  };
  document.exitPointerLock = () => {
    locked = null;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
};

/**
 * @typedef {object} StagePage
 * @property {Page} page
 * @property {string[]} pageErrors Every uncaught page error's message, in order.
 */

/**
 * A page that publishes `primaryActionTest` and fakes pointer lock; closing it closes its own context.
 * @param {Browser} browser
 * @param {ViewportSize} viewport
 * @returns {Promise<Readonly<StagePage>>}
 */
export const openStagePage = async (browser, viewport) => {
  const page = await browser.newPage({ viewport });
  await installPrimaryActionProof(page);
  /** @type {string[]} */
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(fakePointerLock);
  return { page, pageErrors };
};

/**
 * @typedef {{
 *   readonly stage: string,
 *   readonly port: number,
 *   readonly startMod: NonNullable<GameUrlParts['startMod']>,
 *   readonly hash: HashState,
 *   readonly renderOverride?: BrowserStageMode | undefined,
 * }} PlayTestStart
 */

/**
 * The game URL of a stage page; it carries the `play-test` harness key that `installPrimaryActionProof` needs.
 * @param {PlayTestStart} start
 * @returns {string}
 */
export const playTestUrl = ({ stage, port, startMod, hash, renderOverride }) =>
  browserStageUrl(
    stage,
    gameUrl(`http://127.0.0.1:${port}`, { startMod, harness: { 'play-test': 1 }, hash }),
    renderOverride,
  );

/** @typedef {{ readonly dominantHand?: 'left' | 'right' }} StartScreenChoice */

/**
 * Opens `url` and waits until its start button accepts a click, after any hand choice.
 * @param {Page} page
 * @param {string} url
 * @param {StartScreenChoice} [choice]
 * @returns {Promise<void>}
 */
export const loadStartScreen = async (page, url, { dominantHand } = {}) => {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  if (dominantHand !== undefined) {
    await page.locator('#dominant-hand').selectOption(dominantHand);
  }
};

/**
 * @typedef {{
 *   testHook: boolean,
 *   overlayHidden: boolean,
 *   pointerLocked: boolean,
 *   worldLoading: string | undefined,
 *   loadingMessage: string | undefined,
 *   maskHidden: boolean,
 * }} WorldReadiness
 */

/**
 * The parts of entering a started world, read in the page, once they differ from `previous` (their JSON).
 * @param {string} previous
 * @returns {WorldReadiness | false}
 */
const changedReadiness = (previous) => {
  const overlay = document.querySelector('#overlay');
  const loading = document.querySelector('#world-loading');
  const mask = loading instanceof HTMLElement ? loading : undefined;
  /** @type {WorldReadiness} */
  const parts = {
    testHook: Boolean(globalThis.primaryActionTest),
    overlayHidden: overlay instanceof HTMLElement && Boolean(overlay.hidden),
    pointerLocked: Boolean(document.pointerLockElement),
    worldLoading: mask?.dataset.state,
    loadingMessage: mask?.querySelector('#world-loading-message')?.textContent,
    maskHidden: mask?.hidden === true,
  };
  return JSON.stringify(parts) === previous ? false : parts;
};

/** @param {WorldReadiness} parts */
const isEntered = (parts) =>
  parts.testHook && parts.overlayHidden && parts.pointerLocked && parts.worldLoading === 'ready' && parts.maskHidden;

/** @param {WorldReadiness} parts */
const isSettled = (parts) => parts.worldLoading === 'ready' || parts.worldLoading === 'failed';

/**
 * Logs `parts` and, until they show the world entered, waits for their next change. Loading owns its deadline (see
 * `world-loading.mjs`, `waitForWorldLoaded`); once it has settled, the rest of the entry waits within the page's
 * default timeout.
 * @param {Page} page
 * @param {WorldReadiness | false} parts
 * @returns {Promise<void>}
 */
const followReadiness = async (page, parts) => {
  if (!parts) {
    throw new Error('A readiness change reported no parts');
  }
  const line = JSON.stringify(parts);
  process.stdout.write(`WORLD_READINESS ${line}\n`);
  if (parts.worldLoading === 'failed') {
    throw new Error(`World loading failed: ${line}`);
  }
  if (parts.worldLoading === 'ready' && !parts.maskHidden) {
    throw new Error(`World loading reported ready but the loading mask is still visible: ${line}`);
  }
  if (isEntered(parts)) {
    return;
  }
  const change = await page.waitForFunction(changedReadiness, line, isSettled(parts) ? {} : { timeout: 0 });
  const next = await change.jsonValue();
  await change.dispose();
  await followReadiness(page, next);
};

/**
 * Starts the game from its start screen and waits until the loaded world is in play under pointer lock. Each change
 * of the readiness parts goes to stdout, so when the enclosing stage's limit kills a hung entry, its last line names
 * the part that stayed false.
 * @param {Page} page
 * @returns {Promise<void>}
 */
export const enterLoadedWorld = async (page) => {
  await page.locator('#go').click();
  await followReadiness(page, await page.evaluate(changedReadiness, ''));
};

/**
 * Dispatches a player command's press the way a bound key does.
 * @param {Page} page
 * @param {string} action
 * @returns {Promise<void>}
 */
export const dispatchPlayerCommand = (page, action) =>
  page.evaluate(
    async ({ id, moduleUrl }) => {
      const { keyboardInput } = /** @type {typeof InputBindings} */ (await import(moduleUrl));
      keyboardInput.command({ action: id, phase: 'down', at: performance.now() });
    },
    { id: action, moduleUrl: inputBindingsModule },
  );

/**
 * Restarts play's input recording from now, as the debug player's restart command does. The command is dispatched
 * rather than keyed because its chord's Shift is also sprint, which would end a lean the new recording starts in.
 * @param {Page} page
 * @returns {Promise<void>}
 */
export const restartInputRecording = (page) =>
  page.evaluate(
    async ({ id, moduleUrl }) => {
      const { keyboardInput } = /** @type {typeof InputBindings} */ (await import(moduleUrl));
      const r = globalThis.primaryActionTest;
      const previous = r.inputRecorder;
      keyboardInput.command({ action: id, phase: 'down', at: performance.now() });
      if (r.inputRecorder === undefined || r.inputRecorder === previous) {
        throw new Error('The debug restart did not start a new input recording');
      }
    },
    { id: 'debug.input-replay-restart', moduleUrl: inputBindingsModule },
  );

/**
 * The text of the replay the debug panel's export offers for download, once it does.
 * @param {Page} page
 * @param {string} exportName names the export in the failure message
 * @returns {Promise<string>}
 */
export const exportedReplayText = async (page, exportName) => {
  await page.waitForFunction(() => {
    const link = document.querySelector('#replay-download');
    return link instanceof HTMLElement && !link.hidden;
  });
  return page.evaluate((name) => {
    const link = document.querySelector('#replay-download');
    if (!(link instanceof HTMLAnchorElement && link.href.startsWith('blob:'))) {
      throw new Error(`${name} did not create a downloadable artifact`);
    }
    return fetch(link.href).then((response) => response.text());
  }, exportName);
};

/**
 * Imports `text` through the debug panel's replay file input and waits for the page it restarts into.
 * @param {Page} page
 * @param {string} fileName
 * @param {string} text
 * @returns {Promise<void>}
 */
export const importReplay = async (page, fileName, text) => {
  const replayRestart = page.waitForEvent('load');
  await dispatchPlayerCommand(page, 'debug.input-replay-import');
  await page.locator('#input-replay-file').setInputFiles({
    name: fileName,
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await replayRestart;
};

/**
 * Waits until the playing replay reports its verdict on the recorded end state.
 * @param {Page} page
 */
export const waitForReplayVerdict = (page) =>
  page.waitForFunction(
    () => {
      const status = document.querySelector('#input-replay-status');
      return (
        status instanceof HTMLElement && ['verified', 'diverged', 'unavailable'].includes(status.dataset.state ?? '')
      );
    },
    undefined,
    { timeout: 20_000 },
  );
