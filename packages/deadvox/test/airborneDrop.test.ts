import { describe, expect, it } from 'vitest';
import { worldSolid } from '../src/core/collision.ts';
import { CHUNK, type Vec3 } from '../src/core/coords.ts';
import { planDisassembly } from '../src/core/disassembly.ts';
import { WORK_IN_PROGRESS } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import { dropTarget, toHands } from '../src/core/options.ts';
import type { MoveIntent } from '../src/game/player.ts';
import { IDLE } from '../src/game/session.ts';
import { advance, createRuntime, fixtureZombieColumn, type Runtime, registry, scale } from './snapshotTestSupport.ts';

const column: [number, number] = [fixtureZombieColumn[0] + 10, fixtureZombieColumn[1] + 10];

/** The centre of an empty fixture column and the height of the open block on its ground. */
const groundSpot = (): Vec3 => {
  const probe = createRuntime(undefined, false, [column]);
  const isSolid = worldSolid(probe.world, registry, probe.entities);
  const x = column[0] * CHUNK + CHUNK / 2;
  const z = column[1] * CHUNK + CHUNK / 2;
  let ground = (scale.maxCy + 1) * CHUNK;
  while (ground > scale.minCy * CHUNK && !isSolid(x, ground - 1, z)) {
    ground -= 1;
  }
  return [x + 0.5, ground, z + 0.5];
};

/** A runtime whose player jumped from level ground and is now a block above where they stood. */
const midJump = (beforeJump: (runtime: Runtime) => void): Runtime => {
  let intent: MoveIntent = IDLE;
  const runtime = createRuntime(undefined, false, [column], {
    spawn: groundSpot(),
    active: true,
    intent: () => intent,
  });
  advance(runtime, 10);
  if (!runtime.player.body.onGround) {
    throw new Error('The airborne drop fixture did not start on the ground');
  }
  beforeJump(runtime);
  const [, standing] = runtime.session.feet();
  intent = { ...IDLE, jump: true };
  for (let frame = 0; runtime.session.feet()[1] === standing; frame += 1) {
    if (frame > 60) {
      throw new Error('The jump never lifted the feet out of their standing block');
    }
    advance(runtime, 1);
  }
  intent = IDLE;
  return runtime;
};

/** A runtime whose player is falling from far enough up that the ground below is out of reach. */
const highFall = (): Runtime => {
  const [x, ground, z] = groundSpot();
  const runtime = createRuntime(undefined, false, [column], { spawn: [x, ground + 30, z], active: true });
  advance(runtime, 1);
  const landing = runtime.inventory.landing(runtime.session.feet());
  if (runtime.player.body.onGround || !landing || runtime.inventory.canReach(landing)) {
    throw new Error('The high fall fixture has no ground below it out of reach');
  }
  return runtime;
};

/** Whether the item lies in a pile whose cell is open and stands on a solid one. */
const onSurface = (runtime: Runtime, item: Item): [open: boolean, supported: boolean] => {
  const location = runtime.inventory.locate(item);
  const pos: Vec3 = location?.kind === 'pile' ? location.pile.pos : [Number.NaN, Number.NaN, Number.NaN];
  const solid = worldSolid(runtime.world, registry, runtime.entities);
  return [!solid(pos[0], pos[1], pos[2]), solid(pos[0], pos[1] - 1, pos[2])];
};

describe('airborne drop', () => {
  it('lands a drop made mid-air on the ground below, even out of reach', () => {
    const runtime = highFall();
    const { inventory } = runtime;
    const item = inventory.hands.left ?? inventory.hands.right!;
    const drop = dropTarget(inventory, item, runtime.session.feet());
    expect(inventory.move(item, drop.target).ok).toBe(true);
    expect(onSurface(runtime, item)).toEqual([true, true]);
  });

  it('lands what a two-handed wield made mid-jump puts down on the ground', () => {
    let gun: Item | undefined;
    const runtime = midJump((standing) => {
      const def = [...registry.items.values()].find(
        (candidate) => candidate.twoHanded && candidate.id !== WORK_IN_PROGRESS,
      )!;
      gun = standing.inventory.create(def.id);
      if (!standing.inventory.add(gun, { kind: 'pile', pos: standing.session.feet() })) {
        throw new Error('Could not lay the two-handed item at the feet');
      }
    });
    const { inventory, handling } = runtime;
    const held = [inventory.hands.right, inventory.hands.left].filter((item): item is Item => item !== undefined);
    expect(toHands(inventory, handling, gun!, runtime.session.feet())).toBeUndefined();
    for (let frame = 0; handling.busy; frame += 1) {
      if (frame > 3000) {
        throw new Error('The two-handed wield never finished');
      }
      advance(runtime, 1);
    }
    const putDown = held.filter((item) => inventory.locate(item)?.kind === 'pile');
    expect(putDown.length).toBeGreaterThan(0);
    expect(putDown.map((item) => onSurface(runtime, item))).toEqual(putDown.map(() => [true, true]));
  });

  it('lands the input of a work item cancelled mid-air on the ground below', () => {
    const runtime = highFall();
    const { inventory, session } = runtime;
    const feet = session.feet();
    for (const held of [inventory.hands.right, inventory.hands.left]) {
      if (held && !inventory.move(held, { kind: 'pile', pos: feet }).ok) {
        throw new Error('Could not empty the hands to start work');
      }
    }
    const def = [...registry.items.values()].find((candidate) => candidate.disassembly && !candidate.container)!;
    const source = inventory.create(def.id);
    if (!inventory.add(source, { kind: 'pile', pos: feet })) {
      throw new Error('Could not lay the item to take apart at the feet');
    }
    const plan = planDisassembly(source, session.reach(), session.character);
    const work = plan && inventory.beginWork(plan);
    expect(work).toBeDefined();
    inventory.releaseWork(work!, false, session.feet());
    expect(onSurface(runtime, source)).toEqual([true, true]);
  });
});
