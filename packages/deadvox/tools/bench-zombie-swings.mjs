import { resolve } from 'node:path';
import { createStageServer } from '../test/browser/stageServer.mjs';

/**
 * @import * as Content from '@skelly/engine/content'
 * @import * as Inventory from '@skelly/engine/inventory'
 * @import * as Sim from '@skelly/engine/sim'
 * @import * as World from '@skelly/engine/world'
 * @import { Actor, MeleeWeapon, PlayerSense } from '@skelly/engine/sim'
 * @import { Vec3 } from '@skelly/engine/world'
 * @import * as BundledPacks from './readBundledPacks.ts'
 */

// Why this bound: `packages/deadvox/DESIGN.md`, "Combat and noise".
const SWING_MEDIAN_BOUND_MS = 1.5;
const projectRoot = resolve(import.meta.dirname, '..');
const server = await createStageServer({
  configFile: resolve(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  logLevel: 'silent',
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { buildRegistry, requireDayCycle } = /** @type {typeof Content} */ (
    await server.ssrLoadModule('@skelly/engine/content')
  );
  const { claimed } = /** @type {typeof Inventory} */ (await server.ssrLoadModule('@skelly/engine/inventory'));
  const { ActorSystem, dayPhaseAt, parseTimeOfDay, physicsFor, playerTuning, unarmedMeleeWeapon } =
    /** @type {typeof Sim} */ (await server.ssrLoadModule('@skelly/engine/sim'));
  const { makeScale, siteGenerationOf } = /** @type {typeof World} */ (
    await server.ssrLoadModule('@skelly/engine/world')
  );
  const { readStackActorFigureFiles, readStackContentSources } = /** @type {typeof BundledPacks} */ (
    await server.ssrLoadModule('/tools/readBundledPacks.ts')
  );
  const { registry } = buildRegistry(readStackContentSources(projectRoot, 'skelly.deadvox'));
  const actorFigureFiles = readStackActorFigureFiles(projectRoot, 'skelly.deadvox', registry);
  const PLAYER = playerTuning(registry);
  const shambler = registry.actors.get('shambler');
  if (!shambler) {
    throw new Error('The base content defines no shambler');
  }
  const tuning = claimed(registry.senses, 'player');
  if (!tuning) {
    throw new Error('The base content defines no player senses');
  }
  const noon = parseTimeOfDay('12:00');
  if (noon === undefined) {
    throw new Error('The bench time of day does not parse');
  }
  const type = { ...shambler, dismember: { chance: 0, headOnKillChance: 0 } };
  /** @type {PlayerSense} */
  const player = {
    pos: [100, 2, 100],
    facing: [0, 0, -1],
    movement: 'still',
    lit: false,
    lightSeenFrom: 0,
    eyeHeightMetres: PLAYER.eye,
  };
  const zombies = new ActorSystem({
    activeActorRadiusMetres: siteGenerationOf(registry).activeActorRadiusMetres,
    actorFigureFiles,
    seed: 41,
    isSolid: () => false,
    isOpaque: () => false,
    blockSize: 0.5,
    physics: physicsFor(makeScale(0.5), PLAYER),
    tuning,
    player: () => player,
    dayPhase: () => dayPhaseAt(requireDayCycle(registry), noon),
    hurtPlayer: () => undefined,
  });
  /** @type {Vec3} */
  const center = [10, 1, 10];
  /** @type {{ zombie: Actor; regions: Actor['regions'] }[]} */
  const baseline = [];
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      /** @type {Vec3} */
      const position = [center[0] + (column - 3.5) * 0.7, center[1], center[2] + (row - 3.5) * 0.7];
      const id = zombies.add(type, position, [0, 0, -1]);
      const zombie = zombies.store.get(id);
      if (!zombie) {
        throw new Error(`Added shambler ${id} is not in the store`);
      }
      baseline.push({ zombie, regions: { ...zombie.regions } });
    }
  }
  /** @type {MeleeWeapon} */
  const weapon = { ...unarmedMeleeWeapon(registry.meleeClasses), damage: 1, reach: 1.3, cooldown: 0, impulse: 4 };
  /** @type {Vec3} */
  const origin = [center[0], center[1] + 3.1, center[2] - 2.5];
  /** @type {Vec3} */
  const direction = [0, 0, 1];
  const restoreHealth = () => {
    for (const { zombie, regions } of baseline) {
      Object.assign(zombie.regions, regions);
      zombie.severed.length = 0;
      zombie.incapacitated = false;
    }
  };
  for (let i = 0; i < 40; i++) {
    restoreHealth();
    zombies.swing(origin, direction, weapon);
  }
  /** @type {number[]} */
  const samples = [];
  for (let i = 0; i < 200; i++) {
    restoreHealth();
    const start = performance.now();
    zombies.swing(origin, direction, weapon);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  /** @param {number} index */
  const sampleAt = (index) => samples.at(index) ?? Number.NaN;
  const median = (sampleAt(99) + sampleAt(100)) / 2;
  const p95 = sampleAt(-11);
  console.log(`64 zombies within 3 m, 200 swings: median ${median.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms`);
  if (!(median < SWING_MEDIAN_BOUND_MS)) {
    throw new Error(`swing median exceeds the ${SWING_MEDIAN_BOUND_MS} ms bound`);
  }
} finally {
  await server.close();
}
