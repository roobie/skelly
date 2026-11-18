// biome-ignore-all lint/correctness/noNodejsModules: standalone browser regression contract
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node test contract

import assert from 'node:assert/strict';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameUrl, inlineStartMod } from './gameUrl.mjs';
import { instrumentModelLoads, modelLoadAuditPlugin } from './model-load-audit.mjs';

/**
 * @import { ContentFile } from '@skelly/engine/content'
 * @import { BrowserContext } from 'playwright'
 * @import { Plugin } from 'vite'
 */

const TEST_HOUSE_START = inlineStartMod('fixture.save-controller.test-house', {
  density: null,
  id: 'save_controller_test_house_start',
  kit: [
    { condition: 0.7, count: 1, destination: { kind: 'worn' }, id: 'jeans', item: 'jeans' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'sneakers', item: 'sneakers' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'hoodie', item: 'hoodie' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'beans', item: 'canned_beans' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'matches', item: 'matches' },
    { count: 2, destination: { kind: 'pocket', parent: 'jeans', pocket: 2 }, id: 'bandages', item: 'bandage' },
  ],
  recipes: [
    'torch',
    'candle',
    'repair_kit',
    'repair_crowbar',
    'sawn_plank',
    'door_bar',
    'make_rope',
    'grind_kitchen_knife',
    'hone_kitchen_knife',
    'grind_kabar',
    'hone_kabar',
    'grind_machete',
    'hone_machete',
  ],
  seed: 1,
  site: 'testHouse',
  skills: {},
  startTimeGameTimeOfDay: '10:00',
  storeys: 1,
  wounds: [],
});

const root = resolvePath(fileURLToPath(new URL('../..', import.meta.url)));
const { createStageServer, listeningPort } = await import('./stageServer.mjs');
/** @type {Plugin} */
const observation = {
  name: 'save-controller-content',
  enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('/mods/skelly.deadvox.scenario.tutorial/tutorial.json')) {
      // Independent content identities catch runtime dispatch by scenario-specific names.
      /** @type {ContentFile} */
      const content = JSON.parse(code);
      assert(content.layouts, 'the tutorial file carries its layouts');
      for (const layout of content.layouts) {
        const { practice, beats, guidance } = layout;
        assert(practice && beats && guidance, 'each tutorial layout has practice, beats and guidance');
        const previous = practice.exitMark;
        practice.exitMark = 'fixture_guide_exit';
        layout.beats = beats.map((mark) => (mark.id === previous ? { ...mark, id: practice.exitMark } : mark));
        const [first] = guidance.steps;
        assert(first, 'each tutorial guidance has a first step');
        const oldStage = first.id;
        first.id = 'fixture_arrival';
        for (const row of [...guidance.rules, ...guidance.choices]) {
          row.at = row.at.map((stageId) => (stageId === oldStage ? first.id : stageId));
        }
      }
      return JSON.stringify(content);
    }
    if (id.endsWith('/src/render/models.ts')) {
      return instrumentModelLoads(code);
    }
    if (!id.endsWith('/engine/src/game/worldSetup.ts')) {
      return;
    }
    // The scenario as it enters kind dispatch, so the fixture holds whichever site the kind builds.
    const marker = 'const scenario = registry.scenarios.get(config.site);';
    assert(code.includes(marker), 'scenario population fixture admission point exists');
    return code.replace(
      marker,
      'const scenario = ((found) => found && globalThis.skellyRouteFixture === true ?{ ...found, population: { ...found.population, settlementPressure: false, authoredMarkers: false } } : found)(registry.scenarios.get(config.site));',
    );
  },
};

/** The switches every fixture page carries: saves and play exposed to the stage, saves on IndexedDB. */
const HARNESS = { 'save-test': 1, 'play-test': 1, 'save-backend': 'indexeddb' };

/**
 * Gives a page the fixture's exposure switches before the game reads its address. The practice link keeps only
 * its render and mods switches (`packages/presentation/src/presentation/tutorialUrl.ts`, `tutorialUrl`), and
 * a practice page must still expose its play, and would expose a save owner if one were built.
 * @param {BrowserContext} context
 */
export const keepExposureSwitches = (context) =>
  context.addInitScript(
    (switches) => {
      const address = new URL(location.href);
      const missing = switches.filter((name) => address.searchParams.get(name) !== '1');
      if (missing.length > 0) {
        for (const name of missing) {
          address.searchParams.set(name, '1');
        }
        history.replaceState(history.state, '', address);
      }
    },
    /** @type {const} */ (['save-test', 'play-test']),
  );

/** The observed game server both save-controller stages drive, and the address each stage opens. */
export const saveControllerServer = async () => {
  const server = await createStageServer({
    root,
    configFile: `${root}/vite.config.ts`,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [modelLoadAuditPlugin, observation],
  });
  await server.listen();
  return {
    server,
    address: gameUrl(`http://127.0.0.1:${listeningPort(server)}`, {
      startMod: TEST_HOUSE_START,
      harness: HARNESS,
      hash: { seed: 73, radius: 32, actors: 'boxes', post: false, sunshadow: false, torchshadow: false },
    }),
  };
};
