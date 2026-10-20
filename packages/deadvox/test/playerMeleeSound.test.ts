import { expect, it } from 'vitest';
import { makeScale } from '../src/core/scale.ts';
import type { SoundId } from '../src/core/soundEvents.ts';
import { type SoundEmission, SoundPicker } from '../src/core/soundPicker.ts';
import { World } from '../src/core/world.ts';
import type { MeleeWeapon } from '../src/core/zombies.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { baseRegistry } from './baseRegistry.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';

const registry = baseRegistry();
const seed = 73;

/** Lands one player swing on a shambler in front of the player and returns every sound played. */
const swingAtShambler = (weapon: MeleeWeapon): Readonly<SoundEmission>[] => {
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

  const swung = session.playerCombat.beginMeleeSwing({
    origin: session.chest(),
    direction: [0, 0, -1],
    weapon,
    profile: 'fists',
    twoHanded: false,
    hands,
  });
  if (!swung) {
    throw new Error('Player melee swing was refused');
  }
  session.playerCombat.tick(session.playerCombat.activeMeleeAction!.contactAt, hands);
  return played;
};

it('keeps the struck shambler body pitch on player melee hits', () => {
  const played = swingAtShambler(FISTS_MELEE);
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

it("plays a melee weapon's own swing, hit and hit layer instead of the shared defaults", () => {
  const shared = ['melee_swing', 'melee_hit', 'melee_hit_fist'];
  const [swingSound, hitSound, hitLayerSound] = [...registry.sounds.keys()].filter(
    (id) => !(shared.includes(id) || id.startsWith('shambler')),
  ) as SoundId[];
  const played = swingAtShambler({ ...FISTS_MELEE, swingSound, hitSound, hitLayerSound }).map((sound) => sound.event);

  expect(played).toContain('shambler_hurt');
  expect(played).toEqual(expect.arrayContaining([swingSound, hitSound, hitLayerSound]));
  expect(played.filter((event) => shared.includes(event))).toEqual([]);
});
