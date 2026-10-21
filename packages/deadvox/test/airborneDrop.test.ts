import { describe, expect, it } from 'vitest';
import { worldSolid } from '../src/core/collision.ts';
import { CHUNK, type Vec3 } from '../src/core/coords.ts';
import { dropTarget } from '../src/core/options.ts';
import type { MoveIntent } from '../src/game/player.ts';
import { IDLE } from '../src/game/session.ts';
import { advance, createRuntime, fixtureZombieColumn, registry, scale } from './snapshotTestSupport.ts';

describe('airborne drop', () => {
  it("lands a drop made mid-jump on the ground below the player's feet", () => {
    const column: [number, number] = [fixtureZombieColumn[0] + 10, fixtureZombieColumn[1] + 10];
    const probe = createRuntime(undefined, false, [column]);
    const isSolid = worldSolid(probe.world, registry, probe.entities);
    const x = column[0] * CHUNK + CHUNK / 2;
    const z = column[1] * CHUNK + CHUNK / 2;
    let ground = (scale.maxCy + 1) * CHUNK;
    while (ground > scale.minCy * CHUNK && !isSolid(x, ground - 1, z)) {
      ground -= 1;
    }
    let intent: MoveIntent = IDLE;
    const runtime = createRuntime(undefined, false, [column], {
      spawn: [x + 0.5, ground, z + 0.5],
      active: true,
      intent: () => intent,
    });
    advance(runtime, 10);
    if (!runtime.player.body.onGround) {
      throw new Error('The airborne drop fixture did not start on the ground');
    }
    const [, standing] = runtime.session.feet();
    intent = { ...IDLE, jump: true };
    for (let frame = 0; runtime.session.feet()[1] === standing; frame += 1) {
      if (frame > 60) {
        throw new Error('The jump never lifted the feet out of their standing block');
      }
      advance(runtime, 1);
    }
    const { inventory } = runtime;
    const item = inventory.hands.left ?? inventory.hands.right!;
    const drop = dropTarget(inventory, item, runtime.session.feet());
    expect(inventory.move(item, drop.target).ok).toBe(true);
    const location = inventory.locate(item);
    const pos: Vec3 = location?.kind === 'pile' ? location.pile.pos : [Number.NaN, Number.NaN, Number.NaN];
    const solid = worldSolid(runtime.world, registry, runtime.entities);
    expect([solid(pos[0], pos[1], pos[2]), solid(pos[0], pos[1] - 1, pos[2])]).toEqual([false, true]);
  });
});
