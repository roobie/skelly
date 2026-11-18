import type { Browser, Page, ViewportSize } from 'playwright';
import type { HashState } from '../../src/hashState.ts';
import type * as InputBindings from '../../src/product/input.ts';
import { type GameUrlParts, gameUrl } from './gameUrl.mjs';
import { installPrimaryActionProof } from './primary-action-observation.mjs';
import { type BrowserStageMode, browserStageUrl } from './stage-mode.mjs';
import { waitForWorldLoaded } from './world-loading.mjs';

/** The page URL of the game's player input bindings, for page code that dispatches or labels commands. */
export const inputBindingsModule = '/src/product/input.ts';

/**
 * A headless page grants no pointer lock, so lock requests succeed at once and lock play's view canvas, as a
 * player's click would. Runs in the page as an init script.
 */
const fakePointerLock = (): void => {
  let locked = false;
  Object.defineProperty(document, 'pointerLockElement', {
    configurable: true,
    get: () => (locked ? (document.querySelector('#view canvas') ?? document.querySelector('#view')) : null),
  });
  Element.prototype.requestPointerLock = () => {
    locked = true;
    document.dispatchEvent(new Event('pointerlockchange'));
    return Promise.resolve();
  };
  document.exitPointerLock = () => {
    locked = false;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
};

export interface StagePage {
  readonly page: Page;
  /** Every uncaught page error's message, in order. */
  readonly pageErrors: string[];
}

/** A page that publishes `primaryActionTest` and fakes pointer lock; closing it closes its own context. */
export const openStagePage = async (browser: Browser, viewport: ViewportSize): Promise<StagePage> => {
  const page = await browser.newPage({ viewport });
  await installPrimaryActionProof(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(fakePointerLock);
  return { page, pageErrors };
};

export interface PlayTestStart {
  readonly stage: string;
  readonly port: number;
  readonly startMod: NonNullable<GameUrlParts['startMod']>;
  readonly hash: HashState;
  readonly renderOverride?: BrowserStageMode | undefined;
}

/** The game URL of a stage page; it carries the `play-test` harness key that `installPrimaryActionProof` needs. */
export const playTestUrl = ({ stage, port, startMod, hash, renderOverride }: PlayTestStart): string =>
  browserStageUrl(
    stage,
    gameUrl(`http://127.0.0.1:${port}`, { startMod, harness: { 'play-test': 1 }, hash }),
    renderOverride,
  );

export interface StartScreenChoice {
  readonly dominantHand?: 'left' | 'right';
}

/** Opens `url` and waits until its start button accepts a click, after any hand choice. */
export const loadStartScreen = async (page: Page, url: string, { dominantHand }: StartScreenChoice = {}) => {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  if (dominantHand !== undefined) {
    await page.locator('#dominant-hand').selectOption(dominantHand);
  }
};

/** Starts the game from its start screen and waits until the loaded world is in play under pointer lock. */
export const enterLoadedWorld = async (page: Page) => {
  await page.locator('#go').click();
  await waitForWorldLoaded(page);
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#overlay');
    return (
      'primaryActionTest' in globalThis &&
      overlay instanceof HTMLElement &&
      overlay.hidden &&
      document.pointerLockElement
    );
  });
};

/** Dispatches a player command's press the way a bound key does. */
export const dispatchPlayerCommand = (page: Page, action: string): Promise<void> =>
  page.evaluate(
    async ({ id, moduleUrl }) => {
      const { keyboardInput } = (await import(moduleUrl)) as typeof InputBindings;
      keyboardInput.command({ action: id, phase: 'down', at: performance.now() });
    },
    { id: action, moduleUrl: inputBindingsModule },
  );

/**
 * Restarts play's input recording from now, as the debug player's restart command does. The command is dispatched
 * rather than keyed because its chord's Shift is also sprint, which would end a lean the new recording starts in.
 */
export const restartInputRecording = (page: Page): Promise<void> =>
  page.evaluate(
    async ({ id, moduleUrl }) => {
      const { keyboardInput } = (await import(moduleUrl)) as typeof InputBindings;
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
 * @param exportName names the export in the failure message
 */
export const exportedReplayText = async (page: Page, exportName: string): Promise<string> => {
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

/** Imports `text` through the debug panel's replay file input and waits for the page it restarts into. */
export const importReplay = async (page: Page, fileName: string, text: string) => {
  const replayRestart = page.waitForEvent('load');
  await dispatchPlayerCommand(page, 'debug.input-replay-import');
  await page.locator('#input-replay-file').setInputFiles({
    name: fileName,
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await replayRestart;
};

/** Waits until the playing replay reports its verdict on the recorded end state. */
export const waitForReplayVerdict = (page: Page) =>
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
