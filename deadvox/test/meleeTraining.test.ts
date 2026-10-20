import { expect, it } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { baseRegistry } from './baseRegistry.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';

const base = baseRegistry();
const melee = base.skills.get('melee_combat');
const activities = melee?.training?.activities;
if (!(melee?.training && activities?.hit && activities.block)) {
  throw new Error('Expected hit and block activities in melee training fixture');
}
const registry: Registry = {
  ...base,
  skills: new Map(base.skills).set('melee_combat', {
    ...melee,
    training: {
      ...melee.training,
      activities: {
        ...activities,
        hit: { ...activities.hit, practice: 3 },
        block: { ...activities.block, practice: 1 },
      },
    },
  }),
};
const hitActivity = registry.skills.get('melee_combat')?.training?.activities?.hit;
const blockActivity = registry.skills.get('melee_combat')?.training?.activities?.block;
if (!(hitActivity && blockActivity && hitActivity.practice !== blockActivity.practice)) {
  throw new Error('Melee training fixture must define different hit and block amounts');
}

it('awards content-authored melee practice after a landed fist hit', () => {
  let landed = false;
  const session = createSession({
    registry,
    world: new World(),
    isSolid: (_x, y) => y === 0,
    isOpaque: () => false,
    scale: makeScale(0.5),
    seed: 73,
    start: 43_200,
    spawn: [6, 8, 10],
    ready: () => false,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => {
      throw new Error('Unexpected reading in melee training fixture');
    },
    zombieEffects: {
      onMeleeResult: (result) => {
        landed = result.id !== undefined;
      },
    },
  });
  const initialPractice = session.character.practice.melee_combat ?? 0;
  const initialLevel = session.character.skills.melee_combat ?? 0;
  const player = session.body.pos;
  session.zombies.add(registry.zombies.get('shambler')!, [player[0], player[1], player[2] - 1], [0, 0, 1]);
  const hands = { right: null, left: null };

  expect(
    session.playerCombat.beginMeleeSwing({
      origin: session.chest(),
      direction: [0, 0, -1],
      weapon: FISTS_MELEE,
      profile: 'fists',
      twoHanded: false,
      hands,
    }),
  ).toBe(true);
  session.playerCombat.tick(session.playerCombat.activeMeleeAction!.contactAt, hands);

  expect(landed).toBe(true);
  expect(session.character.practice.melee_combat).toBe(initialPractice + hitActivity.practice!);
  expect(session.character.skills.melee_combat).toBe(initialLevel);
});
