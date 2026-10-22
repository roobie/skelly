import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { AMALGAM_FIGURE_SEED, amalgamCollisionEnvelope, amalgamFigureForType } from '../core/amalgamFigure.ts';
import { BlockEntities } from '../core/blockEntities.ts';
import { worldSolid } from '../core/collision.ts';
import { buildRegistry, requireDayCycle } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { dayPhaseAt } from '../core/dayPhase.ts';
import { makeScale } from '../core/scale.ts';
import { worldBricks } from '../core/solidBricks.ts';
import { World } from '../core/world.ts';
import { amalgamTypeOf } from '../core/zombieFigure.ts';
import { PLAYER, physicsFor } from '../game/player.ts';

const args = process.argv.slice(2);
if (args.length > 0 && (args.length !== 2 || args[0] !== '--shape-ref' || !/^[0-9a-f]{7,40}$/.test(args[1]))) {
  throw new Error('Usage: npm run bench:amalgam -- [--shape-ref commit-sha]');
}
const shapeUrl = new URL('../core/amalgamShape.ts', import.meta.url).href;
let substituted = false;
if (args.length > 0) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const source = stripTypeScriptTypes(
    execFileSync('git', ['-C', root, 'show', `${args[1]}:packages/deadvox/src/core/amalgamShape.ts`], {
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
const { ZombieSystem } = await import('../core/zombies.ts');
if (args.length > 0 && !substituted) {
  throw new Error('The baseline shape was not loaded');
}
const base = resolve(dirname(fileURLToPath(import.meta.url)), '../content/base');
const { registry } = buildRegistry(
  readdirSync(base)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) })),
);
const scale = makeScale(0.5);
const type = amalgamTypeOf(registry.zombies);
const envelope = amalgamCollisionEnvelope(amalgamFigureForType(type, AMALGAM_FIGURE_SEED), scale.blockSize);
const dt = 1 / 60;
const ticks = 75;
const warmups = 5;
const runs = 25;
const percentile = (samples, p) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1];

// The terrain is a real World read through worldBricks, as the game reads it, so the shape pays what a brick
// read costs there. The bench has no streaming or block edits; measuring chunk construction would conflate
// collision cost with terrain admission, so the bricks are read once before timing.
const solidBlock = registry.blocks.findIndex((block, id) => id > 0 && block?.solid === true);
const arena = (solid) => {
  const world = new World();
  for (let x = -24; x < 40; x++) {
    for (let z = -24; z < 40; z++) {
      for (let y = 0; y < 12; y++) {
        if (solid(x, y, z)) {
          world.setBlock(x, y, z, solidBlock);
        }
      }
    }
  }
  const entities = new BlockEntities(registry);
  const bricks = worldBricks(world, registry, entities);
  for (let bx = -6; bx < 10; bx++) {
    for (let bz = -6; bz < 10; bz++) {
      for (let by = 0; by < 3; by++) {
        bricks.brick(bx, by, bz, { lo: 0, hi: 0 });
      }
    }
  }
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
        'stepZombieBody plus openSide (turn, physics, ground, wall and slide probes); separate pass from whole tick',
      shapeRef: args[1] ?? 'working tree',
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
  const sense = { pos: [0, 1, 0], facing: [0, 0, -1], movement: 'jogging', lit: false, lightSeenFrom: 40 };
  const createSystem = () =>
    new ZombieSystem({
      player: () => sense,
      isSolid,
      solidBricks: terrain,
      isOpaque: () => false,
      dayPhase: () => dayPhaseAt(requireDayCycle(registry), 12 * 3600),
      blockSize: scale.blockSize,
      physics: physicsFor(scale),
      jumpSpeed: PLAYER.jump,
      tuning: registry.senses.get(CORE_CONTENT_IDS.player),
      hurtPlayer: () => undefined,
      seed: 17,
    });
  const system = createSystem();
  const actorType = corridor ? type : { ...type, locomotion: 'forward' };
  const id = system.add(
    actorType,
    corridor ? [envelope.halfWidth + 1, 1.001, 0] : [0.5, 1.001, envelope.halfDepth + 1],
    [0, 0, -1],
  );
  const zombie = system.store.get(id);
  const shape = system.shapeOf(zombie.body);
  const axis = corridor ? 0 : 2;
  const probe = [...zombie.body.pos];
  probe[axis] -= 0.01;
  while (probe[axis] > 0 && !shape.overlapsTerrain(probe)) {
    zombie.body.pos[axis] = probe[axis];
    probe[axis] -= 0.01;
  }
  if (shape.overlapsTerrain(zombie.body.pos) || !shape.overlapsTerrain(probe)) {
    throw new Error('Fixture must start free beside a wall');
  }
  sense.pos = corridor ? [right / 2, 1, 10] : [zombie.body.pos[0] + 3, 1, zombie.body.pos[2] + 10];
  const initial = system.snapshotState();
  const originalStep = system.stepZombieBody;
  const originalSide = system.openSide;
  const originalPush = shape.pushOut;
  // Instrument the collision boundary in its own pass; whole-tick timings have no nested clocks.
  let collisionTime = 0;
  let pushes = 0;
  let collectCollision = false;
  const samples = { collision: [], whole: [] };
  const diagnostic = { pushes: 0, movingTicks: 0 };
  for (const mode of ['collision', 'whole']) {
    collectCollision = mode === 'collision';
    for (let run = -warmups; run < runs; run++) {
      const trial = createSystem();
      trial.restoreState(initial, (typeId) => (typeId === type.id ? actorType : registry.zombies.get(typeId)));
      trial.stepZombieBody = function () {
        if (!collectCollision) {
          return originalStep.call(this);
        }
        const start = process.hrtime.bigint();
        const result = originalStep.call(this);
        collisionTime += Number(process.hrtime.bigint() - start) / 1000;
        return result;
      };
      trial.openSide = function (...parameters) {
        if (!collectCollision) {
          return originalSide.apply(this, parameters);
        }
        const start = process.hrtime.bigint();
        const result = originalSide.apply(this, parameters);
        collisionTime += Number(process.hrtime.bigint() - start) / 1000;
        return result;
      };
      const live = trial.store.get(id);
      const liveShape = trial.shapeOf(live.body);
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
