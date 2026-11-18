// biome-ignore-all lint/correctness/noNodejsModules: the stage's phase timings go to the Node runner's stdout
import process from 'node:process';
import { BLOCK_SIZE, CHUNK, chunksFor, makeScale } from '@skelly/engine/world';
import graphicsFile from '../../../mods/skelly.graphics/graphics.json' with { type: 'json' };

/**
 * @import { Page } from 'playwright'
 * @import { Plugin } from 'vite'
 * @import { PlayTestHandle } from './playTestHandle.ts'
 */

export const cleanReplayRadiusM = 32;
const columnMetres = CHUNK * BLOCK_SIZE;
const [graphics] = graphicsFile.graphics;
if (!graphics) {
  throw new Error('skelly.graphics ships no graphics entry');
}
const streamEdgeColumn = chunksFor(makeScale(BLOCK_SIZE), cleanReplayRadiusM) + graphics.skyPreloadRings + 1;
const streamEdgeActorX = (streamEdgeColumn + 0.5) * columnMetres;

/**
 * @param {string} phase
 * @param {number} start the phase's `performance.now()` start
 */
export const logPhase = (phase, start) => {
  process.stdout.write(
    `PRIMARY_ACTION_TIMING ${JSON.stringify({ phase, milliseconds: Math.round(performance.now() - start) })}\n`,
  );
};

/**
 * @template T
 * @param {string} phase
 * @param {() => Promise<T>} action
 * @returns {Promise<T>}
 */
export const timePhase = async (phase, action) => {
  process.stdout.write(`PRIMARY_ACTION_PHASE_START ${phase}\n`);
  const start = performance.now();
  try {
    return await action();
  } finally {
    logPhase(phase, start);
  }
};

/** @type {Plugin} */
export const observationPlugin = {
  name: 'primary-action-test-observation',
  enforce: 'pre',
  transform(code, id) {
    // A quiet test-owned site isolates replay's stream-edge witness from scenario population changes.
    if (id.endsWith('/mods/skelly.deadvox.scenario.lone-house/layouts.json')) {
      const data = JSON.parse(code);
      data.layouts.push({
        id: 'replay_fixture',
        lootContext: { usage: ['Residential'], tier: 'Tier1' },
        bounds: { x0: -64, z0: -64, x1: Math.max(64, streamEdgeActorX + columnMetres), z1: 64 },
        ground: 20,
        terrain: [],
        buildings: [],
        woodlands: [],
        tracks: [],
        player: { position: [8, 20.5, 8], bearing: 0 },
        // Its own column is generated, but the outward neighbour is not: replay must preserve that gate.
        actors: [{ type: 'shambler', position: [streamEdgeActorX, 20.5, 8] }],
      });
      return JSON.stringify(data);
    }
    if (!id.endsWith('/mods/skelly.deadvox.scenario.test-house/starts.json')) {
      return;
    }
    const data = JSON.parse(code);
    // Quickbar replay needs owned stock without borrowing the product's kit or an implicit debug bag.
    data.items = [
      {
        id: 'replay_fixture_stock',
        name: 'Replay stock',
        category: 'material',
        size: [1, 1],
        weight: 1,
        workInProgress: false,
      },
    ];
    return JSON.stringify(data);
  },
};

/**
 * Publishes `primaryActionTest` on `page` as the game publishes play's handle, which is before play's first frame,
 * so the proof's frame and swing counts and its start position cover the whole session. The page's URL must carry
 * the `play-test` harness key.
 *
 * @param {Page} page
 */
export const installPrimaryActionProof = (page) =>
  page.addInitScript((moduleUrl) => {
    // Loading from document start lets the module be ready when the handle arrives.
    const proofModule = /** @type {Promise<typeof import('./primaryActionProof.ts')>} */ (import(moduleUrl));
    Object.defineProperty(globalThis, 'skellyPlayTest', {
      configurable: true,
      /** @param {PlayTestHandle} handle */
      set(handle) {
        Object.defineProperty(globalThis, 'skellyPlayTest', { configurable: true, writable: true, value: handle });
        void proofModule.then(({ primaryActionProof }) => {
          Object.assign(globalThis, { primaryActionTest: primaryActionProof(handle) });
        });
      },
    });
  }, '/test/browser/primaryActionProof.ts');
