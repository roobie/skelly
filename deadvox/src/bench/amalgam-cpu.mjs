import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { amalgamCollisionEnvelope, amalgamFigureForType, AMALGAM_FIGURE_SEED } from '../core/amalgamFigure.ts';
import { buildRegistry } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { DEFAULT_DAY_CYCLE, dayPhaseAt } from '../core/dayPhase.ts';
import { makeScale } from '../core/scale.ts';
import { testedBricks } from '../core/solidBricks.ts';
import { ZombieSystem } from '../core/zombies.ts';
import { PLAYER, physicsFor } from '../game/player.ts';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '../content/base');
const { registry } = buildRegistry(readdirSync(base).filter((file) => file.endsWith('.json')).sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) })));
const scale = makeScale(0.5);
const type = registry.zombies.get('amalgam');
const envelope = amalgamCollisionEnvelope(amalgamFigureForType(type, AMALGAM_FIGURE_SEED), scale.blockSize);
const dt = 1 / 60;
const ticks = 180;
const warmups = 5;
const runs = 25;
const percentile = (samples, p) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1];

// Cache masks, not query answers, just as worldBricks does on unchanged terrain. The bench has no streaming
// or block edits; measuring chunk construction would conflate collision cost with terrain admission.
const cachedBricks = (solid) => {
  const source = testedBricks(solid);
  const cache = new Map();
  return {
    version: 0,
    brick: (x, y, z, out) => {
      const key = `${x},${y},${z}`;
      let mask = cache.get(key);
      if (!mask) {
        mask = { lo: 0, hi: 0 };
        source.brick(x, y, z, mask);
        cache.set(key, mask);
      }
      out.lo = mask.lo;
      out.hi = mask.hi;
      return out.lo !== 0 || out.hi !== 0;
    },
  };
};

const scenarios = [
  { name: 'wall push', corridor: false },
  { name: 'snug corridor', corridor: true },
];
console.log(JSON.stringify({ method: { dt, ticks, warmups, runs, clock: 'hrtime.bigint',
  collision: 'stepZombieBody (turn settlement, physics, ground and wall lookahead); separate pass from whole tick',
  budget: 'collision p95', corridorWidth: 'realized facing -z body width plus one block',
  wallLocomotion: 'forward to exercise turning push; corridor uses authored locomotion' } }));
for (const { name, corridor } of scenarios) {
  const right = Math.ceil(envelope.halfWidth * 2 + 1);
  const solid = (x, y, z) => y === 0 || (y > 0 && (corridor ? x < 0 || x >= right : z < 0));
  const terrain = cachedBricks(solid);
  const sense = { pos: [0, 1, 0], facing: [0, 0, -1], movement: 'jogging', lit: false, lightSeenFrom: 40 };
  const createSystem = () => new ZombieSystem({
    player: () => sense, isSolid: solid, solidBricks: terrain, isOpaque: () => false,
    dayPhase: () => dayPhaseAt(DEFAULT_DAY_CYCLE, 12 * 3600), blockSize: scale.blockSize,
    physics: physicsFor(scale), jumpSpeed: PLAYER.jump, tuning: registry.senses.get(CORE_CONTENT_IDS.player),
    hurtPlayer: () => undefined, seed: 17,
  });
  const system = createSystem();
  const actorType = corridor ? type : { ...type, locomotion: 'forward' };
  const id = system.add(actorType, corridor ? [envelope.halfWidth + 1, 1.001, 0] : [0.5, 1.001, envelope.halfDepth + 1], [0, 0, -1]);
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
      trial.restoreState(initial, (typeId) => typeId === type.id ? actorType : registry.zombies.get(typeId));
      trial.stepZombieBody = function () {
        if (!collectCollision) return originalStep.call(this);
        const start = process.hrtime.bigint();
        const result = originalStep.call(this);
        collisionTime += Number(process.hrtime.bigint() - start) / 1000;
        return result;
      };
      const live = trial.store.get(id);
      const liveShape = trial.shapeOf(live.body);
      liveShape.pushOut = function (...args) {
        const push = originalPush.apply(this, args);
        if (push) pushes++;
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
          // Wall distribution includes only ticks with a successful turn push, not the cheaper ticks after it.
          if (corridor || pushes > 0) samples[mode].push(mode === 'collision' ? collisionTime : whole);
          if (mode === 'whole') {
            diagnostic.pushes += pushes;
            diagnostic.movingTicks += Number(before[0] !== live.body.pos[0] || before[2] !== live.body.pos[2]);
          }
        }
      }
    }
  }
  if (diagnostic.movingTicks === 0) throw new Error(`${name} must exercise movement`);
  for (const [mode, values] of Object.entries(samples)) {
    if (values.length === 0) throw new Error(`No ${name} ${mode} samples`);
    console.log(JSON.stringify({ scenario: name, mode, samples: values.length,
      medianUs: percentile(values, 0.5), p95Us: percentile(values, 0.95), ...diagnostic }));
  }
}
