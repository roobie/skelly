import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { makeScale } from '../src/core/scale.ts';
import { type SoundEmission, SoundPicker } from '../src/core/soundPicker.ts';
import { World } from '../src/core/world.ts';
import { FISTS_MELEE } from '../src/core/zombies.ts';
import { createSession, IDLE } from '../src/game/session.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const seed = 73;

it('keeps the struck shambler body pitch on player melee hits', () => {
  const played: Readonly<SoundEmission>[] = [];
  const session = createSession({
    registry,
    world: new World(),
    isSolid: (_x, y) => y === 0,
    isOpaque: () => false,
    scale: makeScale(0.5),
    seed,
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
    audio: { play: (sound) => played.push(sound) },
    notice: () => undefined,
    onRead: () => {
      throw new Error('Unexpected reading in melee sound fixture');
    },
  });
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

  const hit = played.find((sound) => sound.event === 'melee_hit_fist');
  const hurt = played.find((sound) => sound.event === 'shambler_hurt');
  expect(hit).toBeDefined();
  expect(hurt).toBeDefined();
  const reference = new SoundPicker(seed, registry.sounds);
  const unpitchedHit = reference.pick('melee_hit_fist', hit!.time)!;
  const unpitchedHurt = reference.pick('shambler_hurt', hurt!.time)!;
  expect(hurt!.pick.pitch / unpitchedHurt.pitch).not.toBeCloseTo(1);
  expect(hit!.pick.pitch / unpitchedHit.pitch).toBeCloseTo(hurt!.pick.pitch / unpitchedHurt.pitch);
});
