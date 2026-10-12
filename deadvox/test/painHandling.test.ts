import { expect, it } from 'vitest';
import { dominantSide, offSide } from '../src/core/character.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { equipDebugLoadout } from '../src/debug/debugLoadout.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { registry } from './snapshotTestSupport.ts';

// DESIGN.md, "Pain": pain slows the hands' weapon work, while treatment keeps its pace so a hurt player can still
// stop a bleed. Both runs carry the same bleeding wound; only one also carries a fresh hit's pain.
const handlingTimes = (painful: boolean) => {
  const session = createSession({
    registry,
    world: new World(),
    isSolid: () => false,
    isOpaque: () => false,
    scale: makeScale(0.5),
    seed: 1,
    start: 0,
    spawn: [0, 0, 0],
    ready: () => false,
    controls: {
      active: () => false,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
  });
  const { sim, inventory, survival, queue, firearms } = session;
  sim.body.impact(1, 'leftArm', { bleeding: 0 });
  if (painful) {
    sim.body.impact(40, 'torso', { kind: 'cut' });
  }
  expect(equipDebugLoadout(inventory, true, true, '?loadout=pump')).toBe(true);
  const gun = inventory.hands[dominantSide(inventory.character)]!;
  expect(firearms.loadNext(gun.uid, sim.time)).toBeUndefined();
  const rag = inventory.create('rag');
  expect(inventory.add(rag, { kind: 'hand', side: offSide(inventory.character) })).toBe(true);
  expect(survival.use(rag)).toBeUndefined();
  const treatment = sim.actions.snapshotState().job;
  return {
    slowdown: sim.body.pain.effects.handlingSlowdown,
    reload: queue.jobs[0]!.duration,
    treatment: treatment?.jobType === 'treatment' ? treatment.duration : undefined,
  };
};

it('pain lengthens a reload and leaves a treatment as long as ever', () => {
  const calm = handlingTimes(false);
  const hurt = handlingTimes(true);
  expect(hurt.slowdown).toBeGreaterThan(calm.slowdown);
  expect(hurt.reload).toBeGreaterThan(calm.reload);
  expect(calm.treatment).toBeDefined();
  expect(hurt.treatment).toBe(calm.treatment);
});
