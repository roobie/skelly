import { execFileSync } from 'node:child_process';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { actorFigure, buildRegistry, requireDayCycle } from '@skelly/engine/content';
import { claimed } from '@skelly/engine/inventory';
import { FUSED_MASS_FIGURE_SEED, fusedMassCollisionEnvelope, fusedMassTypeOf } from '@skelly/engine/pose';
import { BlockEntities, makeScale, siteGenerationOf, World, worldBricks, worldSolid } from '@skelly/engine/world';
import { readStackActorFigureFiles, readStackContentSources } from '../../tools/readBundledPacks.ts';

/**
 * @import { Vec3 } from '@skelly/engine/world'
 * @import { PlayerSense } from '@skelly/engine/sim'
 * @import { FusedMassShape } from '@skelly/engine/internal/core/fusedMassShape.ts'
 */
/**
 * ActorSystem keeps its collision steps private; the bench wraps them by name to time them apart from the tick.
 * @typedef {{ stepActorBody: () => void, openSide: (aim: Vec3) => -1 | 1 | undefined }} CollisionSteps
 */

const args = process.argv.slice(2);
const shapeRef = args.length === 2 && args[0] === '--shape-ref' ? args[1] : undefined;
if (args.length > 0 && (shapeRef === undefined || !/^[0-9a-f]{7,40}$/.test(shapeRef))) {
  throw new Error('Usage: npm run bench:fused-mass -- [--shape-ref commit-sha]');
}
const shapeUrl = new URL('core/fusedMassShape.ts', import.meta.resolve('@skelly/engine/sim')).href;
let substituted = false;
if (shapeRef !== undefined) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const source = stripTypeScriptTypes(
    execFileSync('git', ['-C', root, 'show', `${shapeRef}:packages/engine/src/core/fusedMassShape.ts`], {
      encoding: 'utf8',
    }),
  );
  registerHooks({
    load(url, context, nextLoad) {
      if (url === shapeUrl) {
        substituted = true;
        return { format: 'module', source, shortCircuit: true };
      }
      return nextLoad(url, context);
    },
  });
}
// The simulation entry loads the shape, so it is imported only once the hook can substitute it.
const { ActorSystem, dayPhaseAt, physicsFor, playerTuning } = await import('@skelly/engine/sim');
if (shapeRef !== undefined && !substituted) {
  throw new Error('The baseline shape was not loaded');
}
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { registry } = buildRegistry(readStackContentSources(packageRoot, 'skelly.deadvox'));
const actorFigureFiles = readStackActorFigureFiles(packageRoot, 'skelly.deadvox', registry);
const scale = makeScale(0.5);
const PLAYER = playerTuning(registry);
const tuning = claimed(registry.senses, 'player');
if (!tuning) {
  throw new Error('The base content has no player senses');
}
const type = fusedMassTypeOf(registry.actors);
if (!type) {
  throw new Error('The base content has no fused mass');
}
const figure = actorFigure(actorFigureFiles, type, FUSED_MASS_FIGURE_SEED).fusedMass;
if (!figure) {
  throw new Error('The fused mass figure has no fused-mass body');
}
const envelope = fusedMassCollisionEnvelope(figure, scale.blockSize);
const dt = 1 / 60;
const ticks = 75;
const warmups = 5;
const runs = 25;
/**
 * @param {number[]} samples
 * @param {number} p
 */
const percentile = (samples, p) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1];
/** @param {import('@skelly/engine/sim').ActorSystem} system */
const collisionSteps = (system) => /** @type {CollisionSteps} */ (/** @type {unknown} */ (system));
/** @param {ReturnType<import('@skelly/engine/sim').ActorSystem['shapeOf']>} shape */
const fusedMassShape = (shape) => {
  if (!(shape && 'pushOut' in shape)) {
    throw new Error('The fused mass has no fused-mass shape');
  }
  return /** @type {FusedMassShape} */ (shape);
};

// The terrain is a real World read through worldBricks, as the game reads it, so the shape pays what a brick
// read costs there. The bench has no streaming or block edits; measuring chunk construction would conflate
// collision cost with terrain admission, so the bricks are read once before timing.
const solidBlock = registry.blocks.findIndex((block, id) => id > 0 && block?.solid === true);
const fillWorld = (world, solid) => {
  for (let x = -24; x < 40; x++) {
    for (let z = -24; z < 40; z++) {
      for (let y = 0; y < 12; y++) {
        if (solid(x, y, z)) {
          world.setBlock(x, y, z, solidBlock);
        }
      }
    }
  }
};
const readBricks = (bricks) => {
  for (let bx = -6; bx < 10; bx++) {
    for (let bz = -6; bz < 10; bz++) {
      for (let by = 0; by < 3; by++) {
        bricks.brick(bx, by, bz, { lo: 0, hi: 0 });
      }
    }
  }
};
const arena = (solid) => {
  const world = new World();
  fillWorld(world, solid);
  const entities = new BlockEntities(registry);
  const bricks = worldBricks(world, registry, entities);
  readBricks(bricks);
  return { bricks, isSolid: worldSolid(world, registry, entities) };
};

const scenarios = [
  { name: 'wall push', corridor: false },
  { name: 'snug corridor', corridor: true },
];
console.log(
  JSON.stringify({
    method: {
      dt,
      ticks,
      warmups,
      runs,
      clock: 'hrtime.bigint',
      collision:
        'stepActorBody plus openSide (turn, physics, ground, wall and slide probes); separate pass from whole tick',
      shapeRef: shapeRef ?? 'working tree',
      budget: 'collision p95',
      corridorWidth: 'realized facing -z body width plus one block, rounded up to whole blocks',
      wallLocomotion: 'forward to exercise turning push; corridor uses authored locomotion',
    },
  }),
);
for (const { name, corridor } of scenarios) {
  const right = Math.ceil(envelope.halfWidth * 2 + 1);
  const solid = (x, y, z) => y === 0 || (y > 0 && (corridor ? x < 0 || x >= right : z < 0));
  const { bricks: terrain, isSolid } = arena(solid);
  /** @type {PlayerSense} */
  const sense = {
    pos: [0, 1, 0],
    facing: [0, 0, -1],
    movement: 'jogging',
    lit: false,
    lightSeenFrom: 40,
    eyeHeightMetres: PLAYER.eye,
  };
  const createSystem = () =>
    new ActorSystem({
      activeActorRadiusMetres: siteGenerationOf(registry).activeActorRadiusMetres,
      actorFigureFiles,
      player: () => sense,
      isSolid,
      solidBricks: terrain,
      isOpaque: () => false,
      dayPhase: () => dayPhaseAt(requireDayCycle(registry), 12 * 3600),
      blockSize: scale.blockSize,
      physics: physicsFor(scale, PLAYER),
      tuning,
      hurtPlayer: () => undefined,
      seed: 17,
    });
  const system = createSystem();
  /** @type {typeof type} */
  const actorType = corridor ? type : { ...type, locomotion: 'forward' };
  const id = system.add(
    actorType,
    corridor ? [envelope.halfWidth + 1, 1.001, 0] : [0.5, 1.001, envelope.halfDepth + 1],
    [0, 0, -1],
  );
  const actor = system.store.get(id);
  if (!actor) {
    throw new Error('The fused mass was not added');
  }
  const shape = fusedMassShape(system.shapeOf(actor.body));
  /** @type {0 | 2} */
  const axis = corridor ? 0 : 2;
  /** @type {Vec3} */
  const probe = [...actor.body.pos];
  probe[axis] -= 0.01;
  while (probe[axis] > 0 && !shape.overlapsTerrain(probe)) {
    actor.body.pos[axis] = probe[axis];
    probe[axis] -= 0.01;
  }
  if (shape.overlapsTerrain(actor.body.pos) || !shape.overlapsTerrain(probe)) {
    throw new Error('Fixture must start free beside a wall');
  }
  sense.pos = corridor ? [right / 2, 1, 10] : [actor.body.pos[0] + 3, 1, actor.body.pos[2] + 10];
  const initial = system.snapshotState();
  const originalStep = collisionSteps(system).stepActorBody;
  const originalSide = collisionSteps(system).openSide;
  const originalPush = shape.pushOut;
  for (const [methodName, method] of Object.entries({
    stepActorBody: originalStep,
    openSide: originalSide,
    pushOut: originalPush,
  })) {
    if (typeof method !== 'function') {
      throw new Error(`Collision benchmark method ${methodName} is missing`);
    }
  }
  // Instrument the collision boundary in its own pass; whole-tick timings have no nested clocks.
  let collisionTime = 0;
  let pushes = 0;
  let collectCollision = false;
  /** @type {Record<'collision' | 'whole', number[]>} */
  const samples = { collision: [], whole: [] };
  const diagnostic = { pushes: 0, movingTicks: 0 };
  for (const mode of /** @type {const} */ (['collision', 'whole'])) {
    collectCollision = mode === 'collision';
    for (let run = -warmups; run < runs; run++) {
      const trial = createSystem();
      trial.restoreState(initial, (typeId) => (typeId === type.id ? actorType : registry.actors.get(typeId)));
      const trialSteps = collisionSteps(trial);
      trialSteps.stepActorBody = function () {
        if (!collectCollision) {
          return originalStep.call(this);
        }
        const start = process.hrtime.bigint();
        const result = originalStep.call(this);
        collisionTime += Number(process.hrtime.bigint() - start) / 1000;
        return result;
      };
      trialSteps.openSide = function (...parameters) {
        if (!collectCollision) {
          return originalSide.apply(this, parameters);
        }
        const start = process.hrtime.bigint();
        const result = originalSide.apply(this, parameters);
        collisionTime += Number(process.hrtime.bigint() - start) / 1000;
        return result;
      };
      const live = trial.store.get(id);
      if (!live) {
        throw new Error('The restored state lost the fused mass');
      }
      const liveShape = fusedMassShape(trial.shapeOf(live.body));
      liveShape.pushOut = function (...parameters) {
        const push = originalPush.apply(this, parameters);
        if (push) {
          pushes += 1;
        }
        return push;
      };
      for (let tick = 0; tick < ticks; tick++) {
        collisionTime = 0;
        pushes = 0;
        const before = [...live.body.pos];
        const start = process.hrtime.bigint();
        trial.tick(dt);
        const whole = Number(process.hrtime.bigint() - start) / 1000;
        if (run >= 0) {
          // Wall distribution includes only successful turn pushes, not cheaper ticks after contact ends.
          if (corridor || pushes > 0) {
            samples[mode].push(mode === 'collision' ? collisionTime : whole);
          }
          if (mode === 'whole') {
            diagnostic.pushes += pushes;
            diagnostic.movingTicks += Number(before[0] !== live.body.pos[0] || before[2] !== live.body.pos[2]);
          }
        }
      }
    }
  }
  if (diagnostic.movingTicks === 0) {
    throw new Error(`${name} must exercise movement`);
  }
  for (const [mode, values] of Object.entries(samples)) {
    if (values.length === 0) {
      throw new Error(`No ${name} ${mode} samples`);
    }
    console.log(
      JSON.stringify({
        scenario: name,
        mode,
        samples: values.length,
        medianUs: percentile(values, 0.5),
        p95Us: percentile(values, 0.95),
        ...diagnostic,
      }),
    );
  }
}
