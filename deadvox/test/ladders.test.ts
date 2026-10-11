import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { HARD_LANDING_METRES } from '../src/core/footsteps.ts';
import { pickFurniture } from '../src/core/furniturePick.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { pieceSize } from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { type MoveIntent, PLAYER } from '../src/game/player.ts';
import { createSession, IDLE } from '../src/game/session.ts';

const BASE = 'src/content/base';
const { registry, issues } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}

const scale = makeScale(0.5);
const FACING_EAST = -Math.PI / 2;
const FACING_WEST = Math.PI / 2;
const ladderSize = (facing: 'w') => pieceSize(registry.furniture.get('ladder')!.size, facing);
const hatchSize = (facing: 'w') => pieceSize(registry.furniture.get('roof_hatch')!.size, facing);
/** Frames at 60 Hz for a climb of `blocks` with time to spare for the walk to and from it. */
const climbFrames = (blocks: number): number =>
  Math.ceil(
    ((blocks * scale.blockSize) / registry.furniture.get('ladder')!.climbable!.speedMetresPerSimSecond + 3) * 60,
  );
type Runtime = ReturnType<typeof makeRuntime>;
/** Advances until the body stands at `height` or the frames run out, so it doesn't walk on off the far side. */
const advanceUntilStandingAt = (runtime: Runtime, height: number, frames: number): void => {
  const { body } = runtime.session;
  for (let frame = 0; frame < frames && !(body.onGround && Math.abs(body.pos[1] - height) < 1e-3); frame++) {
    runtime.advance(1);
  }
};

const makeRuntime = (terrain: SolidAt, spawn: Vec3, entities: BlockEntities) => {
  let intent: MoveIntent = { ...IDLE };
  let yaw = FACING_EAST;
  const sounds: string[] = [];
  const isSolid: SolidAt = (x, y, z) => terrain(x, y, z) || entities.isSolid(x, y, z);
  const session = createSession({
    registry,
    world: new World(),
    entities,
    isSolid,
    isOpaque: isSolid,
    scale,
    seed: 73,
    start: 43_200,
    spawn,
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => intent,
      readyHeld: () => false,
      consumeCrouchToggle: () => false,
      yaw: () => yaw,
      pitch: () => 0,
      walking: () => intent.walk,
      descending: () => false,
    },
    audio: {
      play: ({ event }) => {
        sounds.push(event);
      },
    },
    notice: () => undefined,
    refusal: () => undefined,
    onRead: () => undefined,
  });
  return {
    session,
    sounds,
    advance: (frames: number) => {
      for (let i = 0; i < frames; i++) {
        session.frame(1 / 60);
      }
    },
    set: (next: MoveIntent, facing = yaw) => {
      intent = next;
      yaw = facing;
    },
  };
};

/**
 * A windowless block house whose flat roof stands higher than a hard landing, with a ladder of pieces against its
 * west wall that ends a step below the roof, as authored ladders do.
 */
const roofHeight = Math.ceil(HARD_LANDING_METRES / scale.blockSize) + 2;
const house: SolidAt = (x, y, z) => y === 0 || (x >= 0 && x < 8 && y >= 1 && y < 1 + roofHeight && z >= -4 && z < 6);
const roofTop = 1 + roofHeight;
const houseWithLadder = (spawn: Vec3) => {
  const entities = new BlockEntities(registry);
  for (let y = 1; y < roofTop - 1; y++) {
    entities.add({ type: 'ladder', pos: [-1, y, 0], size: ladderSize('w'), facing: 'w' });
  }
  return makeRuntime(house, spawn, entities);
};

describe('ladders', () => {
  it('climbs a ladder walked into and steps off its top onto the roof it serves', () => {
    const runtime = houseWithLadder([-3, 1, 1]);
    runtime.set({ ...IDLE, forward: 1, walk: true });
    advanceUntilStandingAt(runtime, roofTop, climbFrames(roofHeight));
    const { body } = runtime.session;
    expect(body.onGround).toBe(true);
    expect(body.pos[1]).toBeCloseTo(roofTop, 3);
    expect(body.pos[0] + body.halfWidth).toBeGreaterThan(0);
  });

  it('climbs back down from the roof, which is no fall', () => {
    const runtime = houseWithLadder([1, roofTop, 1]);
    runtime.set({ ...IDLE, forward: 1, walk: true }, FACING_WEST);
    runtime.advance(climbFrames(roofHeight));
    const { body } = runtime.session;
    expect(body.onGround).toBe(true);
    expect(body.pos[1]).toBeCloseTo(1, 3);
    expect(runtime.sounds).not.toContain('player_landing_hard');
  });

  it('lets go while jump is held', () => {
    const runtime = houseWithLadder([-3, 1, 1]);
    runtime.set({ ...IDLE, forward: 1, walk: true });
    const { body } = runtime.session;
    for (let frame = 0; frame < climbFrames(roofHeight) && body.pos[1] < roofTop - 3; frame++) {
      runtime.advance(1);
    }
    expect(body.pos[1]).toBeGreaterThanOrEqual(roofTop - 3);
    runtime.set({ ...IDLE, jump: true });
    runtime.advance(1);
    const [, letGo] = body.pos;
    runtime.advance(10);
    expect(body.pos[1]).toBeLessThan(letGo);
  });

  it('is not climbed by a shambler under a player on the roof', () => {
    const runtime = houseWithLadder([1, roofTop, 1]);
    const id = runtime.session.zombies.add(registry.zombies.get('shambler')!, [-3, 1, 1], [1, 0, 0]);
    runtime.advance(600);
    const shambler = runtime.session.zombies.store.get(id)!;
    // It came for the player as far as the wall, into the ladder's cells, and stayed on the ground.
    expect(shambler.body.pos[0] + shambler.body.halfWidth).toBeGreaterThan(-1);
    expect(shambler.body.pos[1]).toBeLessThan(1 + PLAYER.stepHeight / scale.blockSize);
  });
});

describe('roof hatches', () => {
  /** A slab over the ground with a hatch in it above a free-standing ladder, as in the FOB armoury. */
  const slab = 5;
  const underHatch = () => {
    const entities = new BlockEntities(registry);
    for (let y = 1; y < slab; y++) {
      entities.add({ type: 'ladder', pos: [0, y, 0], size: ladderSize('w'), facing: 'w' });
    }
    const hatch = entities.add({ type: 'roof_hatch', pos: [-1, slab, 0], size: hatchSize('w'), facing: 'w' })!;
    const terrain: SolidAt = (x, y, z) =>
      y === 0 || (y === slab && !(x >= -1 && x < 2 && z >= 0 && z < 2) && Math.abs(x) < 12 && Math.abs(z) < 12);
    return { hatch, runtime: makeRuntime(terrain, [-2, 1, 1], entities) };
  };

  it('stops the climb while shut and lets the climber out onto the roof once open', () => {
    const { hatch, runtime } = underHatch();
    const { session } = runtime;
    runtime.set({ ...IDLE, forward: 1, walk: true });
    runtime.advance(climbFrames(slab));
    expect(session.body.pos[1] + session.body.height).toBeLessThanOrEqual(slab + 1e-3);

    session.entities.setOpen(hatch, true);
    // Once its feet clear the roof, the climber steps out rather than dropping back into the hatch.
    let cleared = false;
    let droppedBack = false;
    for (let frame = 0; frame < climbFrames(slab) && !(session.body.onGround && cleared); frame++) {
      runtime.advance(1);
      cleared ||= session.body.pos[1] >= slab + 1;
      droppedBack ||= cleared && session.body.pos[1] < slab + 1 - 1e-3;
    }
    expect(session.body.onGround).toBe(true);
    expect(session.body.pos[1]).toBeCloseTo(slab + 1, 3);
    expect(droppedBack).toBe(false);
  });

  it('is picked by its panel from the ladder below while shut and from above while open', () => {
    const { hatch, runtime } = underHatch();
    const { session } = runtime;
    const pick = (origin: Vec3, direction: Vec3) =>
      pickFurniture({
        entities: session.entities,
        origin,
        direction,
        maxDistance: PLAYER.reach / scale.blockSize,
        blockSize: scale.blockSize,
        isSolid: (x, y, z) => y === slab && !session.entities.at(x, y, z),
      });
    // A climber's eye under the hatch, inside the ladder's top piece on its centre line.
    const below: Vec3 = [0.5, slab - 0.3, 1];
    expect(session.entities.defOf(session.entities.at(0, slab - 1, 1)!).climbable).toBeDefined();
    expect(pick(below, [0, 1, 0])).toBe(hatch);

    session.entities.setOpen(hatch, true);
    expect(pick(below, [0, 1, 0])).toBeUndefined();
    expect(pick([4, slab + 2, 1], [-1, 0, 0])).toBe(hatch);
  });
});
